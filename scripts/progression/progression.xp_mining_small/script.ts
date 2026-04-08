const SURFACE_LABEL = 'mining training';
const SKILL_TAG = 'Skill.Mining';
const XP_AMOUNT = 25;
const COOLDOWN_MS = 60_000;
const REWARD_SFX = AUDIO.ui.notify.reward.small;
const DENIED_SFX = AUDIO.ui.notify.outcome.bad.small;

type GrantState = {
  available: boolean;
  readyAtMs: number;
  timer?: ReturnType<typeof setTimeout>;
};

const grantStateByBuildable = new Map<string, GrantState>();

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getGrantState(buildableActorId: string): GrantState {
  const key = normalizeString(buildableActorId);
  if (!key) {
    return { available: true, readyAtMs: 0 };
  }

  const existing = grantStateByBuildable.get(key);
  if (existing) {
    return existing;
  }

  const created: GrantState = { available: true, readyAtMs: 0, timer: undefined };
  grantStateByBuildable.set(key, created);
  return created;
}

function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

function resetGrant(buildableActorId: string, api: any): void {
  const state = getGrantState(buildableActorId);
  state.available = true;
  state.readyAtMs = 0;
  state.timer = undefined;
  api.buildable.setInteractable(true);
}

function scheduleReset(buildableActorId: string, api: any): void {
  const state = getGrantState(buildableActorId);
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = undefined;
  }

  state.readyAtMs = Date.now() + COOLDOWN_MS;
  state.timer = setTimeout(() => {
    resetGrant(buildableActorId, api);
  }, COOLDOWN_MS);
}

export function onBeginPlay(ctx: { buildableActorId: string }, api: any): void {
  const buildableActorId = normalizeString(ctx?.buildableActorId);
  if (!buildableActorId) {
    return;
  }

  const state = getGrantState(buildableActorId);
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = undefined;
  }

  resetGrant(buildableActorId, api);
}

export function onInteract(ctx: { playerId?: string; buildableActorId: string }, api: any): void {
  const playerId = normalizeString(ctx?.playerId);
  const buildableActorId = normalizeString(ctx?.buildableActorId);
  if (!playerId || !buildableActorId) {
    return;
  }

  const state = getGrantState(buildableActorId);
  if (!state.available) {
    const remainingMs = state.readyAtMs > 0 ? state.readyAtMs - Date.now() : 0;
    api.audio.playOneShotForPlayer(playerId, DENIED_SFX, { volume: 0.9 });
    api.toastTo(playerId, `${SURFACE_LABEL} is on cooldown for ${formatSeconds(remainingMs)}.`);
    return;
  }

  if (!api.skills.addXp(SKILL_TAG, XP_AMOUNT)) {
    api.audio.playOneShotForPlayer(playerId, DENIED_SFX, { volume: 1.0 });
    api.toastTo(playerId, `Could not grant ${SURFACE_LABEL} XP.`);
    return;
  }

  state.available = false;
  api.buildable.setInteractable(false);
  scheduleReset(buildableActorId, api);
  api.audio.playOneShotForPlayer(playerId, REWARD_SFX, { volume: 0.95 });
  api.toastTo(playerId, `+${XP_AMOUNT} Mining XP. Available again in ${formatSeconds(COOLDOWN_MS)}.`);
}
