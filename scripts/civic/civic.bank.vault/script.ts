export function onBeginPlay(_ctx: { buildableActorId?: string }, api: any): void {
  api.buildable.registerBankVaultPoint();
}

export function onInteract(ctx: { playerId?: string; buildableActorId: string }, api: any): void {
  const playerId = typeof ctx?.playerId === 'string' ? ctx.playerId.trim() : '';
  if (playerId) {
    api.audio.playOneShotForPlayer(playerId, AUDIO.ui.menu.open, { volume: 1.0 });
  }
  api.ui.openHeistView();
  api.toast('Town bank vault terminal opened.');
}
