import fs from 'node:fs';
import path from 'node:path';

import {
  BuildableScriptAssignmentUsage,
  BuildableScriptAssignmentUpdate,
  BuildableScriptHistoryRecord,
  BuildableScriptRefreshRequestRecord,
  BuildableScriptUpsertRecord,
  FirestoreCatalogScript,
  NormalizedStoredBuildableScriptRecord,
  ScriptCatalogStore,
  StoredBuildableScriptRecord,
} from './types';
import {
  normalizeAllowedApis,
  normalizeNullableText,
  normalizeStatus,
  normalizeTags,
  normalizeText,
} from './util';

type FirebaseAdminApp = {
  name?: string;
  options?: Record<string, unknown>;
};

type FirebaseAdminAppModule = {
  cert: (serviceAccount: unknown) => unknown;
  getApps: () => FirebaseAdminApp[];
  initializeApp: (options?: Record<string, unknown>, appName?: string) => FirebaseAdminApp;
};

type FirebaseAdminFirestoreModule = {
  FieldValue: {
    serverTimestamp: () => unknown;
  };
  getFirestore: (app?: unknown) => any;
};

type FirebaseAdminModules = {
  app: FirebaseAdminAppModule;
  firestore: FirebaseAdminFirestoreModule;
};

const APP_NAME = 'cityrpg-buildable-scripts';

let cachedModules: FirebaseAdminModules | null = null;
let cachedStore: ScriptCatalogStore | null = null;

function tryRequire<T>(moduleId: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(moduleId) as T;
  } catch {
    return null;
  }
}

function loadFirebaseAdmin(): FirebaseAdminModules {
  if (cachedModules) {
    return cachedModules;
  }

  const app = tryRequire<FirebaseAdminAppModule>('firebase-admin/app');
  const firestore = tryRequire<FirebaseAdminFirestoreModule>('firebase-admin/firestore');
  if (!app || !firestore) {
    throw new Error('firebase-admin is not installed.');
  }

  cachedModules = { app, firestore };
  return cachedModules;
}

function resolveServiceAccountPath(): string {
  const candidates = [
    normalizeText(process.env.BUILDABLE_SCRIPTS_FIRESTORE_SERVICE_ACCOUNT_JSON),
    normalizeText(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  ].filter((entry) => entry.length > 0);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }

  throw new Error('Missing Firestore service account path. Set GOOGLE_APPLICATION_CREDENTIALS or BUILDABLE_SCRIPTS_FIRESTORE_SERVICE_ACCOUNT_JSON.');
}

function resolveProjectId(serviceAccount: Record<string, unknown>): string | null {
  const explicit = normalizeText(process.env.FIRESTORE_PROJECT_ID);
  if (explicit) {
    return explicit;
  }
  const fromJson = normalizeText(serviceAccount.project_id);
  return fromJson || null;
}

function getOrInitAdminApp(): { app: FirebaseAdminApp; firestoreModule: FirebaseAdminFirestoreModule; projectId: string | null } {
  const modules = loadFirebaseAdmin();
  const serviceAccountPath = resolveServiceAccountPath();
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')) as Record<string, unknown>;
  const projectId = resolveProjectId(serviceAccount);

  const existing = modules.app.getApps().find((entry) => entry?.name === APP_NAME);
  const app =
    existing ??
    modules.app.initializeApp(
      {
        credential: modules.app.cert(serviceAccount),
        ...(projectId ? { projectId } : {}),
      },
      APP_NAME
    );

  return {
    app,
    firestoreModule: modules.firestore,
    projectId,
  };
}

export function normalizeStoredScript(raw: StoredBuildableScriptRecord | null): NormalizedStoredBuildableScriptRecord | null {
  if (!raw) {
    return null;
  }

  const title = normalizeText(raw.title) || 'Untitled script';
  const versionRaw = Number(raw.version);
  const version = Number.isFinite(versionRaw) ? Math.max(1, Math.trunc(versionRaw)) : 1;

  return {
    title,
    description: normalizeNullableText(raw.description),
    tags: normalizeTags(raw.tags),
    status: normalizeStatus(raw.status),
    language: 'ts',
    scriptText: typeof raw.scriptText === 'string' ? raw.scriptText : '',
    allowedApis: normalizeAllowedApis(raw.allowedApis),
    version,
    updatedBy: normalizeNullableText(raw.updatedBy),
    ownerId: normalizeNullableText(raw.ownerId),
  };
}

function normalizeAssignment(entry: any): BuildableScriptAssignmentUsage {
  const data = (entry.data() ?? {}) as Record<string, unknown>;
  const pathSegments = typeof entry.ref?.path === 'string' ? entry.ref.path.split('/') : [];
  const serverIdFromPath = pathSegments.length >= 2 ? normalizeText(pathSegments[1]) : '';

  return {
    assignmentPath: normalizeText(entry.ref?.path),
    buildableActorId: normalizeText(data.buildableActorId) || normalizeText(entry.id),
    scriptId: normalizeText(data.scriptId),
    scriptVersion: Math.max(0, Math.trunc(Number(data.scriptVersion) || 0)),
    allowDraft: data.allowDraft === true,
    serverId: normalizeText(data.serverId) || serverIdFromPath || 'default',
    scriptSource: normalizeText(data.scriptSource) || 'firestore',
  };
}

export function createFirestoreCatalogStore(): ScriptCatalogStore {
  if (cachedStore) {
    return cachedStore;
  }

  const { app, firestoreModule, projectId } = getOrInitAdminApp();
  const db = firestoreModule.getFirestore(app);
  const { FieldValue } = firestoreModule;

  cachedStore = {
    getProjectId(): string | null {
      return projectId;
    },

    async getScript(scriptId: string): Promise<StoredBuildableScriptRecord | null> {
      const snap = await db.collection('scripts').doc(scriptId).get();
      return snap.exists ? ((snap.data() ?? {}) as StoredBuildableScriptRecord) : null;
    },

    async listScripts(): Promise<FirestoreCatalogScript[]> {
      const snap = await db.collection('scripts').get();
      const items: FirestoreCatalogScript[] = [];
      for (const doc of snap.docs) {
        const overrideSnap = await doc.ref.collection('overrides').get();
        items.push({
          scriptId: doc.id,
          record: normalizeStoredScript((doc.data() ?? {}) as StoredBuildableScriptRecord)!,
          overrideIds: overrideSnap.docs
            .map((entry: { id?: unknown }) => normalizeText(entry.id))
            .filter((entry: string) => entry.length > 0),
        });
      }

      return items.sort((left, right) => left.scriptId.localeCompare(right.scriptId));
    },

    async listAllAssignments(): Promise<BuildableScriptAssignmentUsage[]> {
      const snap = await db.collectionGroup('buildableScripts').get();
      return snap.docs.map(normalizeAssignment);
    },

    async listAssignmentsByScript(scriptId: string): Promise<BuildableScriptAssignmentUsage[]> {
      const snap = await db.collectionGroup('buildableScripts').get();
      return snap.docs
        .map(normalizeAssignment)
        .filter((entry: BuildableScriptAssignmentUsage) => entry.scriptId === scriptId);
    },

    async updateAssignment(assignmentPath: string, patch: BuildableScriptAssignmentUpdate): Promise<void> {
      const payload: Record<string, unknown> = {};
      if (patch.buildableActorId !== undefined) {
        payload.buildableActorId = patch.buildableActorId;
      }
      if (patch.scriptId !== undefined) {
        payload.scriptId = patch.scriptId;
      }
      if (patch.scriptVersion !== undefined) {
        payload.scriptVersion = patch.scriptVersion;
      }
      if (patch.allowDraft !== undefined) {
        payload.allowDraft = patch.allowDraft;
      }
      if (patch.serverId !== undefined) {
        payload.serverId = patch.serverId;
      }
      if (patch.scriptSource !== undefined) {
        payload.scriptSource = patch.scriptSource;
      }

      if (Object.keys(payload).length === 0) {
        return;
      }

      await db.doc(assignmentPath).set(payload, { merge: true });
    },

    async upsertScript(scriptId: string, doc: BuildableScriptUpsertRecord, opts: { isCreate: boolean }): Promise<void> {
      const payload: Record<string, unknown> = {
        title: doc.title,
        description: doc.description,
        tags: doc.tags,
        status: doc.status,
        language: 'ts',
        scriptText: doc.scriptText,
        allowedApis: doc.allowedApis,
        version: doc.version,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: doc.updatedBy,
        ownerId: doc.ownerId,
      };

      if (opts.isCreate) {
        payload.createdAt = FieldValue.serverTimestamp();
      }

      await db.collection('scripts').doc(scriptId).set(payload, { merge: true });
    },

    async addHistoryEntry(scriptId: string, doc: BuildableScriptHistoryRecord): Promise<string> {
      const created = await db.collection('scripts').doc(scriptId).collection('history').add({
        title: doc.title,
        description: doc.description,
        tags: doc.tags,
        status: doc.status,
        language: 'ts',
        scriptText: doc.scriptText,
        allowedApis: doc.allowedApis,
        version: doc.version,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: doc.updatedBy,
        ownerId: doc.ownerId,
      });
      return normalizeText(created?.id);
    },

    async addRefreshRequest(doc: BuildableScriptRefreshRequestRecord): Promise<string> {
      const created = await db.collection('scriptRefreshRequests').add({
        scriptId: doc.scriptId,
        serverId: doc.serverId,
        status: doc.status,
        createdBy: doc.createdBy,
        createdAt: FieldValue.serverTimestamp(),
      });
      return normalizeText(created?.id);
    },
  };

  return cachedStore;
}
