const TREE_TYPE = "tree";

const TREE_DEFINITIONS: Record<
  string,
  {
    label: string;
    requiredLevel: number;
    maxHealth: number;
    respawnMs: number;
    itemClassPath: string;
    xpOnFell: number;
  }
> = {
  tree: {
    label: "Tree",
    requiredLevel: 1,
    maxHealth: 5,
    respawnMs: 60_000,
    itemClassPath: "/Game/CRPG/Items/Woodcutting/Item_Log.Item_Log_C",
    xpOnFell: 25,
  },
};

const SKILL_TAG_WOODCUTTING = "Skill.Woodcutting";
const MANUAL_CHOP_COOLDOWN_MS = 2000;
const LOG_DROP_MIN = 1;
const LOG_DROP_MAX = 5;
const SHOW_DAMAGE_TOAST = true;
const DISABLE_INTERACT_OUTLINE = true;
const TREE_FALL_IMPULSE_STRENGTH = 90_000;
const TREE_FALL_UPWARD_IMPULSE = 32_000;

const HIT_SFX = "woodcutting.palm.hit";
const HIT_VFX = "woodcutting.palm.hit.placeholder";
const FELLED_SFX = "woodcutting.palm.felled";
const CHOP_MONTAGE = "gathering.woodcutting.chop";

// Asset ids still use the older palm names.
const def = (TREE_DEFINITIONS as any)[TREE_TYPE] ?? TREE_DEFINITIONS.tree;

type TreeNodeState = {
  depleted: boolean;
  health: number;
  respawnAtMs: number;
  respawnTimer?: any;
};

const nodeStateByBuildable = new Map<string, TreeNodeState>();
const GLOBAL_COOLDOWN_KEY = "__crpg_tree_chop_cooldowns";
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

function getNodeState(buildableActorId: string): TreeNodeState {
  const key = (buildableActorId ?? "").trim();
  if (!key) {
    return { depleted: false, health: def.maxHealth, respawnAtMs: 0 };
  }

  const existing = nodeStateByBuildable.get(key);
  if (existing) {
    return existing;
  }

  const created: PalmNodeState = {
    depleted: false,
    health: def.maxHealth,
    respawnAtMs: 0,
    respawnTimer: undefined,
  };
  nodeStateByBuildable.set(key, created);
  return created;
}

function startRespawnTimer(buildableActorId: string, onRespawn?: () => void) {
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
    if (onRespawn) {
      onRespawn();
    }
  }, def.respawnMs);
}

function getCooldownKey(buildableActorId: string, playerId: string): string {
  return `${buildableActorId}:${playerId}`;
}

function tryChop(api: any, buildableActorId: string, playerId: string, damageOverride?: number) {
  const now = Date.now();
  const cooldownKey = getCooldownKey(buildableActorId, playerId);
  const last = lastHitMsByPlayer.get(cooldownKey) ?? 0;
  if (now - last < MANUAL_CHOP_COOLDOWN_MS) {
    return;
  }
  lastHitMsByPlayer.set(cooldownKey, now);

  const state = getNodeState(buildableActorId);
  const remainingRespawnMs = state.respawnAtMs > 0 ? state.respawnAtMs - now : 0;
  if (state.depleted) {
    api.toastTo(playerId, `${def.label} is felled. Respawns in ${formatSeconds(remainingRespawnMs)}.`);
    return;
  }

  const level = api.skills.getLevel(SKILL_TAG_WOODCUTTING);
  if (level < def.requiredLevel) {
    api.toastTo(playerId, `Need Woodcutting ${def.requiredLevel} to chop ${def.label} (you are ${level}).`);
    return;
  }

  const damage = Math.max(1, Math.floor(damageOverride ?? 1));
  state.health = Math.max(0, state.health - damage);

  api.player.playAnimation(playerId, CHOP_MONTAGE, { loop: false });
  api.audio.playOneShotAtBuildable(HIT_SFX, { volume: 0.8, radius: 900, pitch: 1.0 });
  api.vfx.playOneShotAtHit(HIT_VFX, { scale: 1.0, radius: 1200, alignToSurfaceNormal: true });
  if (SHOW_DAMAGE_TOAST) {
    api.toastTo(playerId, `${def.label} hit for ${damage}. HP ${state.health}/${def.maxHealth}`);
  }

  if (state.health > 0) {
    return;
  }

  state.depleted = true;
  startRespawnTimer(buildableActorId, () => api.buildable.restore());
  api.buildable.fall({
    impulseStrength: TREE_FALL_IMPULSE_STRENGTH,
    upwardImpulse: TREE_FALL_UPWARD_IMPULSE,
  });

  const logs = randInt(LOG_DROP_MIN, LOG_DROP_MAX);
  api.inventory.addItemByClassPath(def.itemClassPath, logs);
  api.skills.addXp(SKILL_TAG_WOODCUTTING, def.xpOnFell);

  api.audio.playOneShotAtBuildable(FELLED_SFX, { volume: 0.35, radius: 1200, pitch: 0.95 });
  api.toastTo(playerId, `+${logs} logs, +${def.xpOnFell} Woodcutting XP. (${formatSeconds(def.respawnMs)} respawn)`);
}

export function onHit(
  ctx: { buildableActorId: string },
  api: any,
  hit: { playerId?: string; toolType?: string; itemId?: string; damage?: number }
) {
  if (!hit.playerId) {
    return;
  }

  const source = `${hit.toolType ?? ""} ${hit.itemId ?? ""}`.toLowerCase();
  const isSword = source.includes("sword") || source.includes("katana") || source.includes("rapier");
  if (!isSword) {
    console.log("[TS][buildables] onHit ignored non-sword", JSON.stringify(hit));
    return;
  }

  const rawDamage = typeof hit.damage === "number" && Number.isFinite(hit.damage) ? hit.damage : 0;
  const damage = rawDamage > 0 ? Math.floor(rawDamage) : 1;
  tryChop(api, ctx.buildableActorId, hit.playerId, damage);
}

export function onBeginPlay(ctx: { buildableActorId: string }, api: any) {
  if (!DISABLE_INTERACT_OUTLINE) {
    return;
  }

  // Keep tree nodes hit-driven only (no interact prompt/outline).
  api.buildable.setInteractable(false);
  console.log("[TS][buildables] tree onBeginPlay, interact disabled", ctx.buildableActorId);
}
