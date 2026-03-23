const COOLDOWN_MS = 750;
const LOG_COOLDOWN_MS = 250;
const lastToastAtByPlayer = new Map<string, number>();
const lastLogAtByPlayer = new Map<string, number>();

function normalizeText(value?: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

function shortId(value?: string): string {
  if (!value) return '';
  if (value.length <= 72) return value;
  return `${value.slice(0, 32)}...${value.slice(-32)}`;
}

function classifyTool(toolType?: string, itemId?: string): string {
  const tool = normalizeText(toolType).toLowerCase();
  const item = normalizeText(itemId).toLowerCase();
  const hay = `${tool} ${item}`.trim();

  if (!hay) return 'Unknown';
  if (hay.includes('pickaxe')) return 'Pickaxe';
  if (hay.includes('axe')) return 'Axe';
  if (hay.includes('sword') || hay.includes('katana') || hay.includes('rapier')) return 'Sword';
  return toolType?.trim() || 'Unknown';
}

export function onInteract(ctx: { buildableActorId: string; playerId?: string }, api: any) {
  api.toast(`Weapon hit debug active on ${ctx.buildableActorId}. Hit it with a weapon.`);
}

export function onHit(
  ctx: { buildableActorId: string; playerId?: string },
  api: any,
  hit: { playerId: string; toolType?: string; itemId?: string; damage?: number }
) {
  const playerId = normalizeText(hit?.playerId);
  if (!playerId) {
    console.log('[TS][buildables] onHit missing playerId', hit);
    return;
  }

  const now = Date.now();
  const lastLog = lastLogAtByPlayer.get(playerId) ?? 0;
  if (now - lastLog >= LOG_COOLDOWN_MS) {
    console.log(
      '[TS][buildables] onHit received',
      `buildable=${ctx.buildableActorId}`,
      `player=${playerId}`,
      `tool=${hit?.toolType ?? 'n/a'}`,
      `item=${hit?.itemId ?? 'n/a'}`,
      `dmg=${typeof hit?.damage === 'number' ? hit.damage : 'n/a'}`
    );
    lastLogAtByPlayer.set(playerId, now);
  }

  const last = lastToastAtByPlayer.get(playerId) ?? 0;
  if (now - last < COOLDOWN_MS) return;
  lastToastAtByPlayer.set(playerId, now);

  const canonical = classifyTool(hit?.toolType, hit?.itemId);
  const rawTool = normalizeText(hit?.toolType) || 'Unknown';
  const itemShort = shortId(normalizeText(hit?.itemId));
  const damage = typeof hit?.damage === 'number' && Number.isFinite(hit.damage) ? hit.damage : undefined;
  const damageLabel = damage !== undefined ? ` dmg=${Math.round(damage * 100) / 100}` : '';
  const itemLabel = itemShort ? ` item=${itemShort}` : '';

  api.toastTo(playerId, `Hit detected: tool=${canonical} (raw=${rawTool})${itemLabel}${damageLabel}`);
}
