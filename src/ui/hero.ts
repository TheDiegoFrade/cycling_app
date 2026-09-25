/** Silueta de cerros + un ciclista muy simplificado, usada como acento en
 * los fondos ".hero" (Login, Inicio) — puro SVG a mano, sin depender de
 * ningún asset externo ni de gastar en generación de imágenes. */
export const HERO_SILHOUETTE = `
<svg class="hero-silhouette" viewBox="0 0 400 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <path fill="currentColor" d="M0,60 C40,42 80,55 120,46 C160,37 200,50 240,42 C280,34 320,48 360,40 L400,45 L400,100 L0,100 Z"/>
  <g transform="translate(178,50)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="0" cy="20" r="9"/>
    <circle cx="34" cy="20" r="9"/>
    <path d="M0,20 L14,6 L24,6 M14,6 L20,20 M20,20 L34,20 M14,6 L10,-6 L18,-6"/>
    <circle cx="10" cy="-10" r="4" fill="currentColor" stroke="none"/>
  </g>
</svg>`;
