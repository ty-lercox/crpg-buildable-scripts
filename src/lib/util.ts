import { RepoScriptLifecycle, RepoScriptStatus } from './types';

export function normalizeText(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

export function normalizeNullableText(raw: unknown): string | null {
  const value = normalizeText(raw);
  return value || null;
}

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const out = new Set<string>();
  for (const entry of raw) {
    const value = normalizeText(entry);
    if (value) {
      out.add(value);
    }
  }
  return Array.from(out.values());
}

export function normalizeAllowedApis(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return ['*'];
  }

  const out = new Set<string>();
  for (const entry of raw) {
    const value = String(entry ?? '').trim().toLowerCase();
    if (value) {
      out.add(value);
    }
  }

  const normalized = Array.from(out.values()).sort((left, right) => left.localeCompare(right));
  return normalized.length > 0 ? normalized : ['*'];
}

export function normalizeStatus(raw: unknown): RepoScriptStatus {
  return normalizeText(raw).toLowerCase() === 'draft' ? 'draft' : 'published';
}

export function normalizeLifecycle(raw: unknown): RepoScriptLifecycle {
  return normalizeText(raw).toLowerCase() === 'retired' ? 'retired' : 'active';
}

export function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export function looksLikeFirestoreAutoId(scriptId: string): boolean {
  return /^[A-Za-z0-9]{20}$/.test(scriptId);
}

export function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

export function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

export function normalizeScriptTextForDiff(value: string): string {
  return ensureTrailingNewline(value.replace(/\r\n/g, '\n'));
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter((entry) => entry.length > 0))).sort((left, right) =>
    left.localeCompare(right)
  );
}
