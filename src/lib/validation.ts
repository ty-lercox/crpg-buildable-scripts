import ts from 'typescript';

import {
  BUILDABLE_SCRIPT_MAX_CHARS,
  LoadedRepoScript,
  RepoScriptMetadata,
  SCRIPT_ID_PATTERN,
} from './types';
import { normalizeText } from './util';

export function validateBuildableScriptSource(scriptText: string, fileName: string): void {
  const trimmed = scriptText.trim();
  if (!trimmed) {
    throw new Error(`Script text missing: ${fileName}`);
  }
  if (scriptText.length > BUILDABLE_SCRIPT_MAX_CHARS) {
    throw new Error(`Script exceeds ${BUILDABLE_SCRIPT_MAX_CHARS} characters: ${fileName}`);
  }

  const transpile = ts.transpileModule(scriptText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName,
    reportDiagnostics: true,
  });

  const diagnostics = (transpile.diagnostics ?? []).filter((entry) => entry.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length > 0) {
    const messages = diagnostics.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, '\n'));
    throw new Error(`TypeScript transpile failed for ${fileName}: ${messages.join(' | ')}`);
  }

  const outputText = transpile.outputText ?? '';
  const bannedPatterns: Array<{ re: RegExp; label: string }> = [
    { re: /(^|[^\w$])require\s*\(/, label: 'require' },
    { re: /\bimport\s*\(/, label: 'dynamic import' },
    { re: /\bprocess\b/, label: 'process' },
  ];

  for (const pattern of bannedPatterns) {
    if (pattern.re.test(scriptText) || pattern.re.test(outputText)) {
      throw new Error(`Script contains unsupported ${pattern.label} usage: ${fileName}`);
    }
  }
}

export function validateRepoScriptMetadata(metadata: RepoScriptMetadata, manifestPath: string): void {
  if (!metadata.scriptId) {
    throw new Error(`scriptId is required: ${manifestPath}`);
  }
  if (!metadata.legacyId && !SCRIPT_ID_PATTERN.test(metadata.scriptId)) {
    throw new Error(`scriptId must be a semantic slug: ${metadata.scriptId}`);
  }
  if (metadata.legacyId && /[\\/]/.test(metadata.scriptId)) {
    throw new Error(`legacy scriptId must not contain path separators: ${metadata.scriptId}`);
  }
  if (metadata.title.length < 3 || metadata.title.length > 120) {
    throw new Error(`title must be 3-120 characters: ${manifestPath}`);
  }
  if (metadata.description.length > 4000) {
    throw new Error(`description must be <= 4000 characters: ${manifestPath}`);
  }
  if (metadata.tags.length > 40) {
    throw new Error(`tags must contain <= 40 values: ${manifestPath}`);
  }
  if (metadata.allowedApis.length > 32) {
    throw new Error(`allowedApis must contain <= 32 values: ${manifestPath}`);
  }
}

export function validateLoadedRepoScripts(scripts: LoadedRepoScript[]): void {
  const seenIds = new Set<string>();
  for (const script of scripts) {
    validateRepoScriptMetadata(script, script.manifestPath);
    validateBuildableScriptSource(script.scriptText, script.scriptPath);

    if (seenIds.has(script.scriptId)) {
      throw new Error(`Duplicate repo-managed scriptId detected: ${script.scriptId}`);
    }
    seenIds.add(script.scriptId);

    const folderName = normalizeText(script.scriptDir.split(/[\\/]/).pop());
    if (folderName !== script.scriptId) {
      throw new Error(`Script directory name must match scriptId: ${script.scriptDir}`);
    }
  }
}
