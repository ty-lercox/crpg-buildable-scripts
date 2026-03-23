import fs from 'node:fs';
import path from 'node:path';

import {
  CurationRecommendation,
  DEFAULT_SCAN_REPORT_PATH,
  DevAssignmentReportEntry,
  FirestoreScanReport,
  ScriptCatalogStore,
  ScriptScanReportEntry,
} from './types';
import { getArtifactsRoot, resolveRepoRoot } from './repo';
import { getSuggestedRelativeScriptDir } from './organization';
import { escapeMarkdownCell, looksLikeFirestoreAutoId, uniqueSorted } from './util';

const LEGACY_ALIAS_IDS = new Set(['chop_plam', 'npcKillRewards', 'townhall_menu', 'townhall_spire_enlistment']);

function classifyScript(scriptId: string, ownerId: string | null): { recommendation: CurationRecommendation; reasons: string[] } {
  const reasons: string[] = [];

  if (ownerId) {
    reasons.push('user-owned');
    return { recommendation: 'exclude', reasons };
  }

  if (looksLikeFirestoreAutoId(scriptId)) {
    reasons.push('random-firestore-id');
    return { recommendation: 'exclude', reasons };
  }

  if (LEGACY_ALIAS_IDS.has(scriptId)) {
    reasons.push('legacy-or-typo-id');
    return { recommendation: 'review', reasons };
  }

  if (/_showcase$/.test(scriptId) || /\.showcase$/.test(scriptId)) {
    reasons.push('showcase-variant');
    return { recommendation: 'review', reasons };
  }

  reasons.push('semantic-admin-authored-candidate');
  return { recommendation: 'import', reasons };
}

function buildDevAssignmentReport(assignments: Awaited<ReturnType<ScriptCatalogStore['listAllAssignments']>>): DevAssignmentReportEntry[] {
  const devAssignments = assignments.filter(
    (entry) => entry.scriptId.startsWith('dev:') || entry.scriptId.startsWith('local:') || entry.scriptSource !== 'firestore'
  );
  const grouped = new Map<string, { count: number; servers: Set<string> }>();

  for (const assignment of devAssignments) {
    const current = grouped.get(assignment.scriptId) ?? { count: 0, servers: new Set<string>() };
    current.count += 1;
    current.servers.add(assignment.serverId);
    grouped.set(assignment.scriptId, current);
  }

  return Array.from(grouped.entries())
    .map(([scriptId, value]) => ({
      scriptId,
      count: value.count,
      servers: Array.from(value.servers.values()).sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.scriptId.localeCompare(right.scriptId));
}

export async function scanFirestore(store: ScriptCatalogStore): Promise<FirestoreScanReport> {
  const [scripts, assignments] = await Promise.all([store.listScripts(), store.listAllAssignments()]);
  const assignmentMap = new Map<string, typeof assignments>();

  for (const assignment of assignments) {
    const bucket = assignmentMap.get(assignment.scriptId) ?? [];
    bucket.push(assignment);
    assignmentMap.set(assignment.scriptId, bucket);
  }

  const entries: ScriptScanReportEntry[] = scripts.map((entry) => {
    const usage = assignmentMap.get(entry.scriptId) ?? [];
    const { recommendation, reasons } = classifyScript(entry.scriptId, entry.record.ownerId);
    return {
      scriptId: entry.scriptId,
      title: entry.record.title,
      status: entry.record.status,
      version: entry.record.version,
      ownerId: entry.record.ownerId,
      updatedBy: entry.record.updatedBy,
      overrideIds: entry.overrideIds,
      assignmentCount: usage.length,
      assignmentServers: uniqueSorted(usage.map((item) => item.serverId)),
      recommendation,
      suggestedPath: getSuggestedRelativeScriptDir({
        scriptId: entry.scriptId,
        title: entry.record.title,
        ownerId: entry.record.ownerId,
      }),
      reasons,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    projectId: store.getProjectId(),
    scriptCount: scripts.length,
    assignmentCount: assignments.length,
    importCandidates: entries.filter((entry) => entry.recommendation === 'import').map((entry) => entry.scriptId),
    reviewCandidates: entries.filter((entry) => entry.recommendation === 'review').map((entry) => entry.scriptId),
    excludedCandidates: entries.filter((entry) => entry.recommendation === 'exclude').map((entry) => entry.scriptId),
    scripts: entries.sort((left, right) => left.scriptId.localeCompare(right.scriptId)),
    devAssignments: buildDevAssignmentReport(assignments),
  };
}

export function formatScanReportMarkdown(report: FirestoreScanReport): string {
  const lines: string[] = [];
  lines.push('# Firestore Buildable Script Scan');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Project: ${report.projectId ?? 'unknown'}`);
  lines.push(`- Scripts: ${report.scriptCount}`);
  lines.push(`- Assignments: ${report.assignmentCount}`);
  lines.push(`- Import candidates: ${report.importCandidates.length}`);
  lines.push(`- Review candidates: ${report.reviewCandidates.length}`);
  lines.push(`- Excluded candidates: ${report.excludedCandidates.length}`);
  lines.push('');

  lines.push('## Scripts');
  lines.push('');
  lines.push('| Script ID | Recommendation | Suggested Path | Owner | Assignments | Reasons |');
  lines.push('| --- | --- | --- | --- | ---: | --- |');
  for (const entry of report.scripts) {
    lines.push(
      `| ${escapeMarkdownCell(entry.scriptId)} | ${entry.recommendation} | ${escapeMarkdownCell(entry.suggestedPath)} | ${escapeMarkdownCell(entry.ownerId ?? '<null>')} | ${entry.assignmentCount} | ${escapeMarkdownCell(entry.reasons.join(', '))} |`
    );
  }

  lines.push('');
  lines.push('## Dev Or Non-Firestore Assignments');
  lines.push('');
  if (report.devAssignments.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Script ID | Count | Servers |');
    lines.push('| --- | ---: | --- |');
    for (const entry of report.devAssignments) {
      lines.push(`| ${escapeMarkdownCell(entry.scriptId)} | ${entry.count} | ${escapeMarkdownCell(entry.servers.join(', '))} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function writeScanReport(
  report: FirestoreScanReport,
  repoRoot: string = resolveRepoRoot(),
  reportPath: string = DEFAULT_SCAN_REPORT_PATH
): { jsonPath: string; markdownPath: string } {
  const resolvedJsonPath = path.isAbsolute(reportPath) ? reportPath : path.join(repoRoot, reportPath);
  const resolvedMarkdownPath = resolvedJsonPath.replace(/\.json$/i, '.md');

  fs.mkdirSync(path.dirname(resolvedJsonPath), { recursive: true });
  fs.writeFileSync(resolvedJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(resolvedMarkdownPath, formatScanReportMarkdown(report), 'utf8');
  return { jsonPath: resolvedJsonPath, markdownPath: resolvedMarkdownPath };
}

export function defaultScanReportPaths(repoRoot: string = resolveRepoRoot()): { jsonPath: string; markdownPath: string } {
  const artifactsRoot = getArtifactsRoot(repoRoot);
  return {
    jsonPath: path.join(artifactsRoot, path.basename(DEFAULT_SCAN_REPORT_PATH)),
    markdownPath: path.join(artifactsRoot, path.basename(DEFAULT_SCAN_REPORT_PATH).replace(/\.json$/i, '.md')),
  };
}
