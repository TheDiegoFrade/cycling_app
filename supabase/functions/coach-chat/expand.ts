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
  kind?: 'test' | null;
}

export interface GeneratedWorkout {
  name: string;
  description: string;
  intervals: Step[];
  targetTSS: number;
  dayOfWeek: PlannedWorkout['dayOfWeek'];
  kind: 'test' | null;
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

/** Workout de test o de ajuste (rampa, 20 min, escalera) — su bloque no se
 * toca al recortar. */
export function isTestWorkout(w: Pick<PlannedWorkout, 'name' | 'intent' | 'kind'>): boolean {
  return w.kind === 'test' || /test|rampa|ramp|escalera/i.test(`${w.name} ${w.intent}`);
}

const MIN_TRIMMED_STEP_S = 60;

/** Red de seguridad del tope de duración: si el workout pasa de `capMinutes`,
 * recorta el bloque `steady` o `free` que más tiempo suma (duración ×
 * repeticiones) hasta caber. Nunca toca calentamiento, enfriamiento,
 * intervalos ni recuperaciones, y en un test tampoco su bloque (rampa o
 * ≥ 90 % FTP). `fits` es false si ni recortando todo lo recortable cabe. */
export function fitToCap(w: PlannedWorkout, capMinutes: number): { workout: PlannedWorkout; trimmedS: number; fits: boolean } {
  const capS = capMinutes * 60;
  const segments = w.segments.map((seg) => ({ ...seg, steps: seg.steps.map((st) => ({ ...st })) }));
  const reps = (seg: Segment) => Math.max(1, Math.min(30, Math.round(seg.repeat)));
  const total = () => segments.reduce((s, seg) => s + reps(seg) * seg.steps.reduce((t, st) => t + st.duration_s, 0), 0);
  const test = isTestWorkout(w);
  const trimmable = (st: Step) =>
    (st.type === 'steady' || st.type === 'free') && !(test && (st.ramp_to_pct !== undefined || st.power_pct >= 90)) && st.duration_s > MIN_TRIMMED_STEP_S;
  let trimmedS = 0;
  let excess = total() - capS;
  while (excess > 0) {
    let best: { seg: Segment; step: Step } | null = null;
    for (const seg of segments) {
      for (const st of seg.steps) {
        if (trimmable(st) && (!best || st.duration_s * reps(seg) > best.step.duration_s * reps(best.seg))) best = { seg, step: st };
      }
    }
    if (!best) break;
    const r = reps(best.seg);
    // Minutos redondos: recorta en múltiplos de 60 s (por repetición).
    const perRep = Math.min(best.step.duration_s - MIN_TRIMMED_STEP_S, Math.ceil(excess / r / 60) * 60);
    best.step.duration_s -= perRep;
    trimmedS += perRep * r;
    excess -= perRep * r;
  }
  return { workout: { ...w, segments }, trimmedS, fits: excess <= 0 };
}

/** Red de seguridad para tests autodosificados: en un test que no va todo
 * con ERG, el bloque máximo (≥ 5 min a ≥ 90 % FTP, sin rampa) se vuelve
 * 'free' aunque el modelo lo haya puesto como 'interval' — la app suelta el
 * ERG en 'free'. Con ERG fijo un test de 20 min solo mide que el atleta
 * aguanta esa potencia (caso real: 170 W fijos con el pulso subiendo). */
export function selfPacedTestSteps(w: PlannedWorkout, steps: Step[]): Step[] {
  if (w.erg === 'on' || !isTestWorkout(w)) return steps;
  return steps.map((st) =>
    st.ramp_to_pct === undefined && st.power_pct >= 90 && st.duration_s >= 300 && (st.type === 'interval' || st.type === 'steady')
      ? { ...st, type: 'free' as const }
      : st,
  );
}

/** TSS de un workout planeado, con la misma cuenta que la app
 * (src/core/workout-estimate.ts: potencia segundo a segundo, NP con media
 * móvil de 30 s, IF = NP/FTP), en % de FTP para no depender del número. El
 * modelo lo estima a ojo y se equivoca seguido (p. ej. 90 min de fondo con
 * TSS 200); la guardia lo reemplaza por este. */
export function estimateTss(segments: Segment[]): number {
  const pct: number[] = [];
  for (const st of expandSegments(segments)) {
    const to = st.ramp_to_pct ?? st.power_pct;
    for (let t = 0; t < st.duration_s; t++) pct.push(st.power_pct + ((to - st.power_pct) * t) / st.duration_s);
  }
  if (!pct.length) return 0;
  const win = Math.min(30, pct.length);
  let sum = 0;
  for (let i = 0; i < win; i++) sum += pct[i];
  let fourth = (sum / win) ** 4;
  let n = 1;
  for (let i = win; i < pct.length; i++) {
    sum += pct[i] - pct[i - win];
    fourth += (sum / win) ** 4;
    n++;
  }
  const ifactor = Math.pow(fourth / n, 0.25) / 100;
  return Math.round((pct.length / 3600) * ifactor * ifactor * 100);
}

export function toGeneratedWorkout(w: PlannedWorkout, description: string | null): GeneratedWorkout {
  return {
    name: w.name,
    description: description?.trim() || fallbackDescription(w),
    intervals: selfPacedTestSteps(w, expandSegments(w.segments)),
    targetTSS: w.targetTSS,
    dayOfWeek: w.dayOfWeek,
    kind: w.kind ?? null,
  };
}
