#!/usr/bin/env bash
set -Eeuo pipefail

pnpm --filter @open-design/contracts test
pnpm --filter @open-design/host test
pnpm --filter @open-design/platform test
pnpm --filter @open-design/sidecar test
pnpm --filter @open-design/sidecar-proto test
pnpm --filter @open-design/tools-dev test
pnpm --filter @open-design/tools-pack test
