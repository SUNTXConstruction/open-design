#!/usr/bin/env bash
set -Eeuo pipefail

playwright_flags="${CI_GATE_PLAYWRIGHT_INSTALL_FLAGS:-chromium}"

# shellcheck disable=SC2086
pnpm -C e2e exec playwright install $playwright_flags
pnpm --filter @open-design/daemon build
pnpm --filter @open-design/desktop build
pnpm --filter @open-design/web build:sidecar
pnpm --filter @open-design/e2e test
pnpm -C e2e exec tsx scripts/playwright.ts clean
pnpm -C e2e run test:ui:critical
