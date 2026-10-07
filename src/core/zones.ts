export type PowerZone = 1 | 2 | 3 | 4 | 5 | 6;

export const POWER_ZONES: readonly PowerZone[] = [1, 2, 3, 4, 5, 6];

/** Nombres de zona — ver TORQ_DESIGN.md, tabla "Zonas". */
export const ZONE_NAMES: Record<PowerZone, string> = {
  1: 'Recuperación',
  2: 'Resistencia',
  3: 'Tempo',
  4: 'Umbral',
  5: 'VO2 max',
  6: 'Anaeróbico',
};

/** Altura (%) "de referencia" de cada zona — ya no se usa directo para
 * dibujar barras (eso aplanaba dos bloques de zona 2 a 110W y 120W a la
 * misma altura, perdiendo la diferencia real entre ellos). Se queda como
 * los puntos de corte que alimentan powerPctToHeightPct de abajo. */
export const ZONE_HEIGHT_PCT: Record<PowerZone, number> = {
  1: 25,
  2: 40,
  3: 55,
  4: 70,
  5: 85,
  6: 100,
};

/** Mismos cortes que powerZone(), con el techo de cada zona anclado a su
 * ZONE_HEIGHT_PCT — pero interpolado linealmente entre cortes en vez de
 * "saltado" a un escalón por zona, para que dos bloques de la misma zona a
 * distinta potencia (ej. Z2 a 110W vs 120W) se lean distinto en vez de
 * verse como la misma barra. Compartida por WorkoutCover, el timeline
 * estático y la línea de potencia en vivo (antes vivía solo ahí, duplicada
 * de hecho). */
const POWER_PCT_HEIGHT_POINTS: readonly [number, number][] = [
  [0, 0],
  [55, 25],
  [75, 40],
  [90, 55],
  [105, 70],
  [120, 85],
  [150, 100],
];

export function powerPctToHeightPct(powerPct: number): number {
  const points = POWER_PCT_HEIGHT_POINTS;
  if (powerPct <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [p1, h1] = points[i];
    if (powerPct <= p1) {
      const [p0, h0] = points[i - 1];
      return h0 + ((powerPct - p0) / (p1 - p0)) * (h1 - h0);
    }
  }
  return 100;
}

/** Zona de potencia (1–6, gris→azul→verde→amarillo→naranja→rojo) a partir del
 * % de FTP. Umbrales estilo Coggan: recuperación, resistencia, tempo, umbral,
 * VO2max, anaeróbico. */
export function powerZone(powerPct: number): PowerZone {
  if (powerPct < 55) return 1;
  if (powerPct < 75) return 2;
  if (powerPct < 90) return 3;
  if (powerPct < 105) return 4;
  if (powerPct < 120) return 5;
  return 6;
}

/** Zona de pulso (1–5) a partir del % de hr_max del perfil. */
export function hrZone(hr: number, hrMax: number): 1 | 2 | 3 | 4 | 5 {
  const pct = (hr / hrMax) * 100;
  if (pct < 60) return 1;
  if (pct < 70) return 2;
  if (pct < 80) return 3;
  if (pct < 90) return 4;
  return 5;
}
