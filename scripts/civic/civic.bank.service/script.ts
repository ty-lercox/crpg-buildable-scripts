export function onBeginPlay(_ctx: { buildableActorId?: string }, api: any): void {
  api.buildable.registerBankServicePoint();
}

export function onOverlapBegin(ctx: { playerId: string; buildableActorId: string }, api: any): void {
  const playerId = typeof ctx?.playerId === 'string' ? ctx.playerId.trim() : '';
  api.player.setRegion('bank');
  if (playerId) {
    api.audio.playOneShotForPlayer(playerId, AUDIO.ui.menu.open, { volume: 1.0 });
  }
  api.ui.openBankView();
}

export function onOverlapEnd(_ctx: { playerId: string; buildableActorId: string }, api: any): void {
  api.player.setRegion('none');
  api.ui.closeBankView();
}
