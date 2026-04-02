const ITEM_LABEL = 'copper ore';
const ITEM_CLASS_PATH = '/Game/CRPG/Items/Mining/Item_CopperOre.Item_CopperOre_C';
const ITEM_COUNT = 1;
const RESPAWN_DELAY_MS = 90_000;
const HIDDEN_SCALE_MULTIPLIER = 0.01;

type PickupState = {
  available: boolean;
  respawnAtMs: number;
  respawnTimer?: ReturnType<typeof setTimeout>;
};

const pickupStateByBuildable = new Map<string, PickupState>();

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getPickupState(buildableActorId: string): PickupState {
  const key = normalizeString(buildableActorId);
  if (!key) {
    return { available: true, respawnAtMs: 0 };
  }
  const existing = pickupStateByBuildable.get(key);
  if (existing) {
    return existing;
  }
  const created: PickupState = { available: true, respawnAtMs: 0, respawnTimer: undefined };
  pickupStateByBuildable.set(key, created);
  return created;
}

function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

function resetPickup(buildableActorId: string, api: any): void {
  const state = getPickupState(buildableActorId);
  state.available = true;
  state.respawnAtMs = 0;
  state.respawnTimer = undefined;
  api.buildable.restore();
  api.buildable.setScale(1.0);
  api.buildable.setInteractable(true);
}

function scheduleRespawn(buildableActorId: string, api: any): void {
  const state = getPickupState(buildableActorId);
  if (state.respawnTimer) {
    clearTimeout(state.respawnTimer);
    state.respawnTimer = undefined;
  }
  state.respawnAtMs = Date.now() + RESPAWN_DELAY_MS;
  state.respawnTimer = setTimeout(() => {
    resetPickup(buildableActorId, api);
  }, RESPAWN_DELAY_MS);
}

export function onBeginPlay(ctx: { buildableActorId: string }, api: any): void {
  const buildableActorId = normalizeString(ctx?.buildableActorId);
  if (!buildableActorId) {
    return;
  }
  const state = getPickupState(buildableActorId);
  if (state.respawnTimer) {
    clearTimeout(state.respawnTimer);
    state.respawnTimer = undefined;
  }
  resetPickup(buildableActorId, api);
}

export function onInteract(ctx: { playerId?: string; buildableActorId: string }, api: any): void {
  const playerId = normalizeString(ctx?.playerId);
  const buildableActorId = normalizeString(ctx?.buildableActorId);
  if (!playerId || !buildableActorId) {
    return;
  }
  const state = getPickupState(buildableActorId);
  if (!state.available) {
    const remainingMs = state.respawnAtMs > 0 ? state.respawnAtMs - Date.now() : 0;
    api.toastTo(playerId, `${ITEM_LABEL} already picked up. Respawns in ${formatSeconds(remainingMs)}.`);
    return;
  }
  state.available = false;
  if (!api.inventory.addItemByClassPath(ITEM_CLASS_PATH, ITEM_COUNT)) {
    state.available = true;
    api.toastTo(playerId, `Could not pick up ${ITEM_LABEL}.`);
    return;
  }
  api.buildable.setInteractable(false);
  api.buildable.setScale(HIDDEN_SCALE_MULTIPLIER);
  scheduleRespawn(buildableActorId, api);
  api.toastTo(playerId, `Picked up ${ITEM_COUNT} ${ITEM_LABEL}. Respawns in ${formatSeconds(RESPAWN_DELAY_MS)}.`);
}
