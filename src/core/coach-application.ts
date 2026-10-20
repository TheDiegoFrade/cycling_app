// Solicitud para ser coach en Torq. Nadie se registra como coach: Torq invita
// por correo, la persona llena esta solicitud y un administrador la aprueba
// (supabase/functions/coach-apply). Solo al aprobarla se enciende
// profiles.is_coach, con un máximo de atletas (default 20).
// Lógica pura: la usa la app para guiar el formulario y el servidor para
// decidir (se empaqueta en core.gen.js).

/** Atletas que un coach puede tener vinculados si no se dice otra cosa. */
export const DEFAULT_MAX_ATHLETES = 20;
export const MAX_ATHLETES_LIMIT = 200;

export const COACH_DISCIPLINES = ['road', 'mountain', 'gravel', 'track', 'triathlon'] as const;
export type CoachDiscipline = (typeof COACH_DISCIPLINES)[number];

export interface CoachApplicationAnswers {
  fullName: string;
  phone: string;
  city: string;
  yearsCoaching: number;
  certifications: string;
  disciplines: CoachDiscipline[];
  currentAthletes: number;
  /** Cómo arma y ajusta los planes (para saber que de verdad entrena gente). */
  methodology: string;
  /** Dónde ver su trabajo: Instagram, sitio, Strava, club. */
  links: string;
  /** Opcional: un atleta, club o equipo que lo pueda recomendar. */
  references: string;
  /** Declaraciones (las tres obligatorias). */
  truthful: boolean;
  responsible: boolean;
  adult: boolean;
}

export type CoachApplicationErrors = Partial<Record<keyof CoachApplicationAnswers, string>>;

/** Mínimo de caracteres para que la metodología diga algo. */
export const METHODOLOGY_MIN = 80;

const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const int = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/** Limpia lo que llega (de la app o del servidor) a la forma esperada. */
export function normalizeCoachApplication(raw: Record<string, unknown>): CoachApplicationAnswers {
  const disciplines = Array.isArray(raw.disciplines) ? raw.disciplines : [];
  return {
    fullName: trim(raw.fullName).slice(0, 120),
    phone: trim(raw.phone).slice(0, 30),
    city: trim(raw.city).slice(0, 120),
    yearsCoaching: int(raw.yearsCoaching),
    certifications: trim(raw.certifications).slice(0, 1000),
    disciplines: [...new Set(disciplines.filter((d): d is CoachDiscipline => (COACH_DISCIPLINES as readonly unknown[]).includes(d)))],
    currentAthletes: int(raw.currentAthletes),
    methodology: trim(raw.methodology).slice(0, 3000),
    links: trim(raw.links).slice(0, 1000),
    references: trim(raw.references).slice(0, 1000),
    truthful: raw.truthful === true,
    responsible: raw.responsible === true,
    adult: raw.adult === true,
  };
}

/** Qué falta o está mal, campo por campo. Vacío = se puede mandar. */
export function validateCoachApplication(a: CoachApplicationAnswers): CoachApplicationErrors {
  const e: CoachApplicationErrors = {};
  if (a.fullName.length < 3) e.fullName = 'Escribe tu nombre completo.';
  if (a.phone.replace(/\D/g, '').length < 10) e.phone = 'Un teléfono de 10 dígitos para contactarte.';
  if (a.city.length < 2) e.city = '¿En qué ciudad entrenas?';
  if (!Number.isInteger(a.yearsCoaching) || a.yearsCoaching < 0 || a.yearsCoaching > 60) e.yearsCoaching = 'Años como coach, de 0 a 60.';
  if (a.certifications.length < 3) e.certifications = 'Tus certificaciones o formación (si no tienes, dilo y cuéntanos tu experiencia).';
  if (a.disciplines.length === 0) e.disciplines = 'Elige al menos una disciplina.';
  if (!Number.isInteger(a.currentAthletes) || a.currentAthletes < 0 || a.currentAthletes > 500) e.currentAthletes = '¿Cuántos atletas entrenas hoy? (0 a 500)';
  if (a.methodology.length < METHODOLOGY_MIN) e.methodology = `Cuéntanos cómo armas y ajustas los planes (al menos ${METHODOLOGY_MIN} caracteres).`;
  if (a.links.length < 4) e.links = 'Un lugar donde podamos ver tu trabajo: Instagram, sitio, Strava o club.';
  if (!a.truthful) e.truthful = 'Confirma que la información es verdadera.';
  if (!a.responsible) e.responsible = 'Confirma que el entrenamiento de tus atletas es tu responsabilidad.';
  if (!a.adult) e.adult = 'Torq es solo para mayores de 18 años.';
  return e;
}

/** Máximo de atletas válido (lo pone el administrador al aprobar). */
export function clampMaxAthletes(v: unknown): number {
  const n = int(v);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_MAX_ATHLETES;
  return Math.min(n, MAX_ATHLETES_LIMIT);
}

export type CoachApplicationStatus = 'invited' | 'submitted' | 'approved' | 'rejected' | 'revoked';
