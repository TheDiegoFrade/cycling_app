// Biblioteca del coach (vista del coach, paso 5 — supabase/schema.sql,
// session_templates). Lógica pura: tipos, validación y cómo una plantilla
// se convierte en algo agendable. Al agendar se COPIA el contenido (nuevo
// id): editar o borrar la plantilla después nunca cambia lo ya publicado.
import type { Comment, Interval, Workout } from './types';
import { validateWorkout } from './validator';

/** Rutinas que no son de bici (se registran en Registrar, se miden con
 * sRPE). Mismos valores que sessions.kind. */
export type RoutineKind = 'strength' | 'mobility' | 'flexibility';
export const ROUTINE_KINDS: readonly RoutineKind[] = ['strength', 'mobility', 'flexibility'];

export type TemplateKind = 'bike' | RoutineKind;
export const TEMPLATE_KINDS: readonly TemplateKind[] = ['bike', 'strength', 'mobility', 'flexibility'];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  bike: 'Bici',
  strength: 'Fuerza',
  mobility: 'Movilidad',
  flexibility: 'Flexibilidad',
};

export interface RoutineExercise {
  name: string;
  /** Dosis libre: "3 × 8 · tempo controlado", "30 s por lado"… */
  dose: string;
  videoUrl?: string;
}

export interface RoutinePayload {
  description?: string;
  durationMin?: number;
  targetRpe?: number;
  exercises: RoutineExercise[];
  /** Nota del coach para el atleta ("si la rodilla molesta…"). */
  note?: string;
}

export interface BikePayload {
  description?: string;
  intervals: Interval[];
  /** Mensajes durante el entrenamiento (los `textevent` de un .zwo, o los
   * comentarios de un .json de Torq). Se copian tal cual al agendar. */
  comments?: Comment[];
}

export type SessionTemplate =
  | { id: string; name: string; kind: 'bike'; payload: BikePayload; updatedAt: string }
  | { id: string; name: string; kind: RoutineKind; payload: RoutinePayload; updatedAt: string };

/** Una rutina de fuerza/movilidad agendada a un atleta (tabla
 * planned_routines) — la copia de la plantilla, con su propio id. */
export interface PlannedRoutine {
  id: string;
  kind: RoutineKind;
  name: string;
  payload: RoutinePayload;
  scheduledDate: string;
}

export const MAX_EXERCISES = 30;
export const MAX_NAME = 80;

export function isRoutineKind(kind: string): kind is RoutineKind {
  return (ROUTINE_KINDS as readonly string[]).includes(kind);
}

/** Solo links http(s) — nada de `javascript:` ni rutas relativas en un
 * href que verá el atleta. null si no sirve. */
export function safeVideoUrl(raw: string | undefined | null): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Errores en español; vacío si se puede guardar. */
export function validateRoutineTemplate(name: string, payload: RoutinePayload): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push('Ponle nombre a la plantilla.');
  if (name.trim().length > MAX_NAME) errors.push(`El nombre no puede pasar de ${MAX_NAME} caracteres.`);
  if (payload.exercises.length === 0) errors.push('Agrega al menos un ejercicio.');
  if (payload.exercises.length > MAX_EXERCISES) errors.push(`Máximo ${MAX_EXERCISES} ejercicios.`);
  payload.exercises.forEach((e, i) => {
    if (!e.name.trim()) errors.push(`El ejercicio ${i + 1} no tiene nombre.`);
    if (e.videoUrl && !safeVideoUrl(e.videoUrl)) errors.push(`El link de video del ejercicio ${i + 1} debe empezar con https://`);
  });
  if (payload.durationMin !== undefined && !(payload.durationMin > 0 && payload.durationMin <= 600)) errors.push('La duración debe estar entre 1 y 600 minutos.');
  if (payload.targetRpe !== undefined && !(payload.targetRpe >= 1 && payload.targetRpe <= 10)) errors.push('El RPE objetivo va del 1 al 10.');
  return errors;
}

export function validateBikeTemplate(name: string, payload: BikePayload): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push('Ponle nombre a la plantilla.');
  if (name.trim().length > MAX_NAME) errors.push(`El nombre no puede pasar de ${MAX_NAME} caracteres.`);
  if (payload.intervals.length === 0) errors.push('Agrega al menos un bloque.');
  else {
    const result = validateWorkout(toWorkout(name.trim() || 'Plantilla', payload, '2000-01-01', 'validacion'));
    errors.push(...result.errors);
  }
  return errors;
}

function toWorkout(name: string, payload: BikePayload, dateKey: string, id: string): Workout {
  return {
    format_version: 1,
    id,
    name,
    ...(payload.description ? { description: payload.description } : {}),
    intervals: payload.intervals.map((iv) => ({ ...iv })),
    ...(payload.comments?.length ? { comments: payload.comments.map((c) => ({ ...c })) } : {}),
    created_at: new Date().toISOString(),
    scheduledDate: dateKey,
  };
}

/** Copia agendable de una plantilla de bici (id nuevo). */
export function workoutFromBikeTemplate(t: Extract<SessionTemplate, { kind: 'bike' }>, dateKey: string): Workout {
  return toWorkout(t.name, t.payload, dateKey, crypto.randomUUID());
}

/** Copia agendable de una plantilla de fuerza/movilidad (id nuevo). */
export function routineFromTemplate(t: Extract<SessionTemplate, { kind: RoutineKind }>, dateKey: string): PlannedRoutine {
  return {
    id: crypto.randomUUID(),
    kind: t.kind,
    name: t.name,
    payload: {
      ...t.payload,
      exercises: t.payload.exercises.map((e) => ({ ...e, ...(e.videoUrl ? { videoUrl: safeVideoUrl(e.videoUrl) ?? undefined } : {}) })),
    },
    scheduledDate: dateKey,
  };
}

/** Plantilla de bici a partir de un workout importado (.zwo/.mrc/.erg/.json). */
export function bikePayloadFromWorkout(w: Workout): BikePayload {
  return {
    ...(w.description ? { description: w.description } : {}),
    intervals: w.intervals.map((iv) => ({ ...iv })),
    ...(w.comments?.length ? { comments: w.comments.map((c) => ({ ...c })) } : {}),
  };
}

/** Copia de una plantilla de bici para la biblioteca PROPIA del coach (sin
 * fecha): así él también la puede entrenar en su rodillo. */
export function personalWorkoutFromBikeTemplate(t: Extract<SessionTemplate, { kind: 'bike' }>): Workout {
  const { scheduledDate: _unused, ...workout } = toWorkout(t.name, t.payload, '2000-01-01', crypto.randomUUID());
  return workout;
}

/** "3 ejercicios · 45 min · RPE 6" */
export function routineSummary(p: RoutinePayload): string {
  return [
    `${p.exercises.length} ${p.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}`,
    p.durationMin ? `${p.durationMin} min` : null,
    p.targetRpe ? `RPE ${p.targetRpe}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
