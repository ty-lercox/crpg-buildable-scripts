import fs from 'node:fs';
import path from 'node:path';

import { normalizeStoredScript } from './firestore';
import { listRepoScripts, resolveRepoRoot } from './repo';
import {
  BuildableScriptHistoryRecord,
  BuildableScriptUpsertRecord,
  DEFAULT_SYNC_REPORT_PATH,
  LoadedRepoScript,
  NormalizedStoredBuildableScriptRecord,
  ScriptCatalogStore,
  SyncOutcome,
  SyncResult,
} from './types';
import {
  arraysEqual,
  escapeMarkdownCell,
  normalizeAllowedApis,
  normalizeNullableText,
  normalizeScriptTextForDiff,
  normalizeText,
  uniqueSorted,
} from './util';
import { validateLoadedRepoScripts } from './validation';

function hasRuntimeRelevantChange(
  existing: NormalizedStoredBuildableScriptRecord | null,
  next: BuildableScriptUpsertRecord
): boolean {
  if (!existing) {
    return true;
  }

  return (
    normalizeScriptTextForDiff(existing.scriptText) !== normalizeScriptTextForDiff(next.scriptText) ||
    existing.status !== next.status ||
    !arraysEqual(existing.allowedApis, next.allowedApis)
  );
}

function hasMetadataChange(existing: NormalizedStoredBuildableScriptRecord | null, next: BuildableScriptUpsertRecord): boolean {
  if (!existing) {
    return true;
  }

  return (
    existing.title !== next.title ||
    existing.description !== next.description ||
    !arraysEqual(existing.tags, next.tags) ||
    existing.status !== next.status ||
    normalizeScriptTextForDiff(existing.scriptText) !== normalizeScriptTextForDiff(next.scriptText) ||
    !arraysEqual(existing.allowedApis, next.allowedApis) ||
    existing.language !== next.language ||
    existing.ownerId !== next.ownerId
  );
}

function createHistorySnapshot(
  existing: NormalizedStoredBuildableScriptRecord,
  updatedBy: string | null
): BuildableScriptHistoryRecord {
  return {
    title: existing.title,
    description: existing.description,
    tags: existing.tags,
    status: existing.status,
    language: 'ts',
    scriptText: existing.scriptText,
    allowedApis: existing.allowedApis,
    version: existing.version,
    updatedBy,
    ownerId: existing.ownerId,
  };
}

function createLiveRecord(script: LoadedRepoScript, existing: NormalizedStoredBuildableScriptRecord | null, updatedBy: string | null): BuildableScriptUpsertRecord {
  const draft: BuildableScriptUpsertRecord = {
    title: script.title,
    description: normalizeNullableText(script.description),
    tags: script.tags,
    status: script.effectiveStatus,
    language: 'ts',
    scriptText: script.scriptText,
    allowedApis: normalizeAllowedApis(script.allowedApis),
    version: 1,
    updatedBy,
    ownerId: existing?.ownerId ?? null,
  };

  if (!existing) {
    draft.version = 1;
    return draft;
  }

  draft.version = hasRuntimeRelevantChange(existing, draft) ? existing.version + 1 : existing.version;
  return draft;
}

function resolveUpdatedBy(raw: string | null | undefined): string | null {
  const explicit = normalizeText(raw);
  if (explicit) {
    return explicit;
  }

  const candidates = [
    process.env.BUILDABLE_SCRIPTS_UPDATED_BY,
    process.env.GITHUB_ACTOR,
    process.env.USERNAME,
    process.env.USER,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return 'github-sync';
}

export async function syncFirestoreScripts(
  store: ScriptCatalogStore,
  options?: { repoRoot?: string; onlyScriptIds?: string[]; dryRun?: boolean; updatedBy?: string | null }
): Promise<SyncResult> {
  const repoRoot = options?.repoRoot ? path.resolve(options.repoRoot) : resolveRepoRoot();
  const dryRun = options?.dryRun !== false;
  const updatedBy = resolveUpdatedBy(options?.updatedBy);
  const repoScripts = listRepoScripts(repoRoot, options?.onlyScriptIds ?? []);
  validateLoadedRepoScripts(repoScripts);

  const outcomes: SyncOutcome[] = [];
  let historyCount = 0;
  let refreshRequestCount = 0;

  for (const script of repoScripts) {
    const existing = normalizeStoredScript(await store.getScript(script.scriptId));
    const liveRecord = createLiveRecord(script, existing, updatedBy);
    const runtimeChanged = hasRuntimeRelevantChange(existing, liveRecord);
    const metadataChanged = hasMetadataChange(existing, liveRecord);
    const isCreate = !existing;

    let historyCreated = false;
    if (!dryRun && existing && runtimeChanged) {
      await store.addHistoryEntry(script.scriptId, createHistorySnapshot(existing, updatedBy));
      historyCreated = true;
      historyCount += 1;
    }

    if (!dryRun && metadataChanged) {
      await store.upsertScript(script.scriptId, liveRecord, { isCreate });
    }

    const assignments = await store.listAssignmentsByScript(script.scriptId);
    const affectedServers = uniqueSorted(assignments.map((entry) => entry.serverId));
    let createdRefreshRequests = 0;

    if (!dryRun && metadataChanged) {
      for (const serverId of affectedServers) {
        await store.addRefreshRequest({
          scriptId: script.scriptId,
          serverId,
          status: 'pending',
          createdBy: updatedBy,
        });
        createdRefreshRequests += 1;
        refreshRequestCount += 1;
      }
    }

    outcomes.push({
      scriptId: script.scriptId,
      title: script.title,
      lifecycle: script.lifecycle,
      action: metadataChanged ? (isCreate ? 'create' : 'update') : 'noop',
      version: liveRecord.version,
      runtimeChanged,
      metadataChanged,
      historyCreated,
      refreshRequestsCreated: createdRefreshRequests,
      assignmentCount: assignments.length,
      affectedServers,
      effectiveStatus: script.effectiveStatus,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    projectId: store.getProjectId(),
    dryRun,
    updatedBy,
    changedCount: outcomes.filter((entry) => entry.metadataChanged).length,
    historyCount,
    refreshRequestCount,
    outcomes,
  };
}

export function formatSyncResult(result: SyncResult): string {
  const lines = [
    `[sync-firestore] ${result.dryRun ? 'dry-run' : 'apply'} changed=${result.changedCount} history=${result.historyCount} refresh=${result.refreshRequestCount}`,
  ];
  for (const outcome of result.outcomes) {
    lines.push(
      `[sync-firestore] ${outcome.scriptId} action=${outcome.action} version=${outcome.version} runtimeChanged=${String(
        outcome.runtimeChanged
      )} refresh=${outcome.refreshRequestsCreated} assignments=${outcome.assignmentCount} status=${outcome.effectiveStatus} lifecycle=${outcome.lifecycle}`
    );
  }
  return lines.join('\n');
}

export function formatSyncResultMarkdown(result: SyncResult): string {
  const lines: string[] = [];
  lines.push('# Firestore Sync Report');
  lines.push('');
  lines.push(`- Generated: ${result.generatedAt}`);
  lines.push(`- Project: ${result.projectId ?? 'unknown'}`);
  lines.push(`- Mode: ${result.dryRun ? 'dry-run' : 'apply'}`);
  lines.push(`- Changed: ${result.changedCount}`);
  lines.push(`- History entries: ${result.historyCount}`);
  lines.push(`- Refresh requests: ${result.refreshRequestCount}`);
  lines.push('');
  lines.push('| Script ID | Action | Version | Status | Lifecycle | Assignments | Servers |');
  lines.push('| --- | --- | ---: | --- | --- | ---: | --- |');
  for (const outcome of result.outcomes) {
    lines.push(
      `| ${escapeMarkdownCell(outcome.scriptId)} | ${outcome.action} | ${outcome.version} | ${outcome.effectiveStatus} | ${outcome.lifecycle} | ${outcome.assignmentCount} | ${escapeMarkdownCell(outcome.affectedServers.join(', '))} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function writeSyncReport(
  result: SyncResult,
  repoRoot: string = resolveRepoRoot(),
  reportPath: string = DEFAULT_SYNC_REPORT_PATH
): { jsonPath: string; markdownPath: string } {
  const resolvedJsonPath = path.isAbsolute(reportPath) ? reportPath : path.join(repoRoot, reportPath);
  const resolvedMarkdownPath = resolvedJsonPath.replace(/\.json$/i, '.md');
  fs.mkdirSync(path.dirname(resolvedJsonPath), { recursive: true });
  fs.writeFileSync(resolvedJsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(resolvedMarkdownPath, formatSyncResultMarkdown(result), 'utf8');
  return { jsonPath: resolvedJsonPath, markdownPath: resolvedMarkdownPath };
}
