// Del workout compacto que decide el coach (Sonnet) al workout real que se
// guarda. Sonnet escribe las series con `repeat` ("4× [8 min al 95 %, 4 min
// al 55 %]") en vez de listar cada intervalo, y aquí se desenrollan: es
// mecánico, no necesita criterio, y así el modelo genera mucho menos texto
// (era lo que hacía que create_plan se pasara del tiempo límite).
// Sin imports a propósito: lo prueba vitest desde el repo (expand.test.ts).

export interface Step {
  name: string;
  type: 'warmup' | 'steady' | 'interval' | 'recovery' | 'cooldown' | 'free';
  duration_s: number;
  power_pct: number;
  ramp_to_pct?: number;
  cadence_min?: number;
  cadence_max?: number;
}

export interface Segment {
  repeat: number;
  steps: Step[];
}

export interface PlannedWorkout {
  name: string;
  dayOfWeek: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  targetTSS: number;
  erg: 'on' | 'off' | 'mixed';
  intent: string;
  segments: Segment[];
}

export interface GeneratedWorkout {
  name: string;
  description: string;
  intervals: Step[];
  targetTSS: number;
  dayOfWeek: PlannedWorkout['dayOfWeek'];
}

/** Lista plana de intervalos. En una serie repetida, cada paso lleva su
 * número ("Umbral 2/4") para que el atleta sepa en cuál va. */
export function expandSegments(segments: readonly Segment[]): Step[] {
  const out: Step[] = [];
  for (const seg of segments) {
    const reps = Math.max(1, Math.min(30, Math.round(seg.repeat)));
    for (let r = 1; r <= reps; r++) {
      for (const step of seg.steps) {
        out.push({ ...step, name: reps > 1 ? `${step.name} ${r}/${reps}` : step.name });
      }
    }
  }
  return out;
}

function fmtDuration(s: number): string {
  if (s < 60) return `${s} s`;
  const m = s / 60;
  return Number.isInteger(m) ? `${m} min` : `${Math.floor(m)} min ${s % 60} s`;
}

function fmtStep(step: Step): string {
  const pct = step.ramp_to_pct !== undefined ? `${step.power_pct}→${step.ramp_to_pct} %` : `${step.power_pct} %`;
  const cad = step.cadence_min || step.cadence_max ? `, ${step.cadence_min ?? '?'}-${step.cadence_max ?? '?'} rpm` : '';
  return `${step.name} ${fmtDuration(step.duration_s)} al ${pct} FTP${cad}`;
}

/** "Calentamiento 10 min al 50→65 % FTP · 4× (Umbral 8 min al 95 % FTP, …)"
 * — lo que lee el redactor (Haiku) para escribir la descripción. */
export function summarizeSegments(segments: readonly Segment[]): string {
  return segments
    .map((seg) => {
      const steps = seg.steps.map(fmtStep).join(', ');
      return seg.repeat > 1 ? `${seg.repeat}× (${steps})` : steps;
    })
    .join(' · ');
}

export function totalMinutes(segments: readonly Segment[]): number {
  return Math.round(expandSegments(segments).reduce((s, i) => s + i.duration_s, 0) / 60);
}

/** Descripción de respaldo si el redactor falla o no alcanza el tiempo: la
 * intención que escribió el coach más la indicación de ERG. Corta, pero
 * nunca vacía. */
export function fallbackDescription(w: Pick<PlannedWorkout, 'intent' | 'erg'>): string {
  const erg =
    w.erg === 'on'
      ? 'Activa el modo ERG: el rodillo marca la potencia.'
      : w.erg === 'off'
        ? 'Apaga el modo ERG y ve por sensación.'
        : 'Usa ERG en los bloques a potencia fija y apágalo donde tengas que regular tú.';
  return `${w.intent.trim()} ${erg}`.trim();
}

export function toGeneratedWorkout(w: PlannedWorkout, description: string | null): GeneratedWorkout {
  return {
    name: w.name,
    description: description?.trim() || fallbackDescription(w),
    intervals: expandSegments(w.segments),
    targetTSS: w.targetTSS,
    dayOfWeek: w.dayOfWeek,
  };
}
