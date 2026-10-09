// Cuántas veces se disparó cada regla del motor en vivo — una señal que el
// coach de IA sabe leer (ERG desenganchado = FTP alto; techo de pulso en
// sesiones suaves = fatiga o calor). Las reglas de fábrica tienen ids
// legibles (core/defaults.ts); las de un workout o del atleta llevan ids
// internos sin significado para el modelo, así que van juntas como 'custom'.

export interface FiredAlert {
  ruleId?: string; // ausente en sesiones guardadas antes de registrarlo
}

export function ruleTriggersOf(alerts: readonly FiredAlert[]): { ruleId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of alerts) {
    if (!a.ruleId) continue;
    const id = a.ruleId.startsWith('factory-') ? a.ruleId : 'custom';
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([ruleId, count]) => ({ ruleId, count })).sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId));
}
