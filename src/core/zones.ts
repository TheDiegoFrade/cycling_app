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

/** Altura (%) de la barra de un bloque según su zona — sube con la zona para
 * que el perfil se lea aunque no se distinga el color. Ver TORQ_DESIGN.md,
 * "Zonas". Compartida por WorkoutCover y la línea de tiempo de Sesión en vivo. */
export const ZONE_HEIGHT_PCT: Record<PowerZone, number> = {
  1: 25,
  2: 40,
  3: 55,
  4: 70,
  5: 85,
  6: 100,
};

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
