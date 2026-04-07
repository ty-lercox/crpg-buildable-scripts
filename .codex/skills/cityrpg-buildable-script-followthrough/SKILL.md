---
name: cityrpg-buildable-script-followthrough
description: Analyze recently implemented CityRPG gameplay features and convert the missing world-facing behavior into curated buildable scripts in the cityrpg-buildable-scripts repo. Use when gameplay code, UI work, or feature plans already landed and Codex now needs to inspect the current chat and workspace context, identify what should live in buildable scripts, create or update script packages under the managed scripts folders, validate the repo, and sync the affected scriptIds to Firestore.
---

# CityRPG Buildable Script Followthrough

## Overview

Close the loop after gameplay feature work lands. Inspect the current context, derive the missing buildable-script surfaces, implement the thinnest useful scripts in this repo, validate them, and publish the exact affected script IDs to Firestore.

## Core Rule

Treat player-facing gameplay behavior as script-first whenever practical.

- Prefer buildable scripts for world interactions, menu openers, reward wrappers, pickups, civic anchors, progression triggers, and similar content logic.
- Keep reusable authority, persistence, transactions, and shared runtime systems in gameplay code or services.
- Use scripts as the gameplay surface that calls into those services instead of re-implementing the service logic in the script.
- If scripting is blocked by a missing API, identify the smallest missing API surface, land or request that substrate change, then finish the script package.

## First Pass

Read only the context needed to understand what just changed.

1. Read the current user request and the recent chat for feature summaries, plans, test results, or implementation notes.
2. Inspect the gameplay workspace that produced the feature work.
   Use `git status --short`, nearby changed files, and the most relevant tests.
3. Read this repo's local conventions:
   - [README.md](../../../../README.md)
   - [scripts/README.md](../../../../scripts/README.md)
   - one or two nearby packages such as:
     - [scripts/civic/civic.bank.vault/script.ts](../../../../scripts/civic/civic.bank.vault/script.ts)
     - [scripts/ui/ui.bank_menu/script.ts](../../../../scripts/ui/ui.bank_menu/script.ts)
   - [package.json](../../../../package.json) for validation and sync commands
4. Build a short feature-to-surface map before writing anything.

## Decide What Becomes A Script

Create or update scripts when the feature needs a world-facing entrypoint such as:

- `onInteract` menu opening or feature activation
- `onBeginPlay` registration of runtime anchors or service points
- overlap-triggered UI or state routing
- hit, damage, kill, or harvest wrappers
- pickup, chest, cache, or reward claim behavior
- progression or XP grant wrappers
- civic or law interaction surfaces

Do not move a feature into scripts when the work is primarily:

- Firestore transactions
- shared runtime state machines
- multi-player authority rules
- reusable combat, economy, or custody services
- generic APIs that many scripts will call

In those cases, keep the runtime/service authoritative and make the script a thin adapter.

## Choose Script IDs And Groups

Use the repo's existing taxonomy.

- `ui/` for menu openers and similar UI entrypoints
- `civic/` for city, bank, custody, or governance anchors
- `gathering/` for harvest loops and resource nodes
- `pickup/` for portable world loot
- `reward/` for chest or cache rewards
- `progression/` for XP or advancement wrappers
- `combat/` for combat-facing world scripts
- `debug/` for diagnostics only

Name IDs as `category.script_name`.

- Prefer semantic IDs such as `ui.laundering_menu` or `civic.smuggler_service`.
- Reuse or extend an existing script when the feature is a small evolution of the same surface.
- Create a new package when the surface is meaningfully distinct in level design, ownership, or allowed APIs.

## Implement Packages

For each missing surface, create or update:

```text
scripts/<group>/<scriptId>/script.ts
scripts/<group>/<scriptId>/script.json
```

Use these rules:

- Keep `script.ts` thin and content-focused.
- Call existing buildable APIs or runtime-backed UI hooks whenever possible.
- Keep `allowedApis` minimal in `script.json`.
- Default to `status: "draft"` and `lifecycle: "active"` unless the task clearly says otherwise.
- Write accurate `title`, `description`, and tags that match the feature and search intent.
- Mirror nearby script style instead of introducing a new local convention.

When a feature implies multiple surfaces, implement the smallest coherent set.

Examples:

- a civic anchor plus a UI opener
- a resource node plus its loose pickup wrapper
- a world terminal plus a reward or progression surface it triggers

## Validate Before Publish

Always run the smallest useful validation first.

1. Run repo validation:

```powershell
Set-Location "C:\Users\tycox\OneDrive\Documents\GitHub\cityrpg-buildable-scripts"
npm run validate-repo
```

2. Run `npm test` when you changed tooling, sync behavior, repo organization logic, or anything riskier than ordinary script packages.

```powershell
Set-Location "C:\Users\tycox\OneDrive\Documents\GitHub\cityrpg-buildable-scripts"
npm test
```

3. Run a Firestore dry run for only the affected IDs.

```powershell
Set-Location "C:\Users\tycox\OneDrive\Documents\GitHub\cityrpg-buildable-scripts"
npm run sync-firestore -- --dry-run --only script.id.one,script.id.two
```

## Publish To Firestore

Assume publish is part of the job unless the current request is explicitly analysis-only.

Before publishing, ensure auth is available through one of:

- `GOOGLE_APPLICATION_CREDENTIALS`
- `BUILDABLE_SCRIPTS_FIRESTORE_SERVICE_ACCOUNT_JSON`

Optional publish metadata:

- `FIRESTORE_PROJECT_ID`
- `BUILDABLE_SCRIPTS_UPDATED_BY`

Publish only the affected IDs after the dry run is clean.

```powershell
Set-Location "C:\Users\tycox\OneDrive\Documents\GitHub\cityrpg-buildable-scripts"
npm run sync-firestore -- --apply --only script.id.one,script.id.two
```

Do not publish unrelated script IDs.

## Report Back

End with a concise handoff that includes:

- which gameplay features or flows you mapped into scripts
- which script IDs you created or updated
- which APIs or runtime hooks those scripts depend on
- which validation commands you ran
- whether Firestore sync was dry-run only or applied live
- any remaining substrate gaps that still block script-first ownership
