const CHEST_LABEL = 'Tier 2 reward chest';
const RESPAWN_DELAY_MS = 480_000;
const HIDDEN_SCALE_MULTIPLIER = 0.01;
const LOOT_SFX = AUDIO.ui.notify.reward.big;
const DENIED_SFX = AUDIO.ui.notify.outcome.bad.small;

type RewardEntry = {
  label: string;
  itemClassPath: string;
  minCount: number;
  maxCount: number;
  weight: number;
};

const REWARD_TABLE: RewardEntry[] = [
  {
    label: 'copper ore',
    itemClassPath: '/Game/CRPG/Items/Mining/Item_CopperOre.Item_CopperOre_C',
    minCount: 1,
    maxCount: 2,
    weight: 8,
  },
  {
    label: 'iron ore',
    itemClassPath: '/Game/CRPG/Items/Mining/Item_IronOre.Item_IronOre_C',
    minCount: 1,
    maxCount: 2,
    weight: 7,
  },
  {
    label: 'sapphire',
    itemClassPath: '/Game/CRPG/Items/Mining/Gems/Item_Sapphire.Item_Sapphire_C',
    minCount: 1,
    maxCount: 1,
    weight: 3,
  },
  {
    label: 'emerald',
    itemClassPath: '/Game/CRPG/Items/Mining/Gems/Item_Emerald.Item_Emerald_C',
    minCount: 1,
    maxCount: 1,
    weight: 2,
  },
  {
    label: 'laptop parts',
    itemClassPath: '/Game/CRPG/Items/Mining/Packages/Item_LaptopParts.Item_LaptopParts_C',
    minCount: 1,
    maxCount: 1,
    weight: 2,
  },
];

type ChestState = {
  available: boolean;
  respawnAtMs: number;
  respawnTimer?: ReturnType<typeof setTimeout>;
};

const chestStateByBuildable = new Map<string, ChestState>();

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getChestState(buildableActorId: string): ChestState {
  const key = normalizeString(buildableActorId);
  if (!key) {
    return { available: true, respawnAtMs: 0 };
  }

  const existing = chestStateByBuildable.get(key);
  if (existing) {
    return existing;
  }

  const created: ChestState = { available: true, respawnAtMs: 0, respawnTimer: undefined };
  chestStateByBuildable.set(key, created);
  return created;
}

function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

function randInt(min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function pickReward(): RewardEntry {
  const totalWeight = REWARD_TABLE.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of REWARD_TABLE) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry;
    }
  }
  return REWARD_TABLE[REWARD_TABLE.length - 1];
}

function resetChest(buildableActorId: string, api: any): void {
  const state = getChestState(buildableActorId);
  state.available = true;
  state.respawnAtMs = 0;
  state.respawnTimer = undefined;
  api.buildable.restore();
  api.buildable.setScale(1.0);
  api.buildable.setInteractable(true);
}

function scheduleRespawn(buildableActorId: string, api: any): void {
  const state = getChestState(buildableActorId);
  if (state.respawnTimer) {
    clearTimeout(state.respawnTimer);
    state.respawnTimer = undefined;
  }

  state.respawnAtMs = Date.now() + RESPAWN_DELAY_MS;
  state.respawnTimer = setTimeout(() => {
    resetChest(buildableActorId, api);
  }, RESPAWN_DELAY_MS);
}

export function onBeginPlay(ctx: { buildableActorId: string }, api: any): void {
  const buildableActorId = normalizeString(ctx?.buildableActorId);
  if (!buildableActorId) {
    return;
  }

  const state = getChestState(buildableActorId);
  if (state.respawnTimer) {
    clearTimeout(state.respawnTimer);
    state.respawnTimer = undefined;
  }

  resetChest(buildableActorId, api);
}

export function onInteract(ctx: { playerId?: string; buildableActorId: string }, api: any): void {
  const playerId = normalizeString(ctx?.playerId);
  const buildableActorId = normalizeString(ctx?.buildableActorId);
  if (!playerId || !buildableActorId) {
    return;
  }

  const state = getChestState(buildableActorId);
  if (!state.available) {
    const remainingMs = state.respawnAtMs > 0 ? state.respawnAtMs - Date.now() : 0;
    api.audio.playOneShotForPlayer(playerId, DENIED_SFX, { volume: 0.9 });
    api.toastTo(playerId, `${CHEST_LABEL} is empty. Refills in ${formatSeconds(remainingMs)}.`);
    return;
  }

  const reward = pickReward();
  const count = randInt(reward.minCount, reward.maxCount);
  if (!api.inventory.addItemByClassPath(reward.itemClassPath, count)) {
    api.audio.playOneShotForPlayer(playerId, DENIED_SFX, { volume: 1.0 });
    api.toastTo(playerId, `Could not loot ${CHEST_LABEL}.`);
    return;
  }

  state.available = false;
  api.buildable.setInteractable(false);
  api.buildable.setScale(HIDDEN_SCALE_MULTIPLIER);
  scheduleRespawn(buildableActorId, api);
  api.audio.playOneShotForPlayer(playerId, LOOT_SFX, { volume: 1.0 });
  api.toastTo(playerId, `Looted ${count} ${reward.label}. Refills in ${formatSeconds(RESPAWN_DELAY_MS)}.`);
}
