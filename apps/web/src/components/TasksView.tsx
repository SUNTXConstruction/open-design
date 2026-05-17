// Automations tab — the unified home for routines, schedules, live artifacts,
// and Orbit. The user's saved automations are listed on top, followed by a
// curated template gallery grouped by category. Clicking a template (or
// "+ New automation") opens NewAutomationModal pre-filled with the chosen
// starting point. The persistence layer is the existing /api/routines store —
// "routine" is the implementation detail; the user-facing name is "automation".

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Routine, RoutineSchedule } from '@open-design/contracts';
import type { AppConfig } from '../types';

import { Icon } from './Icon';
import { navigate } from '../router';
import {
  NewAutomationModal,
  describeScheduleSummary,
  type AutomationTemplate,
} from './NewAutomationModal';

type ProjectSummary = { id: string; name: string };

type Modal =
  | { kind: 'create'; template?: AutomationTemplate }
  | { kind: 'edit'; routine: Routine }
  | null;

interface Props {
  config: AppConfig;
  onOpenOrbitSettings: () => void;
}

// The template catalogue is what users see first when they open Automations
// with no saved automations of their own. Each card seeds the New Automation
// modal with a sensible prompt + title so the user only has to pick a
// schedule and hit Create.
//
// Categories are deliberately broad — "Status reports", "Release prep",
// "Incidents & triage", "Live artifacts", "Knowledge & memory" — so any
// future template lands cleanly without inventing a new section.
const TEMPLATE_CATEGORIES: ReadonlyArray<{
  id: string;
  label: string;
  templates: ReadonlyArray<AutomationTemplate>;
}> = [
  {
    id: 'status-reports',
    label: 'Status reports',
    templates: [
      {
        id: 'standup-digest',
        category: 'status-reports',
        icon: '💬',
        title: "Summarize yesterday's git activity for standup.",
        defaultName: 'Standup digest',
        prompt:
          "Summarize what changed in this repository since yesterday morning. Walk the git log, group commits by area, call out anything that landed on `main`, and end with a one-paragraph status I can paste into standup.",
      },
      {
        id: 'weekly-update',
        category: 'status-reports',
        icon: '📋',
        title:
          "Synthesize this week's PRs, rollouts, incidents, and reviews into a weekly update.",
        defaultName: 'Weekly update',
        prompt:
          "Pull this week's merged PRs, deployments, incidents, and code-review activity. Write a weekly update with sections for shipped work, in-flight work, risks, and follow-ups. Link PRs and incidents inline.",
      },
      {
        id: 'pr-recap',
        category: 'status-reports',
        icon: '🗞️',
        title: "Summarize last week's PRs by teammate and theme; highlight risks.",
        defaultName: 'PR recap',
        prompt:
          "Survey the past 7 days of merged PRs. Group by teammate and by theme (feature, bugfix, refactor, infra). For each group, flag anything that touched a hot path or a forbidden surface, and surface review comments that look unresolved.",
      },
    ],
  },
  {
    id: 'release-prep',
    label: 'Release prep',
    templates: [
      {
        id: 'release-notes',
        category: 'release-prep',
        icon: '📖',
        title: 'Draft weekly release notes from merged PRs (include links when available).',
        defaultName: 'Weekly release notes',
        prompt:
          "Draft user-facing release notes covering PRs merged in the last 7 days. Group by 'New', 'Improved', 'Fixed'. Include PR links and authors when available. Keep each line user-readable, not engineer-readable.",
      },
      {
        id: 'pre-tag-check',
        category: 'release-prep',
        icon: '✅',
        title: 'Before tagging, verify changelog, migrations, feature flags, and tests.',
        defaultName: 'Pre-tag verification',
        prompt:
          'Run the pre-tag checklist: (1) confirm the changelog includes every merged PR since the last tag, (2) list every migration in the diff and flag any that lack a backfill, (3) enumerate feature flags toggled, (4) confirm the test suite passes on the candidate ref. Report each item as Pass / Needs attention with citations.',
      },
      {
        id: 'changelog-update',
        category: 'release-prep',
        icon: '✏️',
        title: "Update the changelog with this week's highlights and key PR links.",
        defaultName: 'Changelog refresh',
        prompt:
          "Open `CHANGELOG.md`, append a new entry for this week, and fill it with the merged PRs grouped by Added / Changed / Fixed. Keep the format consistent with prior entries. Surface a diff at the end for me to review.",
      },
    ],
  },
  {
    id: 'incidents-triage',
    label: 'Incidents & triage',
    templates: [
      {
        id: 'ci-failures',
        category: 'incidents-triage',
        icon: '🎯',
        title: 'Summarize CI failures and flaky tests from the last CI window; suggest top fixes.',
        defaultName: 'CI failure digest',
        prompt:
          "Pull the last 24 hours of CI runs. Group failures by test name and surface the top flakes. For each, propose the smallest fix (skip vs. quarantine vs. patch) with a one-line justification.",
      },
      {
        id: 'ci-root-cause',
        category: 'incidents-triage',
        icon: '💻',
        title: 'Check CI failures; group by likely root cause and suggest minimal fixes.',
        defaultName: 'CI triage',
        prompt:
          'Walk the most recent failing CI runs. Cluster failures by likely root cause (environment, flake, real regression). For each cluster, propose the minimal fix and identify the owner from git blame.',
      },
    ],
  },
  {
    id: 'live-artifacts',
    label: 'Live artifacts',
    templates: [
      {
        id: 'orbit-daily',
        category: 'live-artifacts',
        icon: '🛰️',
        title: 'Daily connector digest as a live artifact you can refresh.',
        defaultName: 'Daily connector digest',
        prompt:
          'Survey every connected integration (calendar, mail, Linear, GitHub, etc.) and produce a daily digest of what changed in the last 24 hours. Save the output as a live artifact named `daily_digest.md` and update it in place on each run.',
      },
      {
        id: 'live-status-board',
        category: 'live-artifacts',
        icon: '📄',
        title: 'Keep a live status doc that updates after each run.',
        defaultName: 'Live status board',
        prompt:
          "Maintain a single live artifact named `status_board.md`. On each run, update the sections for 'In flight', 'Shipped this week', 'Risks', 'Decisions made'. Don't rewrite the file from scratch — append and edit in place so history is preserved.",
      },
    ],
  },
  {
    id: 'knowledge-memory',
    label: 'Knowledge & memory',
    templates: [
      {
        id: 'distill-feedback',
        category: 'knowledge-memory',
        icon: '🧠',
        title: 'Distill recent feedback into design-system and memory updates.',
        defaultName: 'Feedback distiller',
        prompt:
          "Pull all design feedback from the last 7 days (comments, reviews, chat). Identify recurring requests. For each, propose either a design-system update (token / component) or a memory entry (preference / convention). Write the diff as a PR-ready list.",
      },
      {
        id: 'ds-audit',
        category: 'knowledge-memory',
        icon: '🎨',
        title: 'Audit the current design system for inconsistencies; produce a fix list.',
        defaultName: 'Design-system audit',
        prompt:
          'Walk the active design system. Flag tokens that are defined but never used, components with duplicate behaviour, and pages that hand-roll patterns the DS already provides. Produce a ranked fix list with effort estimates.',
      },
    ],
  },
];

function scheduleStatusLabel(routine: Routine): string {
  if (!routine.enabled) return 'Paused';
  return describeScheduleSummary(routine.schedule);
}

function nextRunLabel(routine: Routine): string {
  if (!routine.enabled) return 'Manual only';
  if (!routine.nextRunAt) return 'Scheduled';
  const date = new Date(routine.nextRunAt);
  return `Next: ${date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
}

function describeScheduleForCard(schedule: RoutineSchedule): string {
  return describeScheduleSummary(schedule);
}

export function TasksView({ config, onOpenOrbitSettings }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  const refresh = useCallback(async () => {
    try {
      const [rRes, pRes] = await Promise.all([
        fetch('/api/routines'),
        fetch('/api/projects'),
      ]);
      if (!rRes.ok) throw new Error(`routines: ${rRes.status}`);
      const rJson = await rRes.json();
      setRoutines(rJson.routines ?? []);
      if (pRes.ok) {
        const pJson = await pRes.json();
        setProjects(
          (pJson.projects ?? []).map((p: ProjectSummary) => ({
            id: p.id,
            name: p.name,
          })),
        );
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const projectsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const runNow = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/routines/${id}/run`, { method: 'POST' });
      if (!res.ok && res.status !== 202) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `run failed: ${res.status}`);
      }
      const j = await res.json().catch(() => null);
      if (j?.projectId) {
        navigate({
          kind: 'project',
          projectId: j.projectId,
          conversationId: j.conversationId ?? null,
          fileName: null,
        });
        return;
      }
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const togglePaused = async (routine: Routine) => {
    setBusyId(routine.id);
    try {
      const res = await fetch(`/api/routines/${routine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !routine.enabled }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `update failed: ${res.status}`);
      }
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this automation? Past runs and their projects are kept.'))
      return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/routines/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `delete failed: ${res.status}`);
      }
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const orbitEnabled = config.orbit?.enabled ?? false;
  const orbitTime = config.orbit?.time ?? '08:00';

  return (
    <section className="automations-view" aria-labelledby="automations-title" data-testid="tasks-view">
      <header className="automations-view__hero">
        <div>
          <h1 id="automations-title" className="automations-view__title">
            Automations
          </h1>
          <p className="automations-view__lede">
            Automate work by setting up scheduled chats.{' '}
            <a
              href="https://github.com/anthropics/open-design"
              target="_blank"
              rel="noreferrer"
              className="automations-view__learn"
            >
              Learn more
            </a>
          </p>
        </div>
        <button
          type="button"
          className="automations-view__new"
          onClick={() => setModal({ kind: 'create' })}
          data-testid="automations-new"
        >
          <Icon name="plus" size={14} />
          <span>New automation</span>
        </button>
      </header>

      {error ? (
        <div className="automations-view__error" role="alert">
          {error}
        </div>
      ) : null}

      <OrbitCard
        enabled={orbitEnabled}
        time={orbitTime}
        onOpenSettings={onOpenOrbitSettings}
      />

      {loading ? null : routines.length > 0 ? (
        <section className="automations-saved" aria-label="Your automations">
          <h2 className="automations-section__label">Your automations</h2>
          <ul className="automations-saved__list">
            {routines.map((r) => {
              const isBusy = busyId === r.id;
              const targetLabel =
                r.target.mode === 'reuse'
                  ? `→ ${projectsById.get(r.target.projectId) ?? r.target.projectId}`
                  : '→ new project each run';
              return (
                <li
                  key={r.id}
                  className={`automation-row${r.enabled ? '' : ' is-paused'}`}
                >
                  <button
                    type="button"
                    className="automation-row__main"
                    onClick={() => setModal({ kind: 'edit', routine: r })}
                  >
                    <span className="automation-row__title">{r.name}</span>
                    <span className="automation-row__meta">
                      <span>{describeScheduleForCard(r.schedule)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{targetLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{nextRunLabel(r)}</span>
                    </span>
                    {r.prompt ? (
                      <span className="automation-row__prompt">{r.prompt}</span>
                    ) : null}
                  </button>
                  <div className="automation-row__actions">
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => runNow(r.id)}
                      disabled={isBusy}
                      title="Run now and open the new conversation"
                    >
                      <Icon name="play" size={12} />
                      <span>Run</span>
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn"
                      onClick={() => togglePaused(r)}
                      disabled={isBusy}
                    >
                      {r.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      className="automation-row__btn automation-row__btn--danger"
                      onClick={() => remove(r.id)}
                      disabled={isBusy}
                      aria-label="Delete automation"
                      title="Delete this automation"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="automations-templates">
        {TEMPLATE_CATEGORIES.map((cat) => (
          <section
            key={cat.id}
            className="automations-templates__section"
            aria-label={cat.label}
          >
            <h2 className="automations-section__label">{cat.label}</h2>
            <div className="automations-templates__grid">
              {cat.templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className="automation-template-card"
                  onClick={() => setModal({ kind: 'create', template: tpl })}
                >
                  <span className="automation-template-card__icon" aria-hidden="true">
                    {tpl.icon}
                  </span>
                  <span className="automation-template-card__title">{tpl.title}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <NewAutomationModal
        open={modal !== null}
        initial={
          modal?.kind === 'edit'
            ? { routine: modal.routine }
            : modal?.kind === 'create' && modal.template
              ? { template: modal.template }
              : null
        }
        projects={projects}
        onClose={() => setModal(null)}
        onSaved={() => {
          void refresh();
        }}
      />
    </section>
  );
}

function OrbitCard({
  enabled,
  time,
  onOpenSettings,
}: {
  enabled: boolean;
  time: string;
  onOpenSettings: () => void;
}) {
  return (
    <section className="automation-row automation-row--orbit" aria-label="Orbit">
      <div className="automation-row__main">
        <span className="automation-row__title">
          <span className="automation-row__pin" aria-hidden="true">
            <Icon name="orbit" size={14} />
          </span>
          Orbit · daily connector digest
        </span>
        <span className="automation-row__meta">
          {enabled ? (
            <>
              <span>Daily at {time}</span>
              <span aria-hidden="true">·</span>
              <span>→ writes a refreshable live artifact</span>
            </>
          ) : (
            <span>Paused — enable in Orbit settings to schedule the daily digest.</span>
          )}
        </span>
        <span className="automation-row__prompt">
          Orbit is a built-in automation that scans every connected integration once a day
          and produces a live activity summary. Use it as the canonical example of a
          live-artifact automation.
        </span>
      </div>
      <div className="automation-row__actions">
        <button
          type="button"
          className="automation-row__btn"
          onClick={onOpenSettings}
        >
          <Icon name="settings" size={12} />
          <span>{enabled ? 'Configure' : 'Enable'}</span>
        </button>
      </div>
    </section>
  );
}
