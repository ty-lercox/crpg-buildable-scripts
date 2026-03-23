# Script Groups

Leaf package folders live under category folders so the repo is easier to browse in File Explorer. The cleaned local IDs now use a flatter `category.script_name` namespace.

Current grouping intent:

- `gathering/`
  - loose pickups and active mining/chopping loops
- `combat/`
  - active combat scripts
- `ui/`
  - active UI entrypoints like town hall, bank, furnace, and similar menu openers
- `debug/`
  - debug or diagnostic scripts

Legacy, duplicate, and local-only backups now live under `scripts_legacy/` so they stay out of the managed publish surface by default.

The first-pass rename map lives in [`imports/cleaned-script-id-plan.json`](/C:/Users/tycox/OneDrive/Documents/GitHub/cityrpg-buildable-scripts/imports/cleaned-script-id-plan.json).
The live assignment migration map lives in [`imports/script-id-migration.json`](/C:/Users/tycox/OneDrive/Documents/GitHub/cityrpg-buildable-scripts/imports/script-id-migration.json).

The sync tooling still publishes by `scriptId`, so local organization does not change Firestore IDs.
