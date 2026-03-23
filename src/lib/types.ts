export const BUILDABLE_SCRIPT_MAX_CHARS = 20_000;
export const SCRIPT_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\.[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/;
export const DEFAULT_SCAN_REPORT_PATH = 'artifacts/firestore-scan.json';
export const DEFAULT_SYNC_REPORT_PATH = 'artifacts/sync-report.json';
export const DEFAULT_MIGRATION_REPORT_PATH = 'artifacts/script-id-migration.json';

export type RepoScriptStatus = 'draft' | 'published';
export type RepoScriptLifecycle = 'active' | 'retired';

export type RepoScriptMetadata = {
  scriptId: string;
  title: string;
  description: string;
  tags: string[];
  allowedApis: string[];
  status: RepoScriptStatus;
  lifecycle: RepoScriptLifecycle;
  legacyId?: boolean;
};

export type LoadedRepoScript = RepoScriptMetadata & {
  manifestPath: string;
  scriptPath: string;
  scriptDir: string;
  scriptText: string;
  effectiveStatus: RepoScriptStatus;
  relativeScriptDir: string;
};

export type StoredBuildableScriptRecord = {
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  status?: unknown;
  language?: unknown;
  scriptText?: unknown;
  allowedApis?: unknown;
  version?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
  ownerId?: unknown;
};

export type NormalizedStoredBuildableScriptRecord = {
  title: string;
  description: string | null;
  tags: string[];
  status: RepoScriptStatus;
  language: 'ts';
  scriptText: string;
  allowedApis: string[];
  version: number;
  updatedBy: string | null;
  ownerId: string | null;
};

export type FirestoreCatalogScript = {
  scriptId: string;
  record: NormalizedStoredBuildableScriptRecord;
  overrideIds: string[];
};

export type BuildableScriptAssignmentUsage = {
  assignmentPath?: string;
  buildableActorId: string;
  scriptId: string;
  scriptVersion: number;
  allowDraft: boolean;
  serverId: string;
  scriptSource: string;
};

export type BuildableScriptAssignmentUpdate = {
  assignmentPath?: string;
  buildableActorId?: string;
  scriptId?: string;
  scriptVersion?: number;
  allowDraft?: boolean;
  serverId?: string;
  scriptSource?: string;
};

export type BuildableScriptUpsertRecord = {
  title: string;
  description: string | null;
  tags: string[];
  status: RepoScriptStatus;
  language: 'ts';
  scriptText: string;
  allowedApis: string[];
  version: number;
  updatedBy: string | null;
  ownerId: string | null;
};

export type BuildableScriptHistoryRecord = BuildableScriptUpsertRecord;

export type BuildableScriptRefreshRequestRecord = {
  scriptId: string;
  serverId: string;
  status: 'pending';
  createdBy: string | null;
};

export type ScriptCatalogStore = {
  getProjectId(): string | null;
  getScript(scriptId: string): Promise<StoredBuildableScriptRecord | null>;
  listScripts(): Promise<FirestoreCatalogScript[]>;
  listAllAssignments(): Promise<BuildableScriptAssignmentUsage[]>;
  listAssignmentsByScript(scriptId: string): Promise<BuildableScriptAssignmentUsage[]>;
  updateAssignment(assignmentPath: string, patch: BuildableScriptAssignmentUpdate): Promise<void>;
  upsertScript(scriptId: string, doc: BuildableScriptUpsertRecord, opts: { isCreate: boolean }): Promise<void>;
  addHistoryEntry(scriptId: string, doc: BuildableScriptHistoryRecord): Promise<string>;
  addRefreshRequest(doc: BuildableScriptRefreshRequestRecord): Promise<string>;
};

export type CurationRecommendation = 'import' | 'review' | 'exclude';

export type ScriptScanReportEntry = {
  scriptId: string;
  title: string;
  status: RepoScriptStatus;
  version: number;
  ownerId: string | null;
  updatedBy: string | null;
  overrideIds: string[];
  assignmentCount: number;
  assignmentServers: string[];
  recommendation: CurationRecommendation;
  suggestedPath: string;
  reasons: string[];
};

export type DevAssignmentReportEntry = {
  scriptId: string;
  count: number;
  servers: string[];
};

export type FirestoreScanReport = {
  generatedAt: string;
  projectId: string | null;
  scriptCount: number;
  assignmentCount: number;
  importCandidates: string[];
  reviewCandidates: string[];
  excludedCandidates: string[];
  scripts: ScriptScanReportEntry[];
  devAssignments: DevAssignmentReportEntry[];
};

export type ImportManifest = {
  scriptIds: string[];
};

export type ScriptIdMigrationEntry = {
  oldScriptId: string;
  newScriptId: string;
};

export type ScriptIdMigrationManifest = {
  migrations: ScriptIdMigrationEntry[];
};

export type ScriptIdMigrationPlanEntry = {
  oldScriptId: string;
  newScriptId: string;
  assignmentCount: number;
  assignmentPaths: string[];
  affectedServers: string[];
  reasons: string[];
  ready: boolean;
};

export type ScriptIdMigrationPlan = {
  generatedAt: string;
  projectId: string | null;
  manifestPath: string | null;
  migrations: ScriptIdMigrationPlanEntry[];
};

export type ScriptIdMigrationResult = {
  generatedAt: string;
  projectId: string | null;
  dryRun: boolean;
  updatedBy: string | null;
  changedCount: number;
  assignmentUpdateCount: number;
  refreshRequestCount: number;
  migrations: ScriptIdMigrationPlanEntry[];
};

export type ImportCuratedResultEntry = {
  scriptId: string;
  scriptDir: string;
  action: 'created' | 'updated' | 'moved';
};

export type ImportCuratedResult = {
  importedCount: number;
  imported: ImportCuratedResultEntry[];
};

export type SyncOutcome = {
  scriptId: string;
  title: string;
  lifecycle: RepoScriptLifecycle;
  action: 'create' | 'update' | 'noop';
  version: number;
  runtimeChanged: boolean;
  metadataChanged: boolean;
  historyCreated: boolean;
  refreshRequestsCreated: number;
  assignmentCount: number;
  affectedServers: string[];
  effectiveStatus: RepoScriptStatus;
};

export type SyncResult = {
  generatedAt: string;
  projectId: string | null;
  dryRun: boolean;
  updatedBy: string | null;
  changedCount: number;
  historyCount: number;
  refreshRequestCount: number;
  outcomes: SyncOutcome[];
};
