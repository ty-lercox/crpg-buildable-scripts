const ROCK_TYPE = "stone";

const ROCK_DEFINITIONS: Record<
  string,
  {
    label: string;
    requiredLevel: number;
    maxHealth: number;
    respawnMs: number;
    itemClassPath: string;
    xpOnBreak: number;
  }
> = {
  stone: {
    label: "Stone",
    requiredLevel: 1,
    maxHealth: 5,
    respawnMs: 60_000,
    itemClassPath: "/Game/CRPG/Items/Mining/Item_Stone.Item_Stone_C",
    xpOnBreak: 25,
  },
};

const SKILL_TAG_MINING = "Skill.Mining";
const MANUAL_MINE_COOLDOWN_MS = 500;
const STONE_DROP_MIN = 1;
const STONE_DROP_MAX = 5;
const SHOW_DAMAGE_TOAST = true;
const DISABLE_INTERACT_OUTLINE = true;
const DEPLETED_SCALE_MULTIPLIER = 0.1;

const HIT_SFX = "mining.stone.hit";
const HIT_VFX = "mining.stone.hit.placeholder";
const BROKE_SFX = "mining.stone.break";
const MINE_MONTAGE = "gathering.mining.swing";

const def = (ROCK_DEFINITIONS as any)[ROCK_TYPE] ?? ROCK_DEFINITIONS.stone;

type StoneNodeState = {
  depleted: boolean;
  health: number;
  respawnAtMs: number;
  respawnTimer?: any;
};

const nodeStateByBuildable = new Map<string, StoneNodeState>();
const GLOBAL_COOLDOWN_KEY = "__crpg_stone_mine_cooldowns";
const globalAny = globalThis as any;
const lastHitMsByPlayer: Map<string, number> =
  globalAny[GLOBAL_COOLDOWN_KEY] instanceof Map ? globalAny[GLOBAL_COOLDOWN_KEY] : new Map();
globalAny[GLOBAL_COOLDOWN_KEY] = lastHitMsByPlayer;

function randInt(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

function getNodeState(buildableActorId: string): StoneNodeState {
  const key = (buildableActorId ?? "").trim();
  if (!key) {
    return { depleted: false, health: def.maxHealth, respawnAtMs: 0 };
  }

  const existing = nodeStateByBuildable.get(key);
  if (existing) {
    return existing;
  }

  const created: StoneNodeState = {
    depleted: false,
    health: def.maxHealth,
    respawnAtMs: 0,
    respawnTimer: undefined,
  };
  nodeStateByBuildable.set(key, created);
  return created;
}

function startRespawnTimer(buildableActorId: string, api: any) {
  const state = getNodeState(buildableActorId);
  if (state.respawnTimer) {
    clearTimeout(state.respawnTimer);
    state.respawnTimer = undefined;
  }

  state.respawnAtMs = Date.now() + def.respawnMs;
  state.respawnTimer = setTimeout(() => {
    state.depleted = false;
    state.health = def.maxHealth;
    state.respawnAtMs = 0;
    state.respawnTimer = undefined;
    api.buildable.restore();
    api.buildable.setScale(1.0);
  }, def.respawnMs);
}

function getCooldownKey(buildableActorId: string, playerId: string): string {
  return `${buildableActorId}:${playerId}`;
}

function tryMine(api: any, buildableActorId: string, playerId: string) {
  const now = Date.now();
  const cooldownKey = getCooldownKey(buildableActorId, playerId);
  const last = lastHitMsByPlayer.get(cooldownKey) ?? 0;
  if (now - last < MANUAL_MINE_COOLDOWN_MS) {
    return;
  }
  lastHitMsByPlayer.set(cooldownKey, now);

  const state = getNodeState(buildableActorId);
  const remainingRespawnMs = state.respawnAtMs > 0 ? state.respawnAtMs - now : 0;
  if (state.depleted) {
    api.toastTo(playerId, `${def.label} is depleted. Respawns in ${formatSeconds(remainingRespawnMs)}.`);
    return;
  }

  const level = api.skills.getLevel(SKILL_TAG_MINING);
  if (level < def.requiredLevel) {
    api.toastTo(playerId, `Need Mining ${def.requiredLevel} to mine ${def.label} (you are ${level}).`);
    return;
  }

  const damage = 1;
  state.health = Math.max(0, state.health - damage);

  api.player.playAnimation(playerId, MINE_MONTAGE, { loop: false });
  api.audio.playOneShotAtBuildable(HIT_SFX, { volume: 0.7, radius: 900, pitch: 1.0 });
  api.vfx.playOneShotAtHit(HIT_VFX, { scale: 1.0, radius: 1200, alignToSurfaceNormal: true });
  if (SHOW_DAMAGE_TOAST) {
    api.toastTo(playerId, `${def.label} hit for ${damage}. HP ${state.health}/${def.maxHealth}`);
  }

  if (state.health > 0) {
    return;
  }

  state.depleted = true;
  api.buildable.setScale(DEPLETED_SCALE_MULTIPLIER);
  startRespawnTimer(buildableActorId, api);

  const stoneCount = randInt(STONE_DROP_MIN, STONE_DROP_MAX);
  api.inventory.addItemByClassPath(def.itemClassPath, stoneCount);
  api.skills.addXp(SKILL_TAG_MINING, def.xpOnBreak);

  api.audio.playOneShotAtBuildable(BROKE_SFX, { volume: 0.35, radius: 1200, pitch: 0.95 });
  api.toastTo(
    playerId,
    `+${stoneCount} stone${stoneCount === 1 ? "" : "s"}, +${def.xpOnBreak} Mining XP. (${formatSeconds(
      def.respawnMs
    )} respawn)`
  );
}

export function onHit(
  ctx: { buildableActorId: string },
  api: any,
  hit: { playerId?: string; toolType?: string; itemId?: string }
) {
  if (!hit.playerId) {
    return;
  }

  const source = `${hit.toolType ?? ""} ${hit.itemId ?? ""}`.toLowerCase();
  const isPickaxe = source.includes("pickaxe");
  if (!isPickaxe) {
    console.log("[TS][buildables] onHit ignored non-pickaxe", JSON.stringify(hit));
    return;
  }

  tryMine(api, ctx.buildableActorId, hit.playerId);
}

export function onBeginPlay(ctx: { buildableActorId: string }, api: any) {
  if (!DISABLE_INTERACT_OUTLINE) {
    return;
  }

  // Keep stone nodes hit-driven only (no interact prompt/outline).
  api.buildable.setInteractable(false);
  console.log("[TS][buildables] stone onBeginPlay, interact disabled", ctx.buildableActorId);
}
