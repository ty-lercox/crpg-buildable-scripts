const NPC_ID = 'skeleton_captain';
const QUEST_MARKER_ID = 'marker_starter_weapon_skeletons';
const SPAWN_OPTIONS = {
  enableRespawn: true,
  respawnDelaySeconds: 20,
  levelOverride: 1,
  spawnOffset: { x: 0, y: 0, z: 120 },
  healthMultiplier: 0.05,
  damageMultiplier: 0.05,
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function onBeginPlay(ctx: { buildableActorId: string }, api: any) {
  api.buildable.setInteractable(false);
  api.buildable.ensureNpcMarker(QUEST_MARKER_ID, {
    label: 'First Combat',
    offset: SPAWN_OPTIONS.spawnOffset,
  });

  const ok = api.buildable.spawnNpc(NPC_ID, SPAWN_OPTIONS);
  if (!ok) {
    console.warn(`[TS][buildables] simple npc spawn failed for ${ctx.buildableActorId} npcId=${NPC_ID}`);
  }
}

export function onNpcKilled(
  ctx: { playerId?: string; buildableActorId: string },
  api: any,
  kill: { victimActorId?: string }
) {
  const playerId = normalizeText(ctx?.playerId);
  if (!playerId) {
    return;
  }

  const victim = normalizeText(kill?.victimActorId) || 'enemy';
  api.toastTo(playerId, `Enemy defeated: ${victim}`);
}
