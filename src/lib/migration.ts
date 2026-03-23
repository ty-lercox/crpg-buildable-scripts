import fs from 'node:fs';
import path from 'node:path';

import {
  BuildableScriptAssignmentUsage,
  DEFAULT_MIGRATION_REPORT_PATH,
  ScriptCatalogStore,
  ScriptIdMigrationManifest,
  ScriptIdMigrationPlan,
  ScriptIdMigrationPlanEntry,
  ScriptIdMigrationResult,
} from './types';
import { normalizeText, uniqueSorted } from './util';
import { resolveRepoFile, resolveRepoRoot } from './repo';

export const DEFAULT_MIGRATION_MANIFEST_PATH = 'imports/script-id-migration.json';

function resolveAssignmentPath(entry: BuildableScriptAssignmentUsage): string {
  return normalizeText(entry.assignmentPath) || `servers/${entry.serverId}/buildableScripts/${entry.buildableActorId}`;
}

export function readScriptIdMigrationManifest(manifestPath: string): ScriptIdMigrationManifest {
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  const migrations = Array.isArray(raw.migrations) ? raw.migrations : [];
  return {
    migrations: migrations.map((entry) => {
      const rawEntry = entry as Record<string, unknown>;
      return {
        oldScriptId: normalizeText(rawEntry.oldScriptId),
        newScriptId: normalizeText(rawEntry.newScriptId),
      };
    }),
  };
}

export function validateScriptIdMigrationManifest(manifest: ScriptIdMigrationManifest, manifestPath: string): void {
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length === 0) {
    throw new Error(`Migration manifest contains no migrations: ${manifestPath}`);
  }

  const seenOldIds = new Set<string>();
  const seenNewIds = new Set<string>();
  for (const entry of manifest.migrations) {
    if (!entry.oldScriptId) {
      throw new Error(`Missing oldScriptId in migration manifest: ${manifestPath}`);
    }
    if (!entry.newScriptId) {
      throw new Error(`Missing newScriptId in migration manifest: ${manifestPath}`);
    }
    if (entry.oldScriptId === entry.newScriptId) {
      throw new Error(`oldScriptId and newScriptId must differ: ${entry.oldScriptId}`);
    }
    if (seenOldIds.has(entry.oldScriptId)) {
      throw new Error(`Duplicate oldScriptId detected: ${entry.oldScriptId}`);
    }
    if (seenNewIds.has(entry.newScriptId)) {
      throw new Error(`Duplicate newScriptId detected: ${entry.newScriptId}`);
    }
    seenOldIds.add(entry.oldScriptId);
    seenNewIds.add(entry.newScriptId);
  }
}

export function readMigrationManifest(repoRoot: string, manifestPath?: string): ScriptIdMigrationManifest {
  const resolvedPath = resolveRepoFile(
    repoRoot,
    manifestPath ?? DEFAULT_MIGRATION_MANIFEST_PATH,
    'Migration manifest'
  );
  return readScriptIdMigrationManifest(resolvedPath);
}

export async function planScriptIdMigration(
  store: ScriptCatalogStore,
  manifest: ScriptIdMigrationManifest,
  options?: { manifestPath?: string | null }
): Promise<ScriptIdMigrationPlan> {
  validateScriptIdMigrationManifest(manifest, options?.manifestPath ?? '<memory>');
  const existingScripts = await store.listScripts();
  const existingScriptIds = new Set(existingScripts.map((entry) => entry.scriptId));

  const migrations: ScriptIdMigrationPlanEntry[] = [];
  for (const entry of manifest.migrations) {
    const assignments = await store.listAssignmentsByScript(entry.oldScriptId);
    const assignmentPaths = assignments.map(resolveAssignmentPath);
    const affectedServers = uniqueSorted(assignments.map((assignment) => assignment.serverId));
    const reasons: string[] = [];
    let ready = true;

    if (existingScriptIds.has(entry.newScriptId)) {
      ready = false;
      reasons.push('new-script-id-already-exists');
    }
    if (assignments.length === 0) {
      reasons.push('no-assignments-to-update');
    }

    migrations.push({
      oldScriptId: entry.oldScriptId,
      newScriptId: entry.newScriptId,
      assignmentCount: assignments.length,
      assignmentPaths,
      affectedServers,
      reasons,
      ready,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    projectId: store.getProjectId(),
    manifestPath: options?.manifestPath ?? null,
    migrations,
  };
}

export async function applyScriptIdMigration(
  store: ScriptCatalogStore,
  manifest: ScriptIdMigrationManifest,
  options?: { dryRun?: boolean; updatedBy?: string | null; manifestPath?: string | null }
): Promise<ScriptIdMigrationResult> {
  const plan = await planScriptIdMigration(store, manifest, { manifestPath: options?.manifestPath ?? null });
  const dryRun = options?.dryRun !== false;
  const updatedBy = normalizeText(options?.updatedBy) || 'github-sync';

  let changedCount = 0;
  let assignmentUpdateCount = 0;
  let refreshRequestCount = 0;

  if (!dryRun) {
    for (const migration of plan.migrations) {
      if (!migration.ready) {
        continue;
      }

      const assignments = await store.listAssignmentsByScript(migration.oldScriptId);
      if (assignments.length === 0) {
        continue;
      }

      for (const assignment of assignments) {
        await store.updateAssignment(resolveAssignmentPath(assignment), {
          scriptId: migration.newScriptId,
        });
        assignmentUpdateCount += 1;
      }

      for (const serverId of migration.affectedServers) {
        await store.addRefreshRequest({
          scriptId: migration.newScriptId,
          serverId,
          status: 'pending',
          createdBy: updatedBy,
        });
        refreshRequestCount += 1;
      }

      changedCount += 1;
    }
  } else {
    changedCount = plan.migrations.filter((migration) => migration.ready && migration.assignmentCount > 0).length;
  }

  return {
    generatedAt: new Date().toISOString(),
    projectId: plan.projectId,
    dryRun,
    updatedBy,
    changedCount,
    assignmentUpdateCount,
    refreshRequestCount,
    migrations: plan.migrations,
  };
}

export function formatScriptIdMigrationPlan(plan: ScriptIdMigrationPlan): string {
  const lines = [`[migrate-script-ids] migrations=${plan.migrations.length} project=${plan.projectId ?? 'unknown'}`];
  for (const migration of plan.migrations) {
    lines.push(
      `[migrate-script-ids] ${migration.oldScriptId} -> ${migration.newScriptId} assignments=${migration.assignmentCount} ready=${String(
        migration.ready
      )} reasons=${migration.reasons.join(',') || 'none'}`
    );
  }
  return lines.join('\n');
}

export function formatScriptIdMigrationResult(result: ScriptIdMigrationResult): string {
  const lines = [
    `[migrate-script-ids] ${result.dryRun ? 'dry-run' : 'apply'} changed=${result.changedCount} assignmentUpdates=${result.assignmentUpdateCount} refresh=${result.refreshRequestCount}`,
  ];
  for (const migration of result.migrations) {
    lines.push(
      `[migrate-script-ids] ${migration.oldScriptId} -> ${migration.newScriptId} assignments=${migration.assignmentCount} ready=${String(
        migration.ready
      )} reasons=${migration.reasons.join(',') || 'none'}`
    );
  }
  return lines.join('\n');
}

export function writeScriptIdMigrationReport(
  result: ScriptIdMigrationResult,
  repoRoot: string = resolveRepoRoot(),
  reportPath: string = DEFAULT_MIGRATION_REPORT_PATH
): { jsonPath: string; markdownPath: string } {
  const resolvedJsonPath = path.isAbsolute(reportPath) ? reportPath : path.join(repoRoot, reportPath);
  const resolvedMarkdownPath = resolvedJsonPath.replace(/\.json$/i, '.md');
  fs.mkdirSync(path.dirname(resolvedJsonPath), { recursive: true });
  fs.writeFileSync(resolvedJsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(resolvedMarkdownPath, formatScriptIdMigrationResult(result), 'utf8');
  return { jsonPath: resolvedJsonPath, markdownPath: resolvedMarkdownPath };
}
