# Agent startup latency: profiling and session-reuse

Status: proposed · Parent: #3408 (run reliability) · Related: #3380, #3535

## Problem

Users report ~10s of dead time before any token appears when starting an AMR or
`claude_code` turn. This is the single most-felt latency in the product, and it
repeats on every message — it is not a one-time warm-up cost.

## What the telemetry already proves

`run_finished` carries a startup timing breakdown
(`queue_duration_ms`, `pre_spawn_duration_ms`, `process_spawn_duration_ms`,
`spawn_to_first_token_ms`, `time_to_first_token_ms`). Successful runs, rolling 7
days, p50:

| segment | AMR | claude_code |
|---|---|---|
| queue | 2 ms | 2 ms |
| pre_spawn (prompt build + env) | ~400 ms | ~465 ms |
| process_spawn | 1 ms | 2 ms |
| **spawn → first token** | **10,378 ms** | **8,150 ms** |
| time_to_first_token (total) | 11,120 ms (p90 24.8 s) | 9,063 ms (p90 34.3 s) |

The entire ~10s lives in `spawn_to_first_token`. Queue, spawn, and prompt-build
together are ~0.5s and are not worth optimizing.

### Every turn pays a full cold start (confirms #3380)

If the agent CLI session were reused across a conversation, later turns would
skip session init and show a much lower TTFT. They do not. TTFT by
conversation turn ordinal (success runs, 7d, p50):

| provider | turn 1 | turn 2+ |
|---|---|---|
| **claude_code** | 8,226 ms | **9,308 ms (slightly slower)** |
| amr | 12,169 ms | 10,859 ms (~11% faster) |

`claude_code` gets **zero** reuse benefit — every message re-pays startup. This
is exactly #3380 (the Claude Code adapter spawns a new session per message
instead of resuming). AMR shows a marginal reuse benefit (its ACP runtime reuses
some state), but still sits at a ~10s baseline.

## The blind spot

`spawn_to_first_token` is a single opaque 8–10s segment. It bundles three very
different costs and we cannot currently tell which dominates:

1. **CLI cold start** — the agent binary launching to a ready state (Node/Python
   runtime load, config read).
2. **Session init** — session/`new` + ACP handshake + auth check.
3. **Model first token** — the first model call's network round-trip plus the
   provider's own first-token latency (for AMR this includes the extra vela
   gateway hop).

Without splitting this segment we cannot target a fix, and we cannot separate a
fixable cold-start cost from an unfixable provider-side first-token cost. The
turn-ordinal result above is suggestive but confounded: a later turn carries a
larger context, so its higher TTFT could be context growth (cost 3) rather than
a re-paid cold start (cost 2). Disentangling them requires sub-instrumentation.

## Hypothesis

For `claude_code`, **session init / cold start (cost 2) dominates and is paid on
every message** because the session is not resumed (#3380). For AMR, partial
reuse exists but the baseline is still high. Resuming the CLI session should cut
the cost-2 portion on every continued turn.

## Plan

### Phase 1 — sub-instrument `spawn_to_first_token` (observability only, ships first)

Add three timestamps inside the existing startup window and emit them on
`run_finished` as new timing fields:

- `cli_ready_ms` — spawn → the CLI's first ready signal (first ACP message / first
  stdout / session-open ack, per runtime).
- `session_init_ms` — cli-ready → session established (after `session/new` or the
  resume handshake).
- `model_first_token_ms` — session-established → first model token.

These three must sum to `spawn_to_first_token_ms` (± a small unattributed
remainder we also emit, so the decomposition is auditable). No behavior change;
pure telemetry. Land this first so Phase 2 has data.

### Phase 2 — experiments (the "did we find the real cost" gate)

1. **PostHog re-cut**: rerun the turn-1 vs turn-2+ split on the new sub-segments.
   Expect `session_init_ms` flat across turns (cold start re-paid) and
   `model_first_token_ms` growing with context. This separates cost 2 from cost 3.
2. **Local A/B**: drive a daemon with the same prompt twice in one conversation,
   once forcing a fresh session and once resuming, and compare `session_init_ms`
   and TTFT. Seed only through the production HTTP API (no test backdoors).
3. Decision rule: proceed to Phase 3 only if `session_init_ms` is a material
   share of `spawn_to_first_token_ms` (target: > 30% on `claude_code`). If the
   cost is dominated by `model_first_token_ms`, the lever is provider-side and
   this line stops here with a documented finding.

### Phase 3 — fix (only if Phase 2 confirms session init dominates)

- Implement `claude_code` session resume (#3380), or adopt the conversation-scoped
  ACP session reuse from #3535, so continued turns skip session init.
- Validate: `session_init_ms` on turn-2+ drops toward zero and TTFT p50 falls.

## Validation and the QA-gate boundary

This work is **out of scope for the #3545 fixed-task QA gate**. The gate exists to
catch optimizations that trade output quality for speed or token savings.
Startup-latency profiling and session reuse do **not** change what is sent to the
model or what it returns — they only remove dead time before the same first
token — so there is no quality-regression surface. Before/after evidence is
purely `spawn_to_first_token_ms` and its sub-segments (p50/p90), plus the
turn-ordinal re-cut. Context/token reduction (#3547) is the optimization class
that *does* need the gate; it is explicitly not part of this spec.

## Out of scope

- Provider-side first-token latency, including the AMR → vela gateway extra hop.
- Token/context reduction (#3547).
- Prompt-build and spawn costs (already ~0.5s combined).

## Open questions

- What is the reliable "CLI ready" marker per runtime (claude_code, ACP agents,
  plain stdout agents)? `cli_ready_ms` needs a defensible signal, not a guess.
- Does resuming a `claude_code` session preserve enough state to be correct, or
  does it reintroduce the lost-edit-state risk noted in #3380? Phase 3 must keep
  correctness, not just speed.
