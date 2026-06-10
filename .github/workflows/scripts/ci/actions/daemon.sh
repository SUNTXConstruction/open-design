#!/usr/bin/env bash
set -Eeuo pipefail

pnpm --filter @open-design/daemon build
pnpm --filter @open-design/daemon test
