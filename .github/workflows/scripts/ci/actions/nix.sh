#!/usr/bin/env bash
set -Eeuo pipefail

nix flake check --print-build-logs --keep-going
