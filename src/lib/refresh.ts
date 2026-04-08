import { BuildableScriptAssignmentUsage, BuildableScriptRefreshRequestRecord, ScriptCatalogStore } from './types';

export type BuildableRefreshRequestSummary = {
  scriptId: string;
  serverId: string;
  assignmentCount: number;
};

export type QueueBuildableRefreshOptions = {
  dryRun?: boolean;
  onlyScriptIds?: string[];
  updatedBy?: string | null;
};

export type QueueBuildableRefreshResult = {
  generatedAt: string;
  projectId: string | null;
  dryRun: boolean;
  updatedBy: string | null;
  requestedScriptIds: string[];
  matchedScriptIds: string[];
  missingScriptIds: string[];
  assignmentCount: number;
  refreshRequestCount: number;
  requests: BuildableRefreshRequestSummary[];
};

function normalizeScriptIds(values: string[] | undefined): string[] {
  const unique = new Set<string>();
  for (const value of values ?? []) {
    const normalized = value.trim();
    if (normalized.length > 0) {
      unique.add(normalized);
    }
  }

  return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter((value) => value.length > 0))).sort((left, right) =>
    left.localeCompare(right)
  );
}

async function loadAssignments(
  store: ScriptCatalogStore,
  requestedScriptIds: string[]
): Promise<BuildableScriptAssignmentUsage[]> {
  if (requestedScriptIds.length <= 0) {
    return store.listAllAssignments();
  }

  const assignmentGroups = await Promise.all(requestedScriptIds.map((scriptId) => store.listAssignmentsByScript(scriptId)));
  return assignmentGroups.flat();
}

export function summarizeBuildableRefreshAssignments(
  assignments: BuildableScriptAssignmentUsage[],
  requestedScriptIds: string[] = []
): BuildableRefreshRequestSummary[] {
  const requestedSet = requestedScriptIds.length > 0 ? new Set(requestedScriptIds) : null;
  const grouped = new Map<string, BuildableRefreshRequestSummary>();

  for (const assignment of assignments) {
    const scriptId = assignment.scriptId.trim();
    const serverId = assignment.serverId.trim();
    if (!scriptId || !serverId) {
      continue;
    }
    if (requestedSet && !requestedSet.has(scriptId)) {
      continue;
    }

    const key = `${scriptId}\u0000${serverId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.assignmentCount += 1;
      continue;
    }

    grouped.set(key, {
      scriptId,
      serverId,
      assignmentCount: 1,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const byScript = left.scriptId.localeCompare(right.scriptId);
    if (byScript !== 0) {
      return byScript;
    }
    return left.serverId.localeCompare(right.serverId);
  });
}

export async function queueBuildableRefreshRequests(
  store: ScriptCatalogStore,
  options: QueueBuildableRefreshOptions = {}
): Promise<QueueBuildableRefreshResult> {
  const dryRun = options.dryRun === true;
  const updatedBy = options.updatedBy ?? null;
  const requestedScriptIds = normalizeScriptIds(options.onlyScriptIds);
  const assignments = await loadAssignments(store, requestedScriptIds);
  const requests = summarizeBuildableRefreshAssignments(assignments, requestedScriptIds);

  if (!dryRun) {
    for (const request of requests) {
      const refreshDoc: BuildableScriptRefreshRequestRecord = {
        scriptId: request.scriptId,
        serverId: request.serverId,
        status: 'pending',
        createdBy: updatedBy,
      };
      await store.addRefreshRequest(refreshDoc);
    }
  }

  const matchedScriptIds = uniqueSorted(requests.map((entry) => entry.scriptId));
  const missingScriptIds = requestedScriptIds.filter((scriptId) => !matchedScriptIds.includes(scriptId));

  return {
    generatedAt: new Date().toISOString(),
    projectId: store.getProjectId(),
    dryRun,
    updatedBy,
    requestedScriptIds,
    matchedScriptIds,
    missingScriptIds,
    assignmentCount: assignments.filter((assignment) => {
      const scriptId = assignment.scriptId.trim();
      const serverId = assignment.serverId.trim();
      return scriptId.length > 0 && serverId.length > 0 && (!requestedScriptIds.length || requestedScriptIds.includes(scriptId));
    }).length,
    refreshRequestCount: requests.length,
    requests,
  };
}

export function formatBuildableRefreshResult(result: QueueBuildableRefreshResult): string {
  const verb = result.dryRun ? 'Planned' : 'Queued';
  const serverCount = uniqueSorted(result.requests.map((entry) => entry.serverId)).length;
  const lines = [
    `${verb} ${result.refreshRequestCount} refresh request(s) across ${result.matchedScriptIds.length} script(s), ${serverCount} server(s), and ${result.assignmentCount} buildable assignment(s).`,
  ];

  if (result.projectId) {
    lines.push(`Project: ${result.projectId}`);
  }

  if (result.requestedScriptIds.length > 0) {
    lines.push(`Requested scripts: ${result.requestedScriptIds.join(', ')}`);
  } else {
    lines.push('Requested scripts: all assigned scripts');
  }

  if (result.missingScriptIds.length > 0) {
    lines.push(`No assignments found for: ${result.missingScriptIds.join(', ')}`);
  }

  const maxDetails = 25;
  const detailRequests = result.requests.slice(0, maxDetails);
  for (const request of detailRequests) {
    lines.push(`- ${request.scriptId} -> ${request.serverId} (${request.assignmentCount} buildable(s))`);
  }

  if (result.requests.length > maxDetails) {
    lines.push(`... ${result.requests.length - maxDetails} more request(s) omitted`);
  }

  return lines.join('\n');
}
