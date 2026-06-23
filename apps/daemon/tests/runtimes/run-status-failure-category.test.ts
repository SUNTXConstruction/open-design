import { describe, expect, it, vi } from 'vitest';

import { createChatRunService } from '../../src/runtimes/runs.js';

// PR-1 / M2: the daemon must expose the structured failure classification
// (failureCategory + userAction) on the outward run status body, not only
// inside the run_finished analytics event. The frontend failure card (M3)
// renders a human-readable reason + CTA off these fields, so they have to
// reach the client through the ChatRunStatusResponse contract surface.
function createRuns() {
  return createChatRunService({
    createSseResponse: () => ({
      send: vi.fn(() => true),
      end: vi.fn(),
      cleanup: vi.fn(),
    }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
}

describe('run status failure classification exposure', () => {
  it('exposes failureCategory/userAction on a failed run status body', async () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'p', conversationId: 'c', agentId: 'amr' });

    const wait = runs.wait(run);
    runs.emit(run, 'error', {
      message: 'Authorization required',
      error: { code: 'AMR_AUTH_REQUIRED', message: 'Authorization required' },
    });
    runs.finish(run, 'failed', 1, null);

    expect(runs.statusBody(run)).toMatchObject({
      status: 'failed',
      failureCategory: 'auth',
      userAction: 'login',
    });
    await expect(wait).resolves.toMatchObject({
      failureCategory: 'auth',
      userAction: 'login',
    });
  });

  it('classifies an explicit user cancel as user_cancel / none', () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'p', conversationId: 'c' });

    runs.finish(run, 'canceled', null, 'SIGTERM');

    expect(runs.statusBody(run)).toMatchObject({
      status: 'canceled',
      failureCategory: 'user_cancel',
      userAction: 'none',
    });
  });

  it('leaves failureCategory/userAction null on a successful run', () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'p', conversationId: 'c' });

    runs.finish(run, 'succeeded', 0, null);

    const body = runs.statusBody(run);
    expect(body.failureCategory).toBeNull();
    expect(body.userAction).toBeNull();
  });
});
