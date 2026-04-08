import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { listRepoScripts } from '../lib/repo';
import { validateBuildableScriptSource, validateLoadedRepoScripts } from '../lib/validation';
import { BUILDABLE_SCRIPT_MAX_CHARS } from '../lib/types';
import { cleanupTempRepo, createTempRepo, writeRepoScript } from './testHelpers';

test('validate-repo: valid repo package loads and validates', () => {
  const repoRoot = createTempRepo();
  try {
    writeRepoScript(repoRoot, { scriptId: 'starter.gather.loose_log_pickup', title: 'Loose Log Pickup' }, 'export function onInteract() { return true; }');
    const scripts = listRepoScripts(repoRoot);
    validateLoadedRepoScripts(scripts);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0]?.scriptId, 'starter.gather.loose_log_pickup');
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('validate-repo: AUDIO refs stay in script text without catalog inlining', () => {
  const repoRoot = createTempRepo();
  try {
    writeRepoScript(
      repoRoot,
      { scriptId: 'ui.bank_menu', title: 'Bank Menu', allowedApis: ['audio', 'ui'] },
      'export function onInteract(ctx, api) { api.audio.playOneShotForPlayer(ctx.playerId, AUDIO.ui.menu.open); api.ui.openBankView(); }\n'
    );

    const scripts = listRepoScripts(repoRoot);
    validateLoadedRepoScripts(scripts);

    assert.equal(scripts.length, 1);
    assert.equal((scripts[0]?.scriptText ?? '').includes('const AUDIO ='), false);
    assert.equal((scripts[0]?.scriptText ?? '').includes('AUDIO.ui.menu.open'), true);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('validate-repo: invalid status fails loudly', () => {
  const repoRoot = createTempRepo();
  try {
    writeRepoScript(repoRoot, { scriptId: 'starter.gather.bad_status' }, 'export function onInteract() { return true; }');
    const manifestPath = path.join(repoRoot, 'scripts', 'starter.gather.bad_status', 'script.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.status = 'archived';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    assert.throws(() => listRepoScripts(repoRoot), /status must be draft or published/i);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('validate-repo: banned runtime features fail validation', () => {
  assert.throws(
    () => validateBuildableScriptSource('export async function load() { return import("./later"); }', 'script.ts'),
    /unsupported/i
  );
  assert.throws(() => validateBuildableScriptSource('const fs = require("fs");', 'script.ts'), /require/i);
});

test('validate-repo: oversized scripts fail validation', () => {
  const oversized = `export const text = "${'x'.repeat(BUILDABLE_SCRIPT_MAX_CHARS)}";`;
  assert.throws(() => validateBuildableScriptSource(oversized, 'script.ts'), /exceeds/i);
});

test('validate-repo: duplicate script ids across folders are rejected', () => {
  const repoRoot = createTempRepo();
  try {
    writeRepoScript(repoRoot, { scriptId: 'starter.gather.duplicate', title: 'A' }, 'export const a = 1;');
    const otherDir = path.join(repoRoot, 'scripts', 'different-folder');
    fs.mkdirSync(otherDir, { recursive: true });
    fs.writeFileSync(
      path.join(otherDir, 'script.json'),
      `${JSON.stringify(
        {
          scriptId: 'starter.gather.duplicate',
          title: 'B',
          description: '',
          tags: [],
          allowedApis: ['*'],
          status: 'published',
          lifecycle: 'active',
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    fs.writeFileSync(path.join(otherDir, 'script.ts'), 'export const b = 2;\n', 'utf8');
    assert.throws(() => listRepoScripts(repoRoot), /duplicate repo-managed scriptId/i);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('validate-repo: scripts without shared audio refs are not rewritten', () => {
  const repoRoot = createTempRepo();
  try {
    const scriptText = 'export function onInteract() { return true; }\n';
    writeRepoScript(repoRoot, { scriptId: 'starter.gather.no_audio_helper', title: 'No Audio Helper' }, scriptText);

    const scripts = listRepoScripts(repoRoot);
    assert.equal(scripts[0]?.scriptText, scriptText);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});

test('validate-repo: legacy ids are allowed when explicitly marked', () => {
  const repoRoot = createTempRepo();
  try {
    writeRepoScript(repoRoot, { scriptId: 'npcKillRewards', title: 'npcKillRewards' }, 'export const ok = true;');
    const manifestPath = path.join(repoRoot, 'scripts', 'npcKillRewards', 'script.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.legacyId = true;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const scripts = listRepoScripts(repoRoot);
    validateLoadedRepoScripts(scripts);
    assert.equal(scripts[0]?.legacyId, true);
  } finally {
    cleanupTempRepo(repoRoot);
  }
});
