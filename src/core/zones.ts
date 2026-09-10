/** Zona de potencia (1–6, gris→azul→verde→amarillo→naranja→rojo) a partir del
 * % de FTP. Umbrales estilo Coggan: recuperación, resistencia, tempo, umbral,
 * VO2max, anaeróbico. */
export function powerZone(powerPct: number): 1 | 2 | 3 | 4 | 5 | 6 {
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
