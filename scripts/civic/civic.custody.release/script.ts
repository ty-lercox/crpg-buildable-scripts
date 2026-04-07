export function onBeginPlay(_ctx: { buildableActorId?: string }, api: any): void {
  api.buildable.registerPrisonRelease();
}
