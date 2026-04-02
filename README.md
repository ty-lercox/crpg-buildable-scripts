# CityRPG Buildable Scripts

This repository is the Git-backed source of truth for curated CityRPG buildable scripts that should publish into the live Firestore catalog.

## Package format

Each managed script lives in its own leaf folder under `scripts/`. The leaf folder name is always the `scriptId`, and the cleaned IDs now follow a flatter `category.script_name` namespace:

```text
scripts/<group>/<scriptId>/script.ts
scripts/<group>/<scriptId>/script.json
```

Current grouping examples:

- `scripts/gathering/gathering.loose_log_pickup/`
- `scripts/gathering/gathering.tree_chop/`
- `scripts/ui/ui.townhall_menu/`
- `scripts/civic/civic.custody_intake/`
- `scripts/pickup/pickup.ore_copper/`
- `scripts/reward/reward.chest_tier_1/`
- `scripts/progression/progression.xp_mining_small/`

Legacy and local-only backups that should not publish stay outside the managed surface in `scripts_legacy/`, for example:

- `scripts_legacy/local-only/user-owned/h6deXXhNHFGDsiqVGWDY/`

`script.json` uses this shape:

```json
{
  "scriptId": "gathering.loose_log_pickup",
  "title": "Loose Log Pickup",
  "description": "Loose log pickup with hide, respawn, and inventory grant behavior.",
  "tags": ["gathering", "pickup", "woodcutting", "log"],
  "allowedApis": ["*"],
  "status": "draft",
  "lifecycle": "active"
}
```

Planning-only manifest:

- `imports/cleaned-script-id-plan.json`
  Use this as the first-pass rename map from old Firestore IDs to the cleaned local IDs.
- `imports/script-id-migration.json`
  Use this as the actual assignment-migration manifest when rewriting live `servers/{serverId}/buildableScripts` bindings to the cleaned IDs.

Optional local-only field:

- `legacyId: true`
  Use this only for existing Firestore docs whose IDs predate the semantic slug convention, such as old aliases or user-owned random IDs. Sync still publishes their original `scriptId`.

`lifecycle` reserves GitHub-managed ownership of an ID. When `lifecycle` is `"retired"`, sync keeps the folder in Git, writes Firestore `status: "draft"`, preserves history, and queues refresh requests for any active assignments.

## Commands

- `npm run scan-firestore -- --report artifacts/firestore-scan.json`
- `npm run import-curated -- --manifest imports/initial-curated.json`
- `npm run import-curated -- --all`
- `npm run migrate-script-ids -- --dry-run --manifest imports/script-id-migration.json`
- `npm run validate-repo`
- `npm run sync-firestore -- --dry-run --report artifacts/sync-report.json`
- `npm run sync-firestore -- --apply --only gathering.loose_log_pickup`

## Firestore auth

The tooling expects a Firebase Admin service-account file path in one of:

- `GOOGLE_APPLICATION_CREDENTIALS`
- `BUILDABLE_SCRIPTS_FIRESTORE_SERVICE_ACCOUNT_JSON`

Optional overrides:

- `FIRESTORE_PROJECT_ID`
- `BUILDABLE_SCRIPTS_UPDATED_BY`

## Adoption flow

1. Run `scan-firestore` to inspect the current catalog and assignment usage.
2. Review `imports/cleaned-script-id-plan.json` for the first-pass rename map.
3. Use `imports/script-id-migration.json` when you need to move live buildable bindings from old IDs to cleaned IDs.
4. Update `imports/initial-curated.json` with the exact Firestore IDs to adopt when you want to import from Firestore.
5. Run `import-curated` to materialize those scripts under grouped folders in `scripts/`.
6. Review changes in Git, then use `sync-firestore --dry-run` to confirm the repo diff before any live publish.

## Notes

- Only IDs physically present in `scripts/` are GitHub-managed.
- Backups under `scripts_legacy/` are intentionally excluded from publish and sync.
- The sync tool never mutates unrelated Firestore script IDs.
- V1 intentionally does not rewrite live `servers/{serverId}/buildableScripts` bindings.
