# Phase 1 Notes: Foundation PR

## Implementation

<!-- Files created/modified; implementation decisions; migration inventory/classification; retained/deferred rationale; problems encountered; deviations from design -->

### Step 1: Tailwind foundations

- `apps/web/package.json` / `pnpm-lock.yaml` - added Tailwind v4 foundation dependencies: `tailwindcss`, `@tailwindcss/postcss`, and `postcss`.
- `apps/web/postcss.config.mjs` - added the web-local PostCSS config that loads `@tailwindcss/postcss`.
- `scripts/guard.ts` - allowlisted the exact PostCSS config path with a compatibility-format comment so the residual JavaScript guard continues to fail on unplanned project-owned JavaScript.
- `apps/web/src/index.css` - added Tailwind theme/utilities layered imports, kept Preflight excluded, added the local base-layer border-style reset, and recorded the cascade policy for retained element/reset rules before component migration.

### Step 2: Open Design Tailwind tokens

- `apps/web/src/index.css` - added the CSS-first `@theme` block that clears Tailwind default colors and exposes the project-approved color namespace for surfaces, borders, text, accent, semantic status, interaction overlays, radius, shadows, fonts, and exact compact UI text-size aliases.
- `apps/web/src/index.css` - added missing runtime source variables for `--accent-wash`, `--accent-foreground`, `--warning-border`, modal overlay, selection overlays, and inspect overlays so Tailwind utilities resolve through the same CSS-variable token path as existing styles.
- `apps/web/src/index.css` - documented the token utility vocabulary next to the `@theme` block, including representative border/radius/shadow examples and the no-Preflight border reset expectation for `border border-border`.
- Token resolution remains CSS-variable-first: light, dark, and system modes update the existing token variables through `:root`, `[data-theme="dark"]`, and `html:not([data-theme])`; custom accent continues to update `--accent*` variables through the pre-hydration script and `applyAppearanceToDocument()`.

### Step 3: Base style guardrails

- `scripts/guard.ts` - added the `style policy` guard check for app UI files under `apps/web/app/` and `apps/web/src/`.
- `scripts/guard.ts` - added default Tailwind palette utility rejection for classes such as `text-red-500`, `bg-white`, `border-zinc-200`, `from-orange-500`, and related color utility namespaces so app UI uses Open Design token utilities.
- `scripts/guard.ts` - added hardcoded UI color detection scaffolding for hex, `rgb()` / `rgba()`, `hsl()` / `hsla()`, and named colors. Phase 1 enforcement is wired to scoped guard fixtures while existing app hardcoded colors stay classified as migration inventory or explicit exceptions until the relevant migration slices tighten enforcement.
- `scripts/guard.ts` - added a structured hardcoded-color allowlist with path pattern, value pattern, and reason fields for global token CSS, brand/accent choices, SVG illustrations, sketch/canvas data, file/inspect/user-authored colors, legacy UI fallback colors, and tests/fixtures.
- `scripts/guard.ts` - exempted CSS-wide and special color keywords `transparent`, `currentColor` / `currentcolor`, `inherit`, `initial`, `unset`, and `revert` by semantics.

### Step 4: Migration inventory and visual comparison prep

- Migration inventory method: compared literal class tokens referenced from `apps/web/src/**/*.tsx` against class selectors defined in `apps/web/src/index.css`. Current scan covers 59 TSX files, 1,492 literal class tokens, and 1,334 literal TSX class tokens with matching `index.css` definitions. The remaining 158 literal tokens are Tailwind-ready local values, data/status words, generated strings, or classes defined outside `index.css`; migration slices must re-run the scan after rebase and classify any changed class at implementation time.
- High-volume TSX sources for global class migration:
  | Area / file | Matching `index.css` class count | Representative classes |
  | --- | ---: | --- |
  | Settings dialog and settings sections: `apps/web/src/components/SettingsDialog.tsx`, `McpClientSection.tsx`, `SkillsSection.tsx`, `MemorySection.tsx`, `DesignSystemsSection.tsx`, `PrivacySection.tsx` | 430+ | `modal-backdrop`, `modal`, `modal-settings`, `settings-chrome`, `settings-section`, `section-head`, `hint`, `agent-card`, `library-toolbar`, `filter-pill` |
  | File viewer / inspect / edit surfaces: `apps/web/src/components/FileViewer.tsx`, `ManualEditPanel.tsx`, `FileWorkspace.tsx` | 208+ | `viewer`, `viewer-toolbar`, `viewer-action`, `viewer-body`, `viewer-tab`, `manual-edit-panel-head`, `ws-tabs-shell` |
  | Project creation / project panels / examples / designs: `NewProjectPanel.tsx`, `DesignFilesPanel.tsx`, `ConnectorsBrowser.tsx`, `DesignsTab.tsx`, `ExamplesTab.tsx`, `DesignSystemsTab.tsx`, `PromptTemplatesTab.tsx` | 330+ | `newproj`, `entry`, `df-file-row`, `connector-logo`, `tab-panel-toolbar`, `design-card`, `example-card`, `ds-card` |
  | Shell, chat, composer, common controls: `ProjectView.tsx`, `AppChromeHeader.tsx`, `ChatPane.tsx`, `ChatComposer.tsx`, `AssistantMessage.tsx`, `EntryView.tsx`, `ConversationsMenu.tsx`, `AvatarMenu.tsx`, `QuickSwitcher.tsx` | 230+ | `app`, `app-chrome-header`, `pane`, `chat-log`, `composer-shell`, `msg`, `assistant`, `entry-shell`, `conv-menu`, `avatar-popover`, `qs-palette` |
  | Sketch, runtime, pet, loading, feedback, modals: `SketchEditor.tsx`, `PetRail.tsx`, `PetSettings.tsx`, `PetOverlay.tsx`, `Loading.tsx`, `ToolCard.tsx`, `MessageFeedback.tsx`, `PromptTemplatePreviewModal.tsx`, `QuestionForm.tsx`, `runtime/markdown.tsx` | 190+ | `sketch-editor`, `pet-rail`, `pet-codex-thumb`, `loading-spinner`, `skeleton-shimmer`, `op-card`, `message-feedback`, `prompt-template-modal`, `md-p` |
- Class classification:
  | Classification | Current inventory | Migration action |
  | --- | --- | --- |
  | Component-level migratable styles | Most referenced global classes, including app shell, settings, project panels, viewer chrome, chat/composer, cards, buttons, popovers, modals, pet UI, sketch editor chrome, live artifact cards, and status surfaces. | Replace with static token-first Tailwind utility strings during the owning phase, then delete the migrated selector from `index.css`. Use `token.md` aliases such as `bg-panel`, `text-muted`, `border-border`, `rounded-card`, `rounded-panel`, `rounded-token-pill`, `shadow-token-sm`, `shadow-token-md`, `font-mono`, and exact `text-ui-*` sizes when needed for parity. |
  | Global base styles | `:root` tokens, theme overrides, `*`, `html, body, #root`, `body`, shared `input` / `textarea` / `select`, and content-neutral `code`. Sources: `apps/web/src/index.css:1-306,367-428`. | Retain as global/token source or move into `@layer base` before affected utilities migrate. Component slices may remove/constrain base selectors when they would override migrated utility properties. |
  | Loading shell | `od-loading-shell`, used by the client-only loading path. Sources: `apps/web/app/[[...slug]]/client-app.tsx:5-13`; `apps/web/src/index.css:308-315`. | Retain global because it renders before the SPA tree is available. Token utility migration happens inside loaded TSX components. |
  | Keyframes / animation | `skeleton-shimmer`, modal/settings transitions, spinner rules, and keyframes. Representative source: `apps/web/src/components/Loading.tsx:42`; `apps/web/src/index.css:1121-1143,12049`. | Retain keyframes globally. Migrate the element box/color/layout class around an animation to Tailwind while keeping the animation name global until a later animation utility strategy exists. |
  | Content-level / third-party boundary styles | Markdown/runtime/viewer content classes such as `markdown-rendered`, `markdown-status`, `prose-block`, `viewer-source`, `viewer-body`, `viewer-empty`, `md-p`, `md-code`, and file/rendering boundaries. Sources: `apps/web/src/components/FileViewer.tsx:6407-6412`; `apps/web/src/runtime/markdown.tsx:112-196`; `apps/web/src/index.css:9754-9779,10149-10153`. | Retain or migrate only the app chrome around the boundary. User-authored content, generated HTML, syntax/file previews, iframes, and external documents stay in retained exception scopes. |
  | Retained exceptions | Brand icons, SVG illustrations, sketch/canvas user data, user accent controls, file/user-authored colors, test fixtures, and token definitions. Sources: `scripts/guard.ts:503-534`. | Keep a narrow allowlist entry with a path pattern, value pattern, and reason. Revisit each exception in its owning migration phase. |
- Unlayered selector resolution before migration:
  | Selector | Source | Resolution |
  | --- | --- | --- |
  | `button`, `button.primary`, `button.primary-ghost`, `button.ghost`, `button.subtle`, `button.icon-btn`, `button:disabled` | `apps/web/src/index.css:317-365` | Phase 2 migrates button variants to token utilities. Move shared reset-only behavior such as `font: inherit`, focus outline, disabled opacity/cursor into `@layer base` or a constrained primitive scope; remove variant visuals from global CSS after TSX callers migrate. |
  | `input`, `textarea`, `select`, placeholder/focus/select chevron rules | `apps/web/src/index.css:367-419` | Phase 2 migrates controls where they are component chrome. Retain native select chevron/base reset in `@layer base` or constrain by form scope before utility-driven inputs rely on their own borders, radius, padding, and focus rings. |
  | `code` | `apps/web/src/index.css:421-428` | Treat as content/base code styling; migrate component-local code chips to Tailwind utilities and retain global `code` only for rich-text/content boundaries. |
- Token-first migration note patterns for component classes:
  | Existing visual pattern | Utility combination to prefer |
  | --- | --- |
  | Panel/card surfaces with border, radius, shadow | `bg-panel border border-border rounded-card shadow-token-sm text-text` or `bg-elevated rounded-panel shadow-token-md` for overlays |
  | Muted copy, labels, metadata, hints | `text-muted`, `text-soft`, `text-faint`, plus `text-ui-11`, `text-ui-12_5`, or `text-xs` based on measured parity |
  | Primary/accent actions | `bg-accent text-accent-foreground border border-accent hover:bg-accent-hover rounded-control` |
  | Ghost/subtle controls | `bg-transparent text-text border border-border hover:bg-control-hover hover:border-border-strong rounded-control` or `bg-subtle hover:bg-control-active` |
  | Status pills and banners | `bg-success-surface text-success border-success-border`, `bg-info-surface text-info border-info-border`, `bg-danger-surface text-danger border-danger-border`, `bg-warning-surface text-warning border-warning-border` |
  | Inspect/comment overlays | `bg-selection-overlay border-selection-outline ring-selection-outline` and `bg-inspect-overlay` |
  | Popovers/modals | `bg-elevated text-text border border-border rounded-panel shadow-token-lg` plus `bg-overlay` for scrims |
  | Code/file path text | `font-mono text-ui-12_5 bg-subtle text-text rounded-control` unless the content boundary needs retained global rich-text CSS |
- Style guard allowlist and promotion policy:
  | Scope | Pattern | Reason / follow-up |
  | --- | --- | --- |
  | `apps/web/src/index.css` | Hex, RGB(A), HSL(A) | CSS variable token definitions, shadows, overlays, and retained migration inventory remain the source of truth until cleanup. |
  | `AgentIcon`, `PaletteTweaks`, `PetSettings`, `SettingsDialog` | Hex, RGB(A), HSL(A) | Brand accents, user accent choices, and legacy token fallbacks; each owning phase must either migrate to tokens or keep a narrower exception. |
  | `SketchEditor`, `SketchPreview`, `NewProjectPanel` | Hex, RGB(A), HSL(A), `none`, `currentColor`, `transparent` | Sketch/canvas user data and SVG illustrations; migrate app chrome colors, retain user/illustration data colors. |
  | `FileViewer`, `ManualEditPanel` | Hex, RGB(A), HSL(A) | User-authored file, inspect, editable style, and runtime content colors; app chrome migrates in Phase 4. |
  | `MemorySection`, `MemoryModelInline`, `MemoryToast` | Hex, RGB(A), HSL(A) | Legacy memory UI fallback colors; migrate or narrow in the settings/project phases. |
  | `apps/web/tests/` | Any | Tests and fixtures may assert rejected colors explicitly. |
  | Repeated arbitrary app UI colors | Any unregistered hardcoded color after the second real app UI use | Promote to a named Open Design token before migration. One-off brand/user-content/illustration data keeps a reasoned allowlist entry. |
- Inventory verification: the Step 4 scan produced complete coverage for literal class tokens by cross-checking TSX references against `index.css` class selector definitions. Migration slices remain responsible for dynamic class maps and classes changed after rebase.

### Implementation requirements

- Tailwind no-Preflight setup must use the official layered CSS imports in `apps/web/src/index.css`:
  ```css
  @layer theme, base, utilities;
  @import "tailwindcss/theme.css" layer(theme);
  @import "tailwindcss/utilities.css" layer(utilities);

  @layer base {
    *, ::before, ::after, ::backdrop, ::file-selector-button {
      border: 0 solid;
    }
  }
  ```
- Keep Preflight excluded in Phase 1 and retain the project-owned border reset from Tailwind's Preflight contract in the base layer so `border border-*` token utilities render solid borders from the later utilities layer.
- Record the cascade-layer policy for retained `index.css` element/reset rules: any rule that can override migrated Tailwind utilities must move into `@layer base`, be constrained to non-migrated scopes, or be removed before the affected component migration lands.

## Verification

<!-- Commands run and results; screenshot artifact links/paths; exact baseline/development startup parameters or full commands; baseline/development service URLs; baseline/development namespace names; agent comparison scenario coverage; theme/accent matrix covered; observed drift; approved deviations -->

- `pnpm install` - passed; pnpm emitted existing workspace bin/link warnings for missing daemon dist CLI during install.
- `pnpm guard` - passed; residual JavaScript allowlist accepts `apps/web/postcss.config.mjs`.
- `pnpm --filter @open-design/web build` - passed with Next.js 16/Turbopack.
- `pnpm --filter @open-design/web build` - passed after adding the Open Design `@theme` token aliases and source variables.
- `pnpm guard` - passed after adding the style policy check; known Phase 1 hardcoded color migration inventory remains classified and does not fail the guard.
- Temporary sample `apps/web/src/__guard_tailwind_palette_sample.tsx` with `className="text-red-500"` plus temporary sample `scripts/guard-style-policy-fixtures/hardcoded-color-sample.tsx` with `color: "#ff0000"` made `pnpm guard` fail with both expected style policy violations; the sample also included `transparent`, `currentColor`, `currentcolor`, `inherit`, `initial`, `unset`, and `revert`, which stayed exempt. Temporary samples were removed.
- Temporary sample `scripts/guard-style-policy-fixtures/named-color-sample.tsx` with `color: "red"` made `pnpm guard` fail with the expected unregistered named color violation while CSS-wide/special keywords in the same fixture stayed exempt. Temporary sample was removed.
- `pnpm guard` - passed after removing the temporary style policy samples.
- `pnpm --filter @open-design/web test` - passed; 99 files / 925 tests.
- `pnpm typecheck` - passed.
- `pnpm guard` - passed after adding the Step 4 migration inventory and guard allowlist policy notes.
- `pnpm typecheck` - passed after adding the Step 4 documentation.
- `pnpm --filter @open-design/web test` - passed; 99 files / 925 tests.
- `pnpm --filter @open-design/web build` - passed with Next.js 16/Turbopack.
