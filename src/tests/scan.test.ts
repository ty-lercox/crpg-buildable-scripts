import assert from 'node:assert/strict';
import test from 'node:test';

import { scanFirestore } from '../lib/scan';
import { MemoryScriptCatalogStore } from './testHelpers';

test('scan-firestore: classifies curated import, review, exclude, and dev assignment buckets', async () => {
  const store = new MemoryScriptCatalogStore('cityrpg-ue5');
  store.scripts.set('starter.gather.loose_log_pickup', {
    title: 'Loose Log',
    description: 'desc',
    tags: ['starter'],
    status: 'published',
    language: 'ts',
    scriptText: 'export const a = true;',
    allowedApis: ['*'],
    version: 2,
    updatedBy: 'codex',
    ownerId: null,
  });
  store.scripts.set('seed_script_weapon_hit_debug', {
    title: 'Weapon Hit Debug',
    description: 'desc',
    tags: ['seed'],
    status: 'published',
    language: 'ts',
    scriptText: 'export const a = true;',
    allowedApis: ['*'],
    version: 1,
    updatedBy: 'seed-script',
    ownerId: null,
  });
  store.scripts.set('starter.gather.palm_chop_showcase', {
    title: 'Showcase',
    description: '',
    tags: [],
    status: 'published',
    language: 'ts',
    scriptText: 'export const a = true;',
    allowedApis: ['*'],
    version: 1,
    updatedBy: 'tycox',
    ownerId: null,
  });
  store.scripts.set('AbCdEfGhIjKlMnOpQr12', {
    title: 'Random',
    description: '',
    tags: [],
    status: 'published',
    language: 'ts',
    scriptText: 'export const a = true;',
    allowedApis: ['*'],
    version: 1,
    updatedBy: 'player',
    ownerId: null,
  });
  store.scripts.set('starter.player.custom_script', {
    title: 'Custom',
    description: '',
    tags: [],
    status: 'published',
    language: 'ts',
    scriptText: 'export const a = true;',
    allowedApis: ['*'],
    version: 1,
    updatedBy: 'player',
    ownerId: 'player-1',
  });

  store.assignments.push(
    {
      buildableActorId: 'Buildable_1',
      scriptId: 'starter.gather.loose_log_pickup',
      scriptVersion: 2,
      allowDraft: false,
      serverId: 'default',
      scriptSource: 'firestore',
    },
    {
      buildableActorId: 'Buildable_2',
      scriptId: 'dev:palmchop',
      scriptVersion: 0,
      allowDraft: false,
      serverId: 'default',
      scriptSource: 'local',
    }
  );

  const report = await scanFirestore(store);
  assert.equal(report.projectId, 'cityrpg-ue5');
  assert.deepEqual(report.importCandidates, ['seed_script_weapon_hit_debug', 'starter.gather.loose_log_pickup']);
  assert.deepEqual(report.reviewCandidates, ['starter.gather.palm_chop_showcase']);
  assert.deepEqual(report.excludedCandidates.sort(), ['AbCdEfGhIjKlMnOpQr12', 'starter.player.custom_script'].sort());
  assert.equal(report.devAssignments.length, 1);
  assert.equal(report.devAssignments[0]?.scriptId, 'dev:palmchop');
  assert.equal(report.scripts.find((entry) => entry.scriptId === 'starter.player.custom_script')?.recommendation, 'exclude');
});
