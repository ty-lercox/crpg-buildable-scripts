const ORE_TYPE = "copper";

const ORE_DEFINITIONS: Record<
  string,
  {
    label: string;
    dropLabel: string;
    requiredLevel: number;
    requiredPickaxeLabel: string;
    requiredPickaxeTokens: string[];
    maxHealth: number;
    respawnMs: number;
    itemClassPath: string;
    xpOnBreak: number;
    dropMin: number;
    dropMax: number;
  }
> = {
  copper: {
    label: "Copper",
    dropLabel: "copper ore",
    requiredLevel: 1,
    requiredPickaxeLabel: "Wood Pickaxe",
    requiredPickaxeTokens: ["wood_pickaxe", "pickaxe_wood", "woodpickaxe", "wood pickaxe"],
    maxHealth: 5,
    respawnMs: 90_000,
    itemClassPath: "/Game/CRPG/Items/Mining/Item_CopperOre.Item_CopperOre_C",
    xpOnBreak: 35,
    dropMin: 1,
    dropMax: 3,
  },
};

const SKILL_TAG_MINING = "Skill.Mining";
const MANUAL_MINE_COOLDOWN_MS = 500;
const SHOW_DAMAGE_TOAST = true;
const DISABLE_INTERACT_OUTLINE = true;
const DEPLETED_SCALE_MULTIPLIER = 0.1;

const HIT_SFX = "mining.stone.hit";
const HIT_VFX = "mining.stone.hit.placeholder";
const BROKE_SFX = "mining.stone.break";
const MINE_MONTAGE = "gathering.mining.swing";

const def = (ORE_DEFINITIONS as any)[ORE_TYPE] ?? ORE_DEFINITIONS.copper;

type OreNodeState = {
  depleted: boolean;
  health: number;
  respawnAtMs: number;
  respawnTimer?: any;
};

const nodeStateByBuildable = new Map<string, OreNodeState>();
const GLOBAL_COOLDOWN_KEY = "__crpg_copper_mine_cooldowns";
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

function getNodeState(buildableActorId: string): OreNodeState {
  const key = (buildableActorId ?? "").trim();
  if (!key) {
    return { depleted: false, health: def.maxHealth, respawnAtMs: 0 };
  }

  const existing = nodeStateByBuildable.get(key);
  if (existing) {
    return existing;
  }

  const created: OreNodeState = {
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

function hasRequiredPickaxeTier(source: string): boolean {
  return def.requiredPickaxeTokens.some((token) => source.includes(token));
}

function tryMine(api: any, buildableActorId: string, playerId: string, source: string) {
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

  if (!hasRequiredPickaxeTier(source)) {
    api.toastTo(playerId, `${def.label} requires ${def.requiredPickaxeLabel}.`);
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

  const oreCount = randInt(def.dropMin, def.dropMax);
  api.inventory.addItemByClassPath(def.itemClassPath, oreCount);
  api.skills.addXp(SKILL_TAG_MINING, def.xpOnBreak);

  api.audio.playOneShotAtBuildable(BROKE_SFX, { volume: 0.35, radius: 1200, pitch: 0.95 });
  api.toastTo(
    playerId,
    `+${oreCount}x ${def.dropLabel}, +${def.xpOnBreak} Mining XP. (${formatSeconds(def.respawnMs)} respawn)`
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

  tryMine(api, ctx.buildableActorId, hit.playerId, source);
}

export function onBeginPlay(ctx: { buildableActorId: string }, api: any) {
  if (!DISABLE_INTERACT_OUTLINE) {
    return;
  }

  api.buildable.setInteractable(false);
  console.log("[TS][buildables] copper onBeginPlay, interact disabled", ctx.buildableActorId);
}
