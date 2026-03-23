# Script ID Cleanup

This repo now keeps the buildable script catalog in grouped folders while the script IDs themselves follow a cleaner namespace.

## Naming Convention

- Use `category.subgroup.script_name` for catalog scripts.
- Keep the folder grouping aligned with the category and subgroup.
- Keep currently assigned admin scripts `published`.
- Default unassigned admin scripts to `draft`.
- Keep user-owned scripts local-only and `draft` unless they are intentionally added to the clean catalog.

## Current First Pass

- Catalog scripts are mapped in `imports/cleaned-script-id-plan.json`.
- Local-only user-owned scripts remain under `scripts/user-owned/`.
- Legacy and showcase entries are preserved, but they are grouped and renamed so they are easy to curate later.
