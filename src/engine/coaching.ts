/** Mismos cortes que formInterpretation/formaColor en ui/screens/history.ts
 * — una sola fuente de verdad de qué significa cada rango de TSB. */
export type FormBand = 'fresh' | 'balanced' | 'fatigued';

export function formBand(tsb: number): FormBand {
  if (tsb > 5) return 'fresh';
  if (tsb < -10) return 'fatigued';
  return 'balanced';
}

export interface TodaySuggestion {
  band: FormBand;
  templateId: string;
  reason: string;
}

/** Qué entrenar hoy según la forma actual — convierte el número de TSB en
 * una decisión concreta en vez de dejarlo como dato crudo. "fresh" alterna
 * entre VO2max y umbral para no sugerir siempre lo mismo cuando hay varios
 * días seguidos de buena forma. */
export function suggestToday(tsb: number, dayOfWeek: number): TodaySuggestion {
  const band = formBand(tsb);
  if (band === 'fresh') {
    return {
      band,
      templateId: dayOfWeek % 2 === 0 ? 'vo2max' : 'threshold',
      reason: 'Estás fresco y con buena base — buen día para meter intensidad.',
    };
  }
  if (band === 'fatigued') {
    return {
      band,
      templateId: 'recovery',
      reason: 'Traes fatiga acumulada — te conviene un día suave antes de seguir subiendo la carga.',
    };
  }
  return {
    band,
    templateId: 'sweet_spot',
    reason: 'Carga equilibrada entre esfuerzo y descanso — buen día para sweet spot.',
  };
}
