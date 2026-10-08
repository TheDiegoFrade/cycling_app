/** Wake Lock API: evita que la pantalla (laptop o celular) se apague
 * durante la sesión. El sistema lo suelta cuando la pestaña deja de verse
 * (pantalla bloqueada, otra app); al volver se pide de nuevo. */
export class WakeLockGuard {
  private sentinel: WakeLockSentinel | null = null;
  private active = false;

  async acquire(): Promise<void> {
    this.active = true;
    if (!navigator.wakeLock) return;
    try {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      const sentinel = await navigator.wakeLock.request('screen');
      // si la sesión ya terminó mientras se pedía, se suelta de inmediato
      if (!this.active) {
        sentinel.release().catch(() => {});
        return;
      }
      this.sentinel = sentinel;
      // Antes no se escuchaba esto: al soltarlo el sistema, `sentinel`
      // seguía con valor y al volver a la pestaña nunca se volvía a pedir —
      // la pantalla se podía apagar a media sesión.
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
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
      void this.acquire();
    }
  };
}
