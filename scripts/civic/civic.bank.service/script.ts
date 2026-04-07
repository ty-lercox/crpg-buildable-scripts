export function onBeginPlay(_ctx: { buildableActorId?: string }, api: any): void {
  api.buildable.registerBankServicePoint();
}

export function onOverlapBegin(_ctx: { playerId: string; buildableActorId: string }, api: any): void {
  api.player.setRegion('bank');
  api.ui.openBankView();
}

export function onOverlapEnd(_ctx: { playerId: string; buildableActorId: string }, api: any): void {
  api.player.setRegion('none');
  api.ui.closeBankView();
}
