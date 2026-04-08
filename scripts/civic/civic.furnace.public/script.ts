export function onInteract(ctx: { playerId?: string }, api: any) {
  const playerId = typeof ctx?.playerId === 'string' ? ctx.playerId.trim() : '';
  if (playerId) {
    api.audio.playOneShotForPlayer(playerId, AUDIO.ui.menu.open, { volume: 1.0 });
  }
  api.ui.openFurnaceView();
  api.toast('Public Furnace opened.');
}
