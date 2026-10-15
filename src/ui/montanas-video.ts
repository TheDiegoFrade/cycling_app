// Fondo «Montañas» del inicio de sesión: el video del sol-plato girando y el
// ciclista pedaleando hacia las montañas (Higgsfield, Kling). Silencioso y en
// bucle. Primero busca la copia local en /brand (scripts/fetch-brand-assets.mjs)
// y, si no está, la del CDN de Higgsfield. Con «reducir movimiento» solo se ve
// el primer cuadro. Decorativo (aria-hidden).

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3J45IBavaZOdO3BUDEyFeizX9Pl/';
const VIDEO_LOCAL = '/brand/login-montanas.mp4';
const VIDEO_CDN = `${CDN}hf_20261015_045150_4829c7af-e102-4dcb-b160-0b017ac4a1a1.mp4`;
const POSTER_CDN = `${CDN}hf_20261015_031844_07e2f918-dc76-450c-985f-44cae72f2341.png`;

export function montanasVideoHtml(): string {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) return `<img class="hero-video" src="${POSTER_CDN}" alt="" aria-hidden="true">`;
  return `
    <video class="hero-video" autoplay muted loop playsinline preload="auto" poster="${POSTER_CDN}" aria-hidden="true">
      <source src="${VIDEO_LOCAL}" type="video/mp4">
      <source src="${VIDEO_CDN}" type="video/mp4">
    </video>`;
}
