type TreeDefinition = {
  label: string;
  requiredLevel: number;
  requiredAxeLabel: string;
  requiredAxeTokens: string[];
  maxHealth: number;
  respawnMs: number;
  itemClassPath: string;
  xpOnFell: number;
  dropMin: number;
  dropMax: number;
};

const def: TreeDefinition = {
  label: "Maple",
  requiredLevel: 15,
  requiredAxeLabel: "Iron Axe",
  requiredAxeTokens: ["iron_axe", "axe_iron", "ironaxe", "iron axe"],
  maxHealth: 9,
  respawnMs: 120_000,
  itemClassPath: "/Game/CRPG/Items/Woodcutting/Item_Log.Item_Log_C",
  xpOnFell: 70,
  dropMin: 3,
  dropMax: 6,
};

const SKILL_TAG_WOODCUTTING = "Skill.Woodcutting";
const MANUAL_CHOP_COOLDOWN_MS = 2000;
const SHOW_DAMAGE_TOAST = true;
const DISABLE_INTERACT_OUTLINE = true;
const TREE_FALL_IMPULSE_STRENGTH = 90_000;
const TREE_FALL_UPWARD_IMPULSE = 32_000;

const HIT_SFX = "woodcutting.palm.hit";
const HIT_VFX = "woodcutting.palm.hit.placeholder";
const FELLED_SFX = "woodcutting.palm.felled";
const CHOP_MONTAGE = "gathering.woodcutting.chop";

type TreeNodeState = {
  depleted: boolean;
  health: number;
  respawnAtMs: number;
  respawnTimer?: any;
};

const nodeStateByBuildable = new Map<string, TreeNodeState>();
const GLOBAL_COOLDOWN_KEY = "__crpg_maple_tree_chop_cooldowns";
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

  const created: TreeNodeState = {
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

function hasRequiredAxeTier(source: string): boolean {
  return def.requiredAxeTokens.some((token) => source.includes(token));
}

function tryChop(api: any, buildableActorId: string, playerId: string, source: string, damageOverride?: number) {
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

  if (!hasRequiredAxeTier(source)) {
    api.toastTo(playerId, `${def.label} requires ${def.requiredAxeLabel}.`);
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

  const logs = randInt(def.dropMin, def.dropMax);
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
  const isPickaxe = source.includes("pickaxe");
  const isAxe = source.includes("axe") && !isPickaxe;
  if (!isAxe) {
    console.log("[TS][buildables] onHit ignored non-axe", JSON.stringify(hit));
    return;
  }

  const rawDamage = typeof hit.damage === "number" && Number.isFinite(hit.damage) ? hit.damage : 0;
  const damage = rawDamage > 0 ? Math.floor(rawDamage) : 1;
  tryChop(api, ctx.buildableActorId, hit.playerId, source, damage);
}

export function onBeginPlay(ctx: { buildableActorId: string }, api: any) {
  if (!DISABLE_INTERACT_OUTLINE) {
    return;
  }

  api.buildable.setInteractable(false);
  console.log("[TS][buildables] maple onBeginPlay, interact disabled", ctx.buildableActorId);
}
