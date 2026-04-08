import assert from 'node:assert/strict';
import test from 'node:test';

import { syncFirestoreScripts } from '../lib/sync';
import { cleanupTempRepo, createTempRepo, MemoryScriptCatalogStore, writeRepoScript } from './testHelpers';

test('sync-firestore: creates repo-managed scripts without touching unrelated docs', async () => {
  const repoRoot = createTempRepo();
  try {
    writeRepoScript(repoRoot, { scriptId: 'starter.gather.loose_log_pickup', title: 'Loose Log Pickup' }, 'export function onInteract() { return true; }');

    const store = new MemoryScriptCatalogStore('cityrpg-ue5');
    store.scripts.set('unmanaged.script', {
      title: 'Keep Me',
      description: '',
      tags: [],
      status: 'published',
      language: 'ts',
      scriptText: 'export const keep = true;',
      allowedApis: ['*'],
      version: 9,
      updatedBy: 'someone',
      ownerId: null,
    });

    const result = await syncFirestoreScripts(store, { repoRoot, dryRun: false });
    assert.equal(result.changedCount, 1);
    assert.equal(store.scripts.has('starter.gather.loose_log_pickup'), true);
    assert.equal(store.scripts.get('unmanaged.script')?.version, 9);
    assert.equal(store.history.length, 0);
    assert.equal(store.refreshRequests.length, 0);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('sync-firestore: AUDIO refs publish without inlining the shared audio catalog', async () => {
  const repoRoot = createTempRepo();
  try {
    writeRepoScript(
      repoRoot,
      { scriptId: 'ui.bank_menu', title: 'Bank Menu', allowedApis: ['audio', 'ui'] },
      'export function onInteract(ctx, api) { api.audio.playOneShotForPlayer(ctx.playerId, AUDIO.ui.menu.open); api.ui.openBankView(); }\n'
    );

    const store = new MemoryScriptCatalogStore();
    const result = await syncFirestoreScripts(store, { repoRoot, dryRun: false });
    const liveScriptText = String(store.scripts.get('ui.bank_menu')?.scriptText ?? '');

    assert.equal(result.changedCount, 1);
    assert.equal(liveScriptText.includes('const AUDIO ='), false);
    assert.equal(liveScriptText.includes('AUDIO.ui.menu.open'), true);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('sync-firestore: metadata-only updates preserve version and still queue refresh', async () => {
  const repoRoot = createTempRepo();
  try {
    writeRepoScript(
      repoRoot,
      {
        scriptId: 'civic.townhall.registry',
        title: 'New Title',
        description: 'New description',
        tags: ['civic', 'townhall'],
        allowedApis: ['ui'],
      },
      'export function onInteract(ctx, api) { api.toast("same-runtime"); }\n'
    );

    const store = new MemoryScriptCatalogStore();
    store.scripts.set('civic.townhall.registry', {
      title: 'Old Title',
      description: 'Old description',
      tags: ['old'],
      status: 'published',
      language: 'ts',
      scriptText: 'export function onInteract(ctx, api) { api.toast("same-runtime"); }\n',
      allowedApis: ['ui'],
      version: 7,
      updatedBy: 'previous',
      ownerId: null,
    });
    store.assignments.push({
      buildableActorId: 'Buildable_Townhall_01',
      scriptId: 'civic.townhall.registry',
      scriptVersion: 7,
      allowDraft: false,
      serverId: 'default',
      scriptSource: 'firestore',
    });

    const result = await syncFirestoreScripts(store, { repoRoot, dryRun: false });
    assert.equal(result.outcomes[0]?.action, 'update');
    assert.equal(result.outcomes[0]?.version, 7);
    assert.equal(result.outcomes[0]?.runtimeChanged, false);
    assert.equal(store.history.length, 0);
    assert.equal(store.refreshRequests.length, 1);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('sync-firestore: runtime changes snapshot history and bump version', async () => {
  const repoRoot = createTempRepo();
  try {
    writeRepoScript(
      repoRoot,
      {
        scriptId: 'starter.gather.stone_mine',
        title: 'Starter Gather Stone Mine',
        allowedApis: ['inventory', 'ui'],
      },
      'export function onInteract(ctx, api) { api.toast("new-runtime"); }\n'
    );

    const store = new MemoryScriptCatalogStore();
    store.scripts.set('starter.gather.stone_mine', {
      title: 'Starter Gather Stone Mine',
      description: '',
      tags: [],
      status: 'published',
      language: 'ts',
      scriptText: 'export function onInteract(ctx, api) { api.toast("old-runtime"); }\n',
      allowedApis: ['ui'],
      version: 2,
      updatedBy: 'previous',
      ownerId: null,
    });
    store.assignments.push(
      {
        buildableActorId: 'Buildable_Stone_01',
        scriptId: 'starter.gather.stone_mine',
        scriptVersion: 2,
        allowDraft: false,
        serverId: 'default',
        scriptSource: 'firestore',
      },
      {
        buildableActorId: 'Buildable_Stone_02',
        scriptId: 'starter.gather.stone_mine',
        scriptVersion: 2,
        allowDraft: false,
        serverId: 'staging',
        scriptSource: 'firestore',
      }
    );

    const result = await syncFirestoreScripts(store, { repoRoot, dryRun: false });
    assert.equal(result.outcomes[0]?.version, 3);
    assert.equal(result.outcomes[0]?.runtimeChanged, true);
    assert.equal(store.history.length, 1);
    assert.equal(store.history[0]?.doc.version, 2);
    assert.equal(store.refreshRequests.length, 2);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('sync-firestore: retired lifecycle forces draft status and refreshes active assignments', async () => {
  const repoRoot = createTempRepo();
  try {
    writeRepoScript(
      repoRoot,
      {
        scriptId: 'starter.combat.npc_spawn',
        title: 'Starter Combat NPC Spawn',
        status: 'published',
        lifecycle: 'retired',
        allowedApis: ['buildable', 'ui'],
      },
      'export function onInteract(ctx, api) { api.toast("retired"); }\n'
    );

    const store = new MemoryScriptCatalogStore();
    store.scripts.set('starter.combat.npc_spawn', {
      title: 'Starter Combat NPC Spawn',
      description: '',
      tags: [],
      status: 'published',
      language: 'ts',
      scriptText: 'export function onInteract(ctx, api) { api.toast("live"); }\n',
      allowedApis: ['buildable', 'ui'],
      version: 4,
      updatedBy: 'previous',
      ownerId: null,
    });
    store.assignments.push({
      buildableActorId: 'Buildable_Combat_01',
      scriptId: 'starter.combat.npc_spawn',
      scriptVersion: 4,
      allowDraft: false,
      serverId: 'default',
      scriptSource: 'firestore',
    });

    const result = await syncFirestoreScripts(store, { repoRoot, dryRun: false });
    assert.equal(result.outcomes[0]?.effectiveStatus, 'draft');
    assert.equal(store.scripts.get('starter.combat.npc_spawn')?.status, 'draft');
    assert.equal(store.refreshRequests.length, 1);
    assert.equal(store.history.length, 1);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('sync-firestore: newline-only script diffs do not trigger updates', async () => {
  const repoRoot = createTempRepo();
  try {
    writeRepoScript(
      repoRoot,
      {
        scriptId: 'user-owned-script',
        title: 'User Owned Script',
      },
      'export const imported = true;\n'
    );

    const store = new MemoryScriptCatalogStore();
    store.scripts.set('user-owned-script', {
      title: 'User Owned Script',
      description: '',
      tags: [],
      status: 'published',
      language: 'ts',
      scriptText: 'export const imported = true;',
      allowedApis: ['*'],
      version: 2,
      updatedBy: 'player',
      ownerId: 'player-1',
    });

    const result = await syncFirestoreScripts(store, { repoRoot, dryRun: true });
    assert.equal(result.outcomes[0]?.action, 'noop');
    assert.equal(result.outcomes[0]?.runtimeChanged, false);
    assert.equal(result.changedCount, 0);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});
