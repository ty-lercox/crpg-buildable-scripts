import assert from 'node:assert/strict';
import test from 'node:test';

import { queueBuildableRefreshRequests, summarizeBuildableRefreshAssignments } from '../lib/refresh';
import { MemoryScriptCatalogStore } from './testHelpers';

test('refresh-buildables: summarizes unique script and server pairs', () => {
  const requests = summarizeBuildableRefreshAssignments([
    {
      buildableActorId: 'Buildable_01',
      scriptId: 'gather.tree_chop',
      scriptVersion: 2,
      allowDraft: false,
      serverId: 'default',
      scriptSource: 'firestore',
    },
    {
      buildableActorId: 'Buildable_02',
      scriptId: 'gather.tree_chop',
      scriptVersion: 2,
      allowDraft: false,
      serverId: 'default',
      scriptSource: 'firestore',
    },
    {
      buildableActorId: 'Buildable_03',
      scriptId: 'gather.tree_chop',
      scriptVersion: 2,
      allowDraft: false,
      serverId: 'staging',
      scriptSource: 'firestore',
    },
    {
      buildableActorId: 'Buildable_04',
      scriptId: 'gather.stone_mine',
      scriptVersion: 1,
      allowDraft: false,
      serverId: 'default',
      scriptSource: 'firestore',
    },
  ]);

  assert.deepEqual(requests, [
    {
      scriptId: 'gather.stone_mine',
      serverId: 'default',
      assignmentCount: 1,
    },
    {
      scriptId: 'gather.tree_chop',
      serverId: 'default',
      assignmentCount: 2,
    },
    {
      scriptId: 'gather.tree_chop',
      serverId: 'staging',
      assignmentCount: 1,
    },
  ]);
});

test('refresh-buildables: queues one refresh per affected script and server pair', async () => {
  const store = new MemoryScriptCatalogStore('cityrpg-ue5');
  store.assignments.push(
    {
      buildableActorId: 'Buildable_01',
      scriptId: 'gather.tree_chop',
      scriptVersion: 2,
      allowDraft: false,
      serverId: 'default',
      scriptSource: 'firestore',
    },
    {
      buildableActorId: 'Buildable_02',
      scriptId: 'gather.tree_chop',
      scriptVersion: 2,
      allowDraft: false,
      serverId: 'default',
      scriptSource: 'firestore',
    },
    {
      buildableActorId: 'Buildable_03',
      scriptId: 'gather.tree_chop',
      scriptVersion: 2,
      allowDraft: false,
      serverId: 'staging',
      scriptSource: 'firestore',
    },
    {
      buildableActorId: 'Buildable_04',
      scriptId: 'gather.stone_mine',
      scriptVersion: 1,
      allowDraft: false,
      serverId: 'default',
      scriptSource: 'firestore',
    }
  );

  const result = await queueBuildableRefreshRequests(store, {
    updatedBy: 'tycox',
  });

  assert.equal(result.refreshRequestCount, 3);
  assert.equal(result.assignmentCount, 4);
  assert.deepEqual(result.matchedScriptIds, ['gather.stone_mine', 'gather.tree_chop']);
  assert.equal(store.refreshRequests.length, 3);
  assert.deepEqual(
    store.refreshRequests.map((entry) => entry.doc),
    [
      {
        scriptId: 'gather.stone_mine',
        serverId: 'default',
        status: 'pending',
        createdBy: 'tycox',
      },
      {
        scriptId: 'gather.tree_chop',
        serverId: 'default',
        status: 'pending',
        createdBy: 'tycox',
      },
      {
        scriptId: 'gather.tree_chop',
        serverId: 'staging',
        status: 'pending',
        createdBy: 'tycox',
      },
    ]
  );
});

test('refresh-buildables: supports filtering to requested script ids and reports misses', async () => {
  const store = new MemoryScriptCatalogStore();
  store.assignments.push({
    buildableActorId: 'Buildable_01',
    scriptId: 'gather.tree_chop',
    scriptVersion: 2,
    allowDraft: false,
    serverId: 'default',
    scriptSource: 'firestore',
  });

  const result = await queueBuildableRefreshRequests(store, {
    onlyScriptIds: ['gather.tree_chop', 'missing.script'],
  });

  assert.equal(result.refreshRequestCount, 1);
  assert.deepEqual(result.requestedScriptIds, ['gather.tree_chop', 'missing.script']);
  assert.deepEqual(result.matchedScriptIds, ['gather.tree_chop']);
  assert.deepEqual(result.missingScriptIds, ['missing.script']);
  assert.equal(store.refreshRequests.length, 1);
});

test('refresh-buildables: dry run does not write refresh request docs', async () => {
  const store = new MemoryScriptCatalogStore();
  store.assignments.push({
    buildableActorId: 'Buildable_Stone_01',
    scriptId: 'gather.stone_mine',
    scriptVersion: 1,
    allowDraft: false,
    serverId: 'default',
    scriptSource: 'firestore',
  });

  const result = await queueBuildableRefreshRequests(store, {
    dryRun: true,
  });

  assert.equal(result.refreshRequestCount, 1);
  assert.equal(store.refreshRequests.length, 0);
});
