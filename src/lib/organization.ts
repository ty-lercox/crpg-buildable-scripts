import path from 'node:path';

import { FirestoreCatalogScript, LoadedRepoScript } from './types';

type ScriptGroupInput = {
  scriptId: string;
  title: string;
  ownerId?: string | null;
};

function includesAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

export function getSuggestedFolderSegments(input: ScriptGroupInput): string[] {
  const scriptId = input.scriptId.trim().toLowerCase();
  const title = input.title.trim().toLowerCase();
  const ownerId = typeof input.ownerId === 'string' ? input.ownerId.trim() : '';

  if (ownerId) {
    return ['user-owned'];
  }

  if (
    scriptId.startsWith('starter.gather.')
    || scriptId === 'chop_plam'
    || includesAny(title, ['loose log', 'loose stone', 'palm chop', 'stone mine'])
  ) {
    if (scriptId.includes('showcase')) {
      return ['gathering', 'showcase'];
    }
    if (scriptId === 'chop_plam') {
      return ['gathering', 'legacy'];
    }
    return ['gathering', 'starter'];
  }

  if (
    scriptId.startsWith('starter.combat.')
    || scriptId === 'npckillrewards'
    || includesAny(title, ['combat', 'npc spawn', 'kill rewards'])
  ) {
    if (scriptId.includes('showcase')) {
      return ['combat', 'showcase'];
    }
    if (scriptId === 'npckillrewards') {
      return ['combat', 'legacy'];
    }
    return ['combat', 'starter'];
  }

  if (scriptId.startsWith('seed_script_npc_') && scriptId.endsWith('_dialogue')) {
    return ['npc', 'dialogue'];
  }

  if (scriptId.startsWith('seed_script_welcome_aboard_') || title.includes('welcome aboard')) {
    return ['questing', 'welcome-aboard'];
  }

  if (scriptId.includes('weapon_hit_debug') || title.includes('debug') || title.includes('hit test')) {
    return ['debug'];
  }

  if (
    includesAny(scriptId, ['townhall', 'bank'])
    || includesAny(title, ['town hall', 'bank'])
  ) {
    return ['ui', 'civic'];
  }

  if (includesAny(scriptId, ['furnace']) || includesAny(title, ['furnace'])) {
    return ['ui', 'crafting'];
  }

  if (scriptId.includes('showcase')) {
    return ['showcase'];
  }

  return ['misc'];
}

export function getSuggestedScriptDir(repoRoot: string, input: ScriptGroupInput): string {
  return path.join(repoRoot, 'scripts', ...getSuggestedFolderSegments(input), input.scriptId);
}

export function getSuggestedRelativeScriptDir(input: ScriptGroupInput): string {
  return path.join('scripts', ...getSuggestedFolderSegments(input), input.scriptId);
}
