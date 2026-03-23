import path from 'node:path';

import { normalizeStoredScript } from './firestore';
import { getSuggestedRelativeScriptDir } from './organization';
import {
  listExistingScriptLocations,
  readImportManifest,
  resolveRepoFile,
  resolveRepoRoot,
  writeRepoScriptPackage,
} from './repo';
import { ImportCuratedResult, SCRIPT_ID_PATTERN, ScriptCatalogStore } from './types';

export async function importCuratedScripts(
  store: ScriptCatalogStore,
  options?: { repoRoot?: string; manifestPath?: string; importAll?: boolean }
): Promise<ImportCuratedResult> {
  const repoRoot = options?.repoRoot ? path.resolve(options.repoRoot) : resolveRepoRoot();
  const existingById = listExistingScriptLocations(repoRoot);

  const scriptIds = options?.importAll
    ? (await store.listScripts()).map((entry) => entry.scriptId)
    : readImportManifest(
        resolveRepoFile(repoRoot, options?.manifestPath ?? 'imports/initial-curated.json', 'Import manifest')
      ).scriptIds;

  const imported = [];
  for (const scriptId of scriptIds) {
    const existing = normalizeStoredScript(await store.getScript(scriptId));
    if (!existing) {
      throw new Error(`Firestore script not found: ${scriptId}`);
    }

    const relativeDir = getSuggestedRelativeScriptDir({
      scriptId,
      title: existing.title,
      ownerId: existing.ownerId,
    });
    const written = writeRepoScriptPackage(
      repoRoot,
      {
        scriptId,
        title: existing.title,
        description: existing.description ?? '',
        tags: existing.tags,
        allowedApis: existing.allowedApis,
        status: existing.status,
        lifecycle: 'active',
        legacyId: !SCRIPT_ID_PATTERN.test(scriptId),
      },
      existing.scriptText,
      {
        relativeDir,
        existingScriptDir: existingById.get(scriptId) ?? null,
      }
    );

    imported.push({
      scriptId,
      scriptDir: written.scriptDir,
      action: written.action,
    });
  }

  return {
    importedCount: imported.length,
    imported,
  };
}

export function formatImportCuratedResult(result: ImportCuratedResult): string {
  const lines = [`[import-curated] imported=${result.importedCount}`];
  for (const entry of result.imported) {
    lines.push(`[import-curated] ${entry.scriptId} action=${entry.action} dir=${entry.scriptDir}`);
  }
  return lines.join('\n');
}
