# CityRPG Buildable Scripts

This repository is the Git-backed source of truth for curated CityRPG buildable scripts that should publish into the live Firestore catalog.

## Package format

Each managed script lives in its own leaf folder under `scripts/`. The leaf folder name is always the `scriptId`, and the cleaned IDs now follow a `category.subgroup.script_name` namespace:

```text
scripts/<group>/<subgroup>/<scriptId>/script.ts
scripts/<group>/<subgroup>/<scriptId>/script.json
```

Current grouping examples:

- `scripts/gathering/starter/gathering.starter.loose_log_pickup/`
- `scripts/ui/civic/ui.civic.townhall_menu/`
- `scripts/npc/dialogue/npc.dialogue.master_at_arms_kincaid/`
- `scripts/user-owned/h6deXXhNHFGDsiqVGWDY/`

`script.json` uses this shape:

```json
{
  "scriptId": "gathering.starter.loose_log_pickup",
  "title": "Starter Gather Loose Log Pickup",
  "description": "Loose starter log pickup with hide, respawn, and inventory grant behavior.",
  "tags": ["starter", "gather", "pickup", "woodcutting"],
  "allowedApis": ["*"],
  "status": "published",
  "lifecycle": "active"
}
```

Planning-only manifest:

- `imports/cleaned-script-id-plan.json`
  Use this as the first-pass rename map from old Firestore IDs to the cleaned local IDs. It is documentation for now, not an input to the existing import CLI.

Optional local-only field:

- `legacyId: true`
  Use this only for existing Firestore docs whose IDs predate the semantic slug convention, such as old aliases or user-owned random IDs. Sync still publishes their original `scriptId`.

`lifecycle` reserves GitHub-managed ownership of an ID. When `lifecycle` is `"retired"`, sync keeps the folder in Git, writes Firestore `status: "draft"`, preserves history, and queues refresh requests for any active assignments.

## Commands

- `npm run scan-firestore -- --report artifacts/firestore-scan.json`
- `npm run import-curated -- --manifest imports/initial-curated.json`
- `npm run import-curated -- --all`
- `npm run validate-repo`
- `npm run sync-firestore -- --dry-run --report artifacts/sync-report.json`
- `npm run sync-firestore -- --apply --only starter.gather.loose_log_pickup`

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
3. Update `imports/initial-curated.json` with the exact Firestore IDs to adopt when you want to import from Firestore.
4. Run `import-curated` to materialize those scripts under grouped folders in `scripts/`.
5. Review changes in Git, then use `sync-firestore --dry-run` to confirm the repo diff before any live publish.

## Notes

- Only IDs physically present in `scripts/` are GitHub-managed.
- The sync tool never mutates unrelated Firestore script IDs.
- V1 intentionally does not rewrite live `servers/{serverId}/buildableScripts` bindings.
