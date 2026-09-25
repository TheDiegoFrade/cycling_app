/** Música ambiental del login (Still Corners - The Trip) vía el embed oficial
 * de YouTube — nunca alojamos el audio nosotros, solo lo controlamos.
 * El player vive en document.body (no en el contenedor de la pantalla) para
 * sobrevivir a repintados de la screen de login. */
const VIDEO_ID = '31MEfXwp-es';
const CONTAINER_ID = 'ambient-yt-player';

let player: YTPlayer | null = null;
let apiReadyPromise: Promise<void> | null = null;
const stateListeners = new Set<(isPlaying: boolean) => void>();

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
}

/** Avisa cuando el estado real (no el que asumimos) cambia — así el ícono
 * nunca miente si YouTube se queda pegado en buffering. */
export function subscribeAmbientState(cb: (isPlaying: boolean) => void): void {
  stateListeners.add(cb);
  if (player) cb(player.getPlayerState() === 1);
}

declare global {
  interface Window {
    YT?: { Player: new (el: string, opts: Record<string, unknown>) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeApi(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise;
  apiReadyPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return apiReadyPromise;
}

function ensureContainer(): void {
  if (document.getElementById(CONTAINER_ID)) return;
  const el = document.createElement('div');
  el.id = CONTAINER_ID;
  el.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
  document.body.appendChild(el);
}

async function ensurePlayer(): Promise<YTPlayer> {
  if (player) return player;
  await loadYouTubeApi();
  ensureContainer();
  player = await new Promise<YTPlayer>((resolve) => {
    const instance = new window.YT!.Player(CONTAINER_ID, {
      videoId: VIDEO_ID,
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1 },
      events: {
        onReady: () => resolve(instance),
        onStateChange: (e: { data: number }) => {
          stateListeners.forEach((cb) => cb(e.data === 1));
        },
      },
    });
  });
  return player;
}

/** Alterna play/pausa. Devuelve true si quedó sonando. */
export async function toggleAmbientTrack(): Promise<boolean> {
  const p = await ensurePlayer();
  if (p.getPlayerState() === 1) {
    p.pauseVideo();
    return false;
  }
  p.playVideo();
  return true;
}
