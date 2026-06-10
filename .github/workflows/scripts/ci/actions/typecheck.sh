#!/usr/bin/env bash
set -Eeuo pipefail

pnpm --filter @open-design/daemon build
pnpm --filter @open-design/desktop build
pnpm --filter @open-design/web build:sidecar
pnpm -r --filter '!open-design' --filter '!@open-design/landing-page' --workspace-concurrency=4 --if-present run typecheck
pnpm exec tsc -p scripts/tsconfig.json --noEmit
