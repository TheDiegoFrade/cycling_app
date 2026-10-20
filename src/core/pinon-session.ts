// Lo que Piñón dice de una sesión en el Resumen. Sin IA: sale de las métricas
// de la sesión y de cómo se sintió (RPE). Corto, objetivo y sin siglas.
import { byGender } from './gender';
import type { Gender } from './gender';
import type { WorkoutZone } from './workout-zone';

export interface PinonSessionInput {
  /** Minutos rodados de verdad. */
  minutes: number;
  /** Lo que duraba el workout (null si no se sabe). */
  plannedMinutes: number | null;
  /** Fracción del FTP sostenida (IF). */
  intensityFactor: number | null;
  rpe: number | null;
  /** Cuánto subió el pulso a igual potencia, en %. */
  hrDriftPct: number | null;
  zone: WorkoutZone | null;
  gender?: Gender;
  /** false donde no hay escala de RPE a la vista (resumen solo de la nube). */
  canAskRpe?: boolean;
}

const ASK_RPE = ' ¿Qué tan duro se sintió? Márcalo abajo: con eso tu coach ajusta lo que sigue.';

export function pinonSessionComment(s: PinonSessionInput): string {
  const ask = s.rpe === null && s.canAskRpe !== false ? ASK_RPE : '';
  const m = Math.round(s.minutes);
  if (s.plannedMinutes && s.plannedMinutes > 0 && s.minutes < s.plannedMinutes * 0.8) {
    return `Hoy fueron ${m} de ${Math.round(s.plannedMinutes)} min. Lo importante es que te subiste; si paraste por cansancio o alguna molestia, cuéntalo en la nota.${ask}`;
  }
  if (s.rpe !== null && s.rpe >= 8 && s.intensityFactor !== null && s.intensityFactor < 0.8) {
    return 'Se sintió más duro de lo que dicen los números. Puede ser sueño, estrés o cansancio acumulado; si se repite, tu coach lo ve en el ajuste semanal.';
  }
  if (s.rpe !== null && s.rpe <= 4 && s.intensityFactor !== null && s.intensityFactor >= 0.9) {
    return 'Fue intenso en números y lo sentiste fácil: buena señal de que vas mejorando. Puede tocar un test pronto.';
  }
  if (s.hrDriftPct !== null && s.hrDriftPct >= 8 && (s.zone === 'fondo' || s.zone === null) && s.minutes >= 40) {
    return `Al final tu pulso subió ${Math.round(s.hrDriftPct)} % con la misma potencia. Suele ser falta de agua o de base aeróbica: en las largas, un trago cada 15 minutos.${ask}`;
  }
  const done = byGender(s.gender, 'Bien hecho.', 'Bien hecha.', 'Buen trabajo.');
  const what =
    s.zone === 'test'
      ? 'Test terminado: con esto tus zonas quedan al día.'
      : s.zone === 'VO2' || s.zone === 'umbral'
        ? `Bloques duros completos, ${m} min. Hoy toca comer bien y dormir.`
        : s.zone === 'sweet spot' || s.zone === 'tempo'
          ? `${m} min de ritmo firme completos. Así sube tu FTP.`
          : `${m} min de base completos. Así se construye el motor.`;
  return `${done} ${what}${ask}`;
}
