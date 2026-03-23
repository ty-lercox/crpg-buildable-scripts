import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { importCuratedScripts } from '../lib/importCurated';
import { cleanupTempRepo, createTempRepo, MemoryScriptCatalogStore } from './testHelpers';

test('import-curated: writes Firestore scripts into the repo package format', async () => {
  const repoRoot = createTempRepo();
  try {
    fs.writeFileSync(
      path.join(repoRoot, 'imports', 'initial-curated.json'),
      `${JSON.stringify({ scriptIds: ['starter.gather.loose_log_pickup'] }, null, 2)}\n`,
      'utf8'
    );

    const store = new MemoryScriptCatalogStore();
    store.scripts.set('starter.gather.loose_log_pickup', {
      title: 'Loose Log Pickup',
      description: 'desc',
      tags: ['starter', 'gather'],
      status: 'published',
      language: 'ts',
      scriptText: 'export function onInteract() { return true; }\n',
      allowedApis: ['*'],
      version: 2,
      updatedBy: 'codex',
      ownerId: null,
    });

    const result = await importCuratedScripts(store, { repoRoot });
    assert.equal(result.importedCount, 1);

    const manifestPath = path.join(
      repoRoot,
      'scripts',
      'gathering',
      'starter',
      'starter.gather.loose_log_pickup',
      'script.json'
    );
    const scriptPath = path.join(
      repoRoot,
      'scripts',
      'gathering',
      'starter',
      'starter.gather.loose_log_pickup',
      'script.ts'
    );
    assert.equal(fs.existsSync(manifestPath), true);
    assert.equal(fs.existsSync(scriptPath), true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    assert.equal(manifest.scriptId, 'starter.gather.loose_log_pickup');
    assert.equal(manifest.lifecycle, 'active');
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('import-curated: --all imports user-owned and legacy scripts into grouped folders', async () => {
  const repoRoot = createTempRepo();
  try {
    const store = new MemoryScriptCatalogStore();
    store.scripts.set('townhall_menu', {
      title: 'townhall_menu',
      description: '',
      tags: [],
      status: 'published',
      language: 'ts',
      scriptText: 'export const ui = true;\n',
      allowedApis: ['*'],
      version: 1,
      updatedBy: null,
      ownerId: null,
    });
    store.scripts.set('h6deXXhNHFGDsiqVGWDY', {
      title: 'Loose Log',
      description: '',
      tags: [],
      status: 'published',
      language: 'ts',
      scriptText: 'export const userOwned = true;\n',
      allowedApis: ['*'],
      version: 1,
      updatedBy: 'player',
      ownerId: 'player-1',
    });

    const result = await importCuratedScripts(store, { repoRoot, importAll: true });
    assert.equal(result.importedCount, 2);
    assert.equal(
      fs.existsSync(path.join(repoRoot, 'scripts', 'ui', 'civic', 'townhall_menu', 'script.json')),
      true
    );
    assert.equal(
      fs.existsSync(path.join(repoRoot, 'scripts', 'user-owned', 'h6deXXhNHFGDsiqVGWDY', 'script.json')),
      true
    );
    const legacyManifest = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'scripts', 'ui', 'civic', 'townhall_menu', 'script.json'), 'utf8')
    ) as Record<string, unknown>;
    const userOwnedManifest = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'scripts', 'user-owned', 'h6deXXhNHFGDsiqVGWDY', 'script.json'), 'utf8')
    ) as Record<string, unknown>;
    assert.equal(legacyManifest.legacyId, undefined);
    assert.equal(userOwnedManifest.legacyId, true);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});
