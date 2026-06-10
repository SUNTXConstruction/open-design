#!/usr/bin/env bash
set -Eeuo pipefail

pnpm --filter @open-design/web build:sidecar
pnpm --filter @open-design/web test
