/** Música ambiental del login (Still Corners - The Trip) vía el embed oficial
 * de YouTube — nunca alojamos el audio nosotros, solo lo controlamos.
 * El player vive en document.body (no en el contenedor de la pantalla) para
 * sobrevivir a repintados de la screen de login. */
const VIDEO_ID = '31MEfXwp-es';
const CONTAINER_ID = 'ambient-yt-player';

let player: YTPlayer | null = null;
let apiReadyPromise: Promise<void> | null = null;

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
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
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, modestbranding: 1 },
      events: { onReady: () => resolve(instance) },
    });
  });
  return player;
}

/** Arranca la pista — pensado para llamarse dentro de un click del usuario. */
export async function startAmbientTrack(): Promise<void> {
  const p = await ensurePlayer();
  p.playVideo();
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
