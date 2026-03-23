# Script ID Cleanup

This repo now keeps the active buildable script catalog in grouped folders while the script IDs themselves follow a simpler namespace.

## Naming Convention

- Use `category.script_name` for active catalog scripts.
- Keep the folder grouping aligned with the top-level category.
- Default active managed scripts to `draft` until they are intentionally republished.
- Keep legacy, duplicate, and user-owned scripts under `scripts_legacy/` unless they are intentionally added back to the clean catalog.

## Current First Pass

- Catalog scripts are mapped in `imports/cleaned-script-id-plan.json`.
- Live assignment rewrites are mapped in `imports/script-id-migration.json`.
- Legacy and local-only scripts remain under `scripts_legacy/`.
- The current active managed catalog is intentionally small and flat so it is easier to curate before any future publish.
