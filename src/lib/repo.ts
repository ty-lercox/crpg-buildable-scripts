import fs from 'node:fs';
import path from 'node:path';

import {
  ImportManifest,
  LoadedRepoScript,
  RepoScriptMetadata,
  SCRIPT_ID_PATTERN,
} from './types';
import {
  ensureTrailingNewline,
  normalizeAllowedApis,
  normalizeLifecycle,
  normalizeStatus,
  normalizeTags,
  normalizeText,
} from './util';
import { validateBuildableScriptSource } from './validation';

export function findRepoRootFrom(startDir: string): string | null {
  let cursor = path.resolve(startDir);
  for (let step = 0; step < 12; step += 1) {
    const packageJsonPath = path.join(cursor, 'package.json');
    const importsPath = path.join(cursor, 'imports');
    const srcPath = path.join(cursor, 'src');
    if (fs.existsSync(packageJsonPath) && fs.existsSync(importsPath) && fs.existsSync(srcPath)) {
      return cursor;
    }

    const parent = path.dirname(cursor);
    if (!parent || parent === cursor) {
      break;
    }
    cursor = parent;
  }

  return null;
}

export function resolveRepoRoot(startDir?: string): string {
  const candidates = [
    startDir ?? '',
    typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '',
    __dirname,
  ].filter((entry) => entry.length > 0);

  for (const candidate of candidates) {
    const repoRoot = findRepoRootFrom(candidate);
    if (repoRoot) {
      return repoRoot;
    }
  }

  throw new Error('Unable to resolve repository root.');
}

export function getScriptsRoot(repoRoot: string): string {
  return path.join(repoRoot, 'scripts');
}

export function getArtifactsRoot(repoRoot: string): string {
  return path.join(repoRoot, 'artifacts');
}

function ensurePathInsideRepo(repoRoot: string, targetPath: string, label: string): string {
  const resolved = path.resolve(targetPath);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes repository root: ${targetPath}`);
  }
  return resolved;
}

export function resolveRepoFile(repoRoot: string, filePath: string, label: string): string {
  const trimmed = normalizeText(filePath);
  if (!trimmed) {
    throw new Error(`${label} is missing.`);
  }

  const resolved = path.isAbsolute(trimmed) ? trimmed : path.join(repoRoot, trimmed);
  return ensurePathInsideRepo(repoRoot, resolved, label);
}

function readRepoScriptMetadata(manifestPath: string): RepoScriptMetadata {
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  if (!Array.isArray(raw.tags)) {
    throw new Error(`tags must be an array: ${manifestPath}`);
  }
  if (!Array.isArray(raw.allowedApis)) {
    throw new Error(`allowedApis must be an array: ${manifestPath}`);
  }

  const status = normalizeText(raw.status).toLowerCase();
  if (status !== 'draft' && status !== 'published') {
    throw new Error(`status must be draft or published: ${manifestPath}`);
  }

  const lifecycle = normalizeText(raw.lifecycle).toLowerCase();
  if (lifecycle !== 'active' && lifecycle !== 'retired') {
    throw new Error(`lifecycle must be active or retired: ${manifestPath}`);
  }

  return {
    scriptId: normalizeText(raw.scriptId),
    title: normalizeText(raw.title),
    description: normalizeText(raw.description),
    tags: normalizeTags(raw.tags),
    allowedApis: normalizeAllowedApis(raw.allowedApis),
    status: normalizeStatus(status),
    lifecycle: normalizeLifecycle(lifecycle),
    legacyId: raw.legacyId === true,
  };
}

function walkScriptPackages(currentDir: string, packages: Array<{ manifestPath: string; scriptPath: string; scriptDir: string }>): void {
  const manifestPath = path.join(currentDir, 'script.json');
  const scriptPath = path.join(currentDir, 'script.ts');
  if (fs.existsSync(manifestPath) && fs.existsSync(scriptPath)) {
    packages.push({ manifestPath, scriptPath, scriptDir: currentDir });
    return;
  }

  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    walkScriptPackages(path.join(currentDir, entry.name), packages);
  }
}

export function listRepoScripts(repoRoot: string, onlyScriptIds: string[] = []): LoadedRepoScript[] {
  const scriptsRoot = getScriptsRoot(repoRoot);
  if (!fs.existsSync(scriptsRoot)) {
    return [];
  }

  const requestedIds = new Set(onlyScriptIds.map((entry) => normalizeText(entry)).filter((entry) => entry.length > 0));
  const loaded: LoadedRepoScript[] = [];
  const seenIds = new Set<string>();
  const packages: Array<{ manifestPath: string; scriptPath: string; scriptDir: string }> = [];
  walkScriptPackages(scriptsRoot, packages);

  for (const discovered of packages) {
    const { scriptDir, manifestPath, scriptPath } = discovered;
    const metadata = readRepoScriptMetadata(manifestPath);
    if (requestedIds.size > 0 && !requestedIds.has(metadata.scriptId)) {
      continue;
    }

    if (!metadata.scriptId) {
      throw new Error(`Missing scriptId in ${manifestPath}`);
    }
    if (!metadata.legacyId && !SCRIPT_ID_PATTERN.test(metadata.scriptId)) {
      throw new Error(`Invalid scriptId in ${manifestPath}: ${metadata.scriptId}`);
    }
    if (seenIds.has(metadata.scriptId)) {
      throw new Error(`Duplicate repo-managed scriptId detected: ${metadata.scriptId}`);
    }
    seenIds.add(metadata.scriptId);

    const scriptText = fs.readFileSync(scriptPath, 'utf8');
    validateBuildableScriptSource(scriptText, scriptPath);

    loaded.push({
      ...metadata,
      manifestPath,
      scriptPath,
      scriptDir,
      scriptText,
      effectiveStatus: metadata.lifecycle === 'retired' ? 'draft' : metadata.status,
      relativeScriptDir: path.relative(repoRoot, scriptDir),
    });
  }

  return loaded.sort((left, right) => left.scriptId.localeCompare(right.scriptId));
}

export function listExistingScriptLocations(repoRoot: string): Map<string, string> {
  const scriptsRoot = getScriptsRoot(repoRoot);
  const found = new Map<string, string>();
  if (!fs.existsSync(scriptsRoot)) {
    return found;
  }

  const packages: Array<{ manifestPath: string; scriptPath: string; scriptDir: string }> = [];
  walkScriptPackages(scriptsRoot, packages);
  for (const discovered of packages) {
    try {
      const raw = JSON.parse(fs.readFileSync(discovered.manifestPath, 'utf8')) as Record<string, unknown>;
      const scriptId = normalizeText(raw.scriptId);
      if (scriptId && !found.has(scriptId)) {
        found.set(scriptId, discovered.scriptDir);
      }
    } catch {
      // Ignore malformed packages during tolerant import discovery.
    }
  }

  return found;
}

export function readImportManifest(manifestPath: string): ImportManifest {
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  const scriptIds = Array.isArray(raw.scriptIds)
    ? raw.scriptIds.map((entry) => normalizeText(entry)).filter((entry) => entry.length > 0)
    : [];
  if (scriptIds.length === 0) {
    throw new Error(`Import manifest contains no scriptIds: ${manifestPath}`);
  }
  return { scriptIds };
}

function removeEmptyParentDirs(startDir: string, stopDir: string): void {
  let cursor = path.resolve(startDir);
  const normalizedStop = path.resolve(stopDir);

  while (cursor.startsWith(normalizedStop) && cursor !== normalizedStop) {
    const remaining = fs.readdirSync(cursor, { withFileTypes: true });
    if (remaining.length > 0) {
      return;
    }
    fs.rmdirSync(cursor);
    cursor = path.dirname(cursor);
  }
}

export function writeRepoScriptPackage(
  repoRoot: string,
  metadata: RepoScriptMetadata,
  scriptText: string,
  options?: { relativeDir?: string; existingScriptDir?: string | null }
): { scriptDir: string; action: 'created' | 'updated' | 'moved' } {
  const scriptsRoot = getScriptsRoot(repoRoot);
  const relativeDir = normalizeText(options?.relativeDir);
  const scriptDir = relativeDir ? path.join(repoRoot, relativeDir) : path.join(scriptsRoot, metadata.scriptId);
  const manifestPath = path.join(scriptDir, 'script.json');
  const scriptPath = path.join(scriptDir, 'script.ts');
  const existed = fs.existsSync(scriptDir);
  const existingScriptDir = options?.existingScriptDir ? path.resolve(options.existingScriptDir) : null;
  const moving = Boolean(existingScriptDir && existingScriptDir !== path.resolve(scriptDir) && fs.existsSync(existingScriptDir));

  fs.mkdirSync(scriptDir, { recursive: true });
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        scriptId: metadata.scriptId,
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        allowedApis: metadata.allowedApis,
        status: metadata.status,
        lifecycle: metadata.lifecycle,
        ...(metadata.legacyId ? { legacyId: true } : {}),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  fs.writeFileSync(scriptPath, ensureTrailingNewline(scriptText), 'utf8');

  if (moving && existingScriptDir) {
    fs.rmSync(existingScriptDir, { recursive: true, force: true });
    removeEmptyParentDirs(path.dirname(existingScriptDir), scriptsRoot);
  }

  return { scriptDir, action: moving ? 'moved' : existed ? 'updated' : 'created' };
}
