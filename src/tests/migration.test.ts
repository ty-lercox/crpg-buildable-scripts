import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { applyScriptIdMigration, planScriptIdMigration, readScriptIdMigrationManifest } from '../lib/migration';
import { cleanupTempRepo, createTempRepo, MemoryScriptCatalogStore } from './testHelpers';

test('migration: store updateAssignment rewrites the matching assignment doc', async () => {
  const store = new MemoryScriptCatalogStore();
  store.assignments.push({
    assignmentPath: 'servers/default/buildableScripts/Buildable_1',
    buildableActorId: 'Buildable_1',
    scriptId: 'starter.gather.loose_log_pickup',
    scriptVersion: 2,
    allowDraft: false,
    serverId: 'default',
    scriptSource: 'firestore',
  });

  await store.updateAssignment('servers/default/buildableScripts/Buildable_1', {
    scriptId: 'starter.gather.loose_log_pickup_v2',
    scriptVersion: 3,
  });

  assert.equal(store.assignments[0]?.scriptId, 'starter.gather.loose_log_pickup_v2');
  assert.equal(store.assignments[0]?.scriptVersion, 3);
  assert.equal(store.assignments[0]?.assignmentPath, 'servers/default/buildableScripts/Buildable_1');
});

test('migration: manifest planning and apply rewrite assignment script ids', async () => {
  const repoRoot = createTempRepo();
  try {
    const manifestPath = path.join(repoRoot, 'imports', 'script-id-migration.json');
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          migrations: [
            {
              oldScriptId: 'starter.gather.loose_log_pickup',
              newScriptId: 'starter.gather.loose_log_pickup_v2',
            },
          ],
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const store = new MemoryScriptCatalogStore('cityrpg-ue5');
    store.scripts.set('starter.gather.loose_log_pickup_v2', {
      title: 'Loose Log Pickup V2',
      description: '',
      tags: [],
      status: 'published',
      language: 'ts',
      scriptText: 'export const v2 = true;\n',
      allowedApis: ['*'],
      version: 4,
      updatedBy: 'codex',
      ownerId: null,
    });
    store.assignments.push(
      {
        assignmentPath: 'servers/default/buildableScripts/Buildable_A',
        buildableActorId: 'Buildable_A',
        scriptId: 'starter.gather.loose_log_pickup',
        scriptVersion: 2,
        allowDraft: false,
        serverId: 'default',
        scriptSource: 'firestore',
      },
      {
        assignmentPath: 'servers/staging/buildableScripts/Buildable_B',
        buildableActorId: 'Buildable_B',
        scriptId: 'starter.gather.loose_log_pickup',
        scriptVersion: 2,
        allowDraft: true,
        serverId: 'staging',
        scriptSource: 'firestore',
      }
    );

    const manifest = readScriptIdMigrationManifest(manifestPath);
    const plan = await planScriptIdMigration(store, manifest, { manifestPath });
    assert.equal(plan.migrations[0]?.ready, true);
    assert.equal(plan.migrations[0]?.assignmentCount, 2);
    assert.deepEqual(plan.migrations[0]?.affectedServers, ['default', 'staging']);

    const result = await applyScriptIdMigration(store, manifest, {
      dryRun: false,
      updatedBy: 'codex',
      manifestPath,
    });

    assert.equal(result.changedCount, 1);
    assert.equal(result.assignmentUpdateCount, 2);
    assert.equal(result.refreshRequestCount, 2);
    assert.equal(store.assignments.every((entry) => entry.scriptId === 'starter.gather.loose_log_pickup_v2'), true);
    assert.equal(store.assignments.every((entry) => entry.scriptVersion === 4), true);
    assert.deepEqual(
      store.refreshRequests.map((entry) => entry.doc).map((doc) => [doc.scriptId, doc.serverId]).sort(),
      [
        ['starter.gather.loose_log_pickup_v2', 'default'],
        ['starter.gather.loose_log_pickup_v2', 'staging'],
      ]
    );
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('migration: target script must already exist before assignments can move', async () => {
  const repoRoot = createTempRepo();
  try {
    const manifestPath = path.join(repoRoot, 'imports', 'script-id-migration.json');
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          migrations: [
            {
              oldScriptId: 'starter.gather.loose_log_pickup',
              newScriptId: 'starter.gather.loose_log_pickup_v2',
            },
          ],
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const store = new MemoryScriptCatalogStore('cityrpg-ue5');
    store.assignments.push({
      assignmentPath: 'servers/default/buildableScripts/Buildable_A',
      buildableActorId: 'Buildable_A',
      scriptId: 'starter.gather.loose_log_pickup',
      scriptVersion: 2,
      allowDraft: false,
      serverId: 'default',
      scriptSource: 'firestore',
    });

    const manifest = readScriptIdMigrationManifest(manifestPath);
    const plan = await planScriptIdMigration(store, manifest, { manifestPath });
    assert.equal(plan.migrations[0]?.ready, false);
    assert.deepEqual(plan.migrations[0]?.reasons, ['new-script-id-missing']);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});
