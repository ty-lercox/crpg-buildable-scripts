import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeStoredScript } from '../lib/firestore';
import {
  BuildableScriptAssignmentUsage,
  BuildableScriptAssignmentUpdate,
  BuildableScriptHistoryRecord,
  BuildableScriptRefreshRequestRecord,
  BuildableScriptUpsertRecord,
  FirestoreCatalogScript,
  ScriptCatalogStore,
  StoredBuildableScriptRecord,
} from '../lib/types';

export class MemoryScriptCatalogStore implements ScriptCatalogStore {
  readonly scripts = new Map<string, StoredBuildableScriptRecord>();
  readonly overrideIds = new Map<string, string[]>();
  readonly assignments: BuildableScriptAssignmentUsage[] = [];
  readonly history: Array<{ id: string; scriptId: string; doc: BuildableScriptHistoryRecord }> = [];
  readonly refreshRequests: Array<{ id: string; doc: BuildableScriptRefreshRequestRecord }> = [];
  private nextSequence = 1;

  constructor(private readonly projectId: string | null = 'test-project') {}

  getProjectId(): string | null {
    return this.projectId;
  }

  async getScript(scriptId: string): Promise<StoredBuildableScriptRecord | null> {
    return this.scripts.get(scriptId) ?? null;
  }

  async listScripts(): Promise<FirestoreCatalogScript[]> {
    return Array.from(this.scripts.entries())
      .map(([scriptId, record]) => {
        const normalized = normalizeStoredScript(record);
        assert.ok(normalized);
        return {
          scriptId,
          record: normalized,
          overrideIds: this.overrideIds.get(scriptId) ?? [],
        };
      })
      .sort((left, right) => left.scriptId.localeCompare(right.scriptId));
  }

  async listAllAssignments(): Promise<BuildableScriptAssignmentUsage[]> {
    return [...this.assignments];
  }

  async listAssignmentsByScript(scriptId: string): Promise<BuildableScriptAssignmentUsage[]> {
    return this.assignments.filter((entry) => entry.scriptId === scriptId);
  }

  async updateAssignment(assignmentPath: string, patch: BuildableScriptAssignmentUpdate): Promise<void> {
    const index = this.assignments.findIndex((entry) => getAssignmentPath(entry) === assignmentPath);
    if (index < 0) {
      throw new Error(`Assignment not found: ${assignmentPath}`);
    }

    const current = this.assignments[index];
    this.assignments[index] = {
      ...current,
      ...patch,
      assignmentPath,
    };
  }

  async upsertScript(scriptId: string, doc: BuildableScriptUpsertRecord, opts: { isCreate: boolean }): Promise<void> {
    const previous = this.scripts.get(scriptId);
    this.scripts.set(scriptId, {
      ...doc,
      createdAt: opts.isCreate ? `created_${this.nextSequence++}` : previous?.createdAt ?? `created_${this.nextSequence++}`,
      updatedAt: `updated_${this.nextSequence++}`,
    });
  }

  async addHistoryEntry(scriptId: string, doc: BuildableScriptHistoryRecord): Promise<string> {
    const id = `history_${this.nextSequence++}`;
    this.history.push({ id, scriptId, doc });
    return id;
  }

  async addRefreshRequest(doc: BuildableScriptRefreshRequestRecord): Promise<string> {
    const id = `refresh_${this.nextSequence++}`;
    this.refreshRequests.push({ id, doc });
    return id;
  }
}

function getAssignmentPath(entry: BuildableScriptAssignmentUsage): string {
  if (entry.assignmentPath) {
    return entry.assignmentPath;
  }

  return `servers/${entry.serverId}/buildableScripts/${entry.buildableActorId}`;
}

export function createTempRepo(): string {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cityrpg-buildable-scripts-'));
  fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'imports'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'package.json'), '{ "name": "cityrpg-buildable-scripts" }\n', 'utf8');
  return repoRoot;
}

export function cleanupTempRepo(repoRoot: string): void {
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

export function writeRepoScript(
  repoRoot: string,
  metadata: {
    scriptId: string;
    title?: string;
    description?: string;
    tags?: string[];
    allowedApis?: string[];
    status?: 'draft' | 'published';
    lifecycle?: 'active' | 'retired';
  },
  scriptText: string
): void {
  const scriptDir = path.join(repoRoot, 'scripts', metadata.scriptId);
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptDir, 'script.json'),
    `${JSON.stringify(
      {
        scriptId: metadata.scriptId,
        title: metadata.title ?? metadata.scriptId,
        description: metadata.description ?? '',
        tags: metadata.tags ?? [],
        allowedApis: metadata.allowedApis ?? ['*'],
        status: metadata.status ?? 'published',
        lifecycle: metadata.lifecycle ?? 'active',
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  fs.writeFileSync(path.join(scriptDir, 'script.ts'), scriptText.endsWith('\n') ? scriptText : `${scriptText}\n`, 'utf8');
}
