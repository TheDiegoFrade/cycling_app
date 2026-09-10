/** Wake Lock API: evita que la laptop se duerma durante la sesión. Se
 * vuelve a pedir automáticamente si la pestaña recupera visibilidad
 * (el sistema libera el wake lock al perderla). */
export class WakeLockGuard {
  private sentinel: WakeLockSentinel | null = null;
  private active = false;

  async acquire(): Promise<void> {
    this.active = true;
    if (!navigator.wakeLock) return;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    } catch {
      this.sentinel = null;
    }
  }

  release(): void {
    this.active = false;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.sentinel?.release().catch(() => {});
    this.sentinel = null;
  }

  private handleVisibilityChange = (): void => {
    if (this.active && document.visibilityState === 'visible' && !this.sentinel) {
      this.acquire();
    }
  };
}
