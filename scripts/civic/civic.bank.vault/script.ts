export function onBeginPlay(_ctx: { buildableActorId?: string }, api: any): void {
  api.buildable.registerBankVaultPoint();
}

export function onInteract(_ctx: { playerId: string; buildableActorId: string }, api: any): void {
  api.ui.openHeistView();
  api.toast('Town bank vault terminal opened.');
}
