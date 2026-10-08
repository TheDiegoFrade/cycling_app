import { afterEach, describe, expect, it, vi } from 'vitest';
import { WakeLockGuard } from './wake-lock';

class FakeSentinel extends EventTarget {
  released = false;
  async release(): Promise<void> {
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

function setup() {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(async () => {
    const s = new FakeSentinel();
    sentinels.push(s);
    return s;
  });
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  vi.stubGlobal('navigator', { wakeLock: { request } });
  vi.stubGlobal('document', doc);
  const setVisibility = (v: DocumentVisibilityState) => {
    doc.visibilityState = v;
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return { sentinels, request, setVisibility };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('WakeLockGuard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lo vuelve a pedir al regresar a la pestaña después de que el sistema lo soltó', async () => {
    const { sentinels, request, setVisibility } = setup();
    const guard = new WakeLockGuard();
    await guard.acquire();
    expect(request).toHaveBeenCalledTimes(1);
    // el sistema lo suelta al bloquear la pantalla / cambiar de app
    setVisibility('hidden');
    await sentinels[0].release();
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    guard.release();
  });

  it('no lo vuelve a pedir si ya se terminó la sesión', async () => {
    const { request, setVisibility } = setup();
    const guard = new WakeLockGuard();
    await guard.acquire();
    guard.release();
    setVisibility('hidden');
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('no hace nada si el navegador no lo soporta', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', new EventTarget());
    const guard = new WakeLockGuard();
    await expect(guard.acquire()).resolves.toBeUndefined();
    guard.release();
  });
});
