// New / edit automation modal. Drives the daemon /api/routines endpoints
// (the same backing store that the legacy Settings → Routines surface uses).
// We keep all four schedule kinds (hourly / daily / weekdays / weekly) and
// both project modes (create_each_run / reuse) reachable from one compact
// modal that matches the screenshotted Automation create surface.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  CreateRoutineRequest,
  Routine,
  RoutineProjectTarget,
  RoutineSchedule,
  Weekday,
} from '@open-design/contracts';

import { Icon } from './Icon';

type ProjectSummary = { id: string; name: string };
type ScheduleKind = RoutineSchedule['kind'];

const SCHEDULE_KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'hourly', label: 'Hourly' },
  { kind: 'daily', label: 'Daily' },
  { kind: 'weekdays', label: 'Weekdays' },
  { kind: 'weekly', label: 'Weekly' },
];

const WEEKDAY_LABELS: { value: Weekday; short: string; long: string }[] = [
  { value: 0, short: 'Sun', long: 'Sunday' },
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
];

const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
];

function detectLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function listSupportedTimezones(): string[] {
  try {
    const fn = (Intl as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === 'function') {
      const list = fn('timeZone');
      if (Array.isArray(list) && list.length > 0) {
        return list.includes('UTC') ? list : ['UTC', ...list];
      }
    }
  } catch {
    /* fall through */
  }
  return FALLBACK_TIMEZONES;
}

function tzCityLabel(timezone: string): string {
  if (timezone === 'UTC') return 'UTC';
  const last = timezone.split('/').pop() ?? timezone;
  return last.replace(/_/g, ' ');
}

function formatTime12h(time: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const mm = m[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${suffix}`;
}

export function describeScheduleSummary(schedule: RoutineSchedule): string {
  if (schedule.kind === 'hourly') {
    const mm = String(schedule.minute).padStart(2, '0');
    return `Hourly at :${mm}`;
  }
  const tz = tzCityLabel(schedule.timezone);
  if (schedule.kind === 'daily') return `Daily at ${formatTime12h(schedule.time)} · ${tz}`;
  if (schedule.kind === 'weekdays') return `Weekdays at ${formatTime12h(schedule.time)} · ${tz}`;
  const day = WEEKDAY_LABELS.find((w) => w.value === schedule.weekday)?.long ?? 'Sunday';
  return `${day} at ${formatTime12h(schedule.time)} · ${tz}`;
}

type FormState = {
  name: string;
  prompt: string;
  kind: ScheduleKind;
  minute: number;
  time: string;
  weekday: Weekday;
  timezone: string;
  mode: 'create_each_run' | 'reuse';
  projectId: string;
};

function emptyForm(): FormState {
  return {
    name: '',
    prompt: '',
    kind: 'daily',
    minute: 0,
    time: '09:00',
    weekday: 1,
    timezone: detectLocalTimezone(),
    mode: 'create_each_run',
    projectId: '',
  };
}

function formFromRoutine(routine: Routine): FormState {
  const base = emptyForm();
  base.name = routine.name;
  base.prompt = routine.prompt;
  const schedule = routine.schedule;
  if (schedule.kind === 'hourly') {
    base.kind = 'hourly';
    base.minute = schedule.minute;
  } else if (schedule.kind === 'weekly') {
    base.kind = 'weekly';
    base.weekday = schedule.weekday;
    base.time = schedule.time;
    base.timezone = schedule.timezone;
  } else {
    base.kind = schedule.kind;
    base.time = schedule.time;
    base.timezone = schedule.timezone;
  }
  if (routine.target.mode === 'reuse') {
    base.mode = 'reuse';
    base.projectId = routine.target.projectId;
  }
  return base;
}

function buildSchedule(form: FormState): RoutineSchedule {
  if (form.kind === 'hourly') return { kind: 'hourly', minute: form.minute };
  if (form.kind === 'weekly') {
    return { kind: 'weekly', weekday: form.weekday, time: form.time, timezone: form.timezone };
  }
  return { kind: form.kind, time: form.time, timezone: form.timezone };
}

export type AutomationTemplate = {
  id: string;
  category: string;
  icon: string;
  title: string;
  prompt: string;
  defaultName?: string;
};

interface Props {
  open: boolean;
  initial?: { template?: AutomationTemplate; routine?: Routine } | null;
  projects: ProjectSummary[];
  onClose: () => void;
  onSaved: (routine: Routine) => void;
}

export function NewAutomationModal({
  open,
  initial,
  projects,
  onClose,
  onSaved,
}: Props) {
  const editingId = initial?.routine?.id ?? null;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popover, setPopover] = useState<'worktree' | 'project' | 'schedule' | null>(null);
  const [showTemplateHint, setShowTemplateHint] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const timezones = useMemo(() => {
    const local = detectLocalTimezone();
    const set = new Set<string>([local, ...listSupportedTimezones()]);
    return Array.from(set);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (initial?.routine) {
      setForm(formFromRoutine(initial.routine));
    } else if (initial?.template) {
      const t = initial.template;
      setForm({
        ...emptyForm(),
        name: t.defaultName ?? t.title,
        prompt: t.prompt,
      });
    } else {
      setForm(emptyForm());
    }
    setError(null);
    setPopover(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Defer focus until inputs are mounted.
    const id = window.setTimeout(() => titleRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError('Add a title for this automation.');
      titleRef.current?.focus();
      return;
    }
    if (!form.prompt.trim()) {
      setError('Add a prompt — the agent needs something to run.');
      return;
    }
    if (form.mode === 'reuse' && !form.projectId) {
      setError('Pick a project to reuse, or switch back to a fresh worktree.');
      return;
    }
    setSubmitting(true);
    try {
      const target: RoutineProjectTarget =
        form.mode === 'reuse' && form.projectId
          ? { mode: 'reuse', projectId: form.projectId }
          : { mode: 'create_each_run' };
      const body: CreateRoutineRequest = {
        name: form.name.trim(),
        prompt: form.prompt.trim(),
        schedule: buildSchedule(form),
        target,
        enabled: true,
      };
      const isEdit = editingId !== null;
      const url = isEdit ? `/api/routines/${editingId}` : '/api/routines';
      const payload = isEdit
        ? {
            name: body.name,
            prompt: body.prompt,
            schedule: body.schedule,
            target: body.target,
          }
        : body;
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `${isEdit ? 'update' : 'create'} failed: ${res.status}`);
      }
      const json = await res.json();
      onSaved(json.routine);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const projectName = projects.find((p) => p.id === form.projectId)?.name ?? null;
  const worktreeLabel = form.mode === 'reuse' ? 'Reuse project' : 'Worktree';
  const projectLabel =
    form.mode === 'reuse' ? projectName ?? 'Select project' : 'Select project';
  const scheduleLabel = describeScheduleSummary(buildSchedule(form));

  return (
    <div
      className="automation-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={editingId ? 'Edit automation' : 'New automation'}
      data-testid="automation-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onMouseDown={() => setPopover(null)}
    >
      <form
        className="automation-modal"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="automation-modal__head">
          <input
            ref={titleRef}
            type="text"
            className="automation-modal__title-input"
            placeholder="Automation title"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-label="Automation title"
            data-testid="automation-modal-title"
          />
          <div className="automation-modal__head-actions">
            <button
              type="button"
              className="automation-modal__hint-btn"
              onClick={() => setShowTemplateHint((v) => !v)}
              aria-label="What is an automation?"
              title="Automations run a prompt on a schedule. They can create projects, kick off new conversations, refresh design systems / memory, and call any installed skill, MCP, or connector."
            >
              <Icon name="info" size={14} />
            </button>
            <span className="automation-modal__template-hint">
              {initial?.template ? `Using template: ${initial.template.title}` : 'Use template'}
            </span>
            <button
              ref={closeRef}
              type="button"
              className="automation-modal__close"
              onClick={onClose}
              aria-label="Close (Esc)"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </header>

        {showTemplateHint ? (
          <p className="automation-modal__info">
            Automations are a recurring agent task. Each run can spin up a fresh
            worktree (or reuse an existing project), pull from connectors, run
            skills, and write live artifacts. Templates below are starting
            points — edit the prompt to fit your workflow.
          </p>
        ) : null}

        <textarea
          className="automation-modal__prompt"
          placeholder="Add prompt e.g. look for crashes in $sentry"
          value={form.prompt}
          onChange={(e) => setForm({ ...form, prompt: e.target.value })}
          rows={8}
          data-testid="automation-modal-prompt"
        />

        {error ? (
          <div className="automation-modal__error" role="alert">
            {error}
          </div>
        ) : null}

        <footer className="automation-modal__foot">
          <div className="automation-modal__pills">
            <PillButton
              icon="kanban"
              active={popover === 'worktree'}
              label={worktreeLabel}
              onClick={() =>
                setPopover((p) => (p === 'worktree' ? null : 'worktree'))
              }
            >
              {popover === 'worktree' ? (
                <PopoverMenu>
                  <PopoverItem
                    selected={form.mode === 'create_each_run'}
                    onClick={() => {
                      setForm({ ...form, mode: 'create_each_run' });
                      setPopover(null);
                    }}
                    label="Fresh worktree each run"
                    hint="A new project is created every time the automation fires."
                  />
                  <PopoverItem
                    selected={form.mode === 'reuse'}
                    onClick={() => {
                      setForm({ ...form, mode: 'reuse' });
                      setPopover('project');
                    }}
                    label="Reuse an existing project"
                    hint="Each run starts a new conversation in the chosen project."
                  />
                </PopoverMenu>
              ) : null}
            </PillButton>

            <PillButton
              icon="folder"
              active={popover === 'project'}
              label={projectLabel}
              disabled={form.mode !== 'reuse'}
              onClick={() => setPopover((p) => (p === 'project' ? null : 'project'))}
            >
              {popover === 'project' && form.mode === 'reuse' ? (
                <PopoverMenu>
                  {projects.length === 0 ? (
                    <div className="automation-modal__popover-empty">
                      No projects yet. Create one first, then come back.
                    </div>
                  ) : (
                    projects.map((p) => (
                      <PopoverItem
                        key={p.id}
                        selected={form.projectId === p.id}
                        onClick={() => {
                          setForm({ ...form, projectId: p.id });
                          setPopover(null);
                        }}
                        label={p.name}
                      />
                    ))
                  )}
                </PopoverMenu>
              ) : null}
            </PillButton>

            <PillButton
              icon="history"
              active={popover === 'schedule'}
              label={scheduleLabel}
              onClick={() =>
                setPopover((p) => (p === 'schedule' ? null : 'schedule'))
              }
            >
              {popover === 'schedule' ? (
                <SchedulePopover
                  form={form}
                  setForm={setForm}
                  timezones={timezones}
                  onDone={() => setPopover(null)}
                />
              ) : null}
            </PillButton>

            <PillIcon
              icon="grid"
              title="Skills, MCP, and connectors run inside each fire. Configure them in Plugins / Integrations."
            />
            <PillIcon
              icon="link"
              title="Skills, MCP, and connectors run inside each fire. Configure them in Plugins / Integrations."
            />
          </div>

          <div className="automation-modal__actions">
            <button
              type="button"
              className="automation-modal__cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="automation-modal__submit"
              disabled={submitting}
            >
              {editingId
                ? submitting
                  ? 'Saving…'
                  : 'Save'
                : submitting
                  ? 'Creating…'
                  : 'Create'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function PillButton({
  icon,
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  icon: 'kanban' | 'folder' | 'history';
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="automation-pill__wrap">
      <button
        type="button"
        className={`automation-pill${active ? ' is-active' : ''}`}
        onClick={onClick}
        disabled={disabled}
      >
        <Icon name={icon} size={12} />
        <span>{label}</span>
        <Icon name="chevron-down" size={11} />
      </button>
      {children}
    </div>
  );
}

function PillIcon({ icon, title }: { icon: 'grid' | 'link'; title: string }) {
  return (
    <span
      className="automation-pill automation-pill--icon"
      title={title}
      aria-label={title}
    >
      <Icon name={icon} size={13} />
    </span>
  );
}

function PopoverMenu({ children }: { children: React.ReactNode }) {
  return <div className="automation-popover">{children}</div>;
}

function PopoverItem({
  selected,
  label,
  hint,
  onClick,
}: {
  selected?: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`automation-popover__item${selected ? ' is-selected' : ''}`}
      onClick={onClick}
    >
      <span className="automation-popover__check">
        {selected ? <Icon name="check" size={12} /> : null}
      </span>
      <span className="automation-popover__body">
        <span className="automation-popover__label">{label}</span>
        {hint ? <span className="automation-popover__hint">{hint}</span> : null}
      </span>
    </button>
  );
}

function SchedulePopover({
  form,
  setForm,
  timezones,
  onDone,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  timezones: string[];
  onDone: () => void;
}) {
  return (
    <div className="automation-popover automation-popover--schedule">
      <div className="automation-popover__kinds" role="tablist">
        {SCHEDULE_KINDS.map((k) => (
          <button
            type="button"
            key={k.kind}
            role="tab"
            aria-selected={form.kind === k.kind}
            className={`automation-popover__kind${form.kind === k.kind ? ' is-active' : ''}`}
            onClick={() => setForm({ ...form, kind: k.kind })}
          >
            {k.label}
          </button>
        ))}
      </div>

      {form.kind === 'hourly' ? (
        <label className="automation-popover__field">
          <span>Minute of every hour</span>
          <input
            type="number"
            min={0}
            max={59}
            step={1}
            value={form.minute}
            onChange={(e) =>
              setForm({
                ...form,
                minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)),
              })
            }
          />
        </label>
      ) : null}

      {form.kind === 'weekly' ? (
        <div className="automation-popover__weekdays">
          {WEEKDAY_LABELS.map((d) => (
            <button
              type="button"
              key={d.value}
              className={`automation-popover__weekday${form.weekday === d.value ? ' is-active' : ''}`}
              onClick={() => setForm({ ...form, weekday: d.value })}
              aria-pressed={form.weekday === d.value}
            >
              {d.short}
            </button>
          ))}
        </div>
      ) : null}

      {form.kind !== 'hourly' ? (
        <div className="automation-popover__row">
          <label className="automation-popover__field">
            <span>Time</span>
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </label>
          <label className="automation-popover__field">
            <span>Timezone</span>
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tzCityLabel(tz)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="automation-popover__done">
        <button
          type="button"
          className="automation-popover__done-btn"
          onClick={onDone}
        >
          Done
        </button>
      </div>
    </div>
  );
}
