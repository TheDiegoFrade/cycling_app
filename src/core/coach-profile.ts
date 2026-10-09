// El FTP del perfil y lo que el coach de IA necesita saber de él. El rodillo
// siempre corre sobre `profile.ftp` (aunque sea el default de 200 W); el
// coach necesita saber además de dónde salió ese número para no tomar un
// default o un provisional por una medición (ver prompt.ts, "El FTP del
// perfil"). Lógica pura: la usan el Perfil, el cuestionario y coach.ts.
import { otherActivityError } from './other-activities';
import type { OtherActivity } from './other-activities';
import type { FtpSource, Profile } from './types';

/** Fuente del FTP, con la migración implícita de perfiles anteriores a
 * `ftpSource`: confirmado → 'manual', lo demás → 'default'. */
export function ftpSourceOf(p: Pick<Profile, 'ftpSource' | 'ftpConfirmed'>): FtpSource {
  return p.ftpSource ?? (p.ftpConfirmed ? 'manual' : 'default');
}

/** Un número que el atleta midió o escribió como suyo (no default ni
 * provisional). Es lo que significa `ftpConfirmed`. */
export function isMeasuredFtp(source: FtpSource): boolean {
  return source === 'manual' || source === 'test_ramp' || source === 'test_20min';
}

/** El perfil con un FTP nuevo y su fuente; `ftpConfirmed` queda coherente. */
export function withFtp(p: Profile, watts: number, source: FtpSource, now: Date = new Date()): Profile {
  return { ...p, ftp: Math.round(watts), ftpSource: source, ftpConfirmed: isMeasuredFtp(source), ftpUpdatedAt: now.toISOString() };
}

/** Fuente al aceptar el FTP que sugirió el coach: si el atleta todavía no
 * tenía un número medido, la sugerencia sigue siendo un provisional
 * (calibración); si ya lo tenía, es un cambio que él decidió. */
export function sourceForAcceptedSuggestion(p: Pick<Profile, 'ftpSource' | 'ftpConfirmed'>): FtpSource {
  return isMeasuredFtp(ftpSourceOf(p)) ? 'manual' : 'provisional';
}

/** Edad cumplida a `today`. Parsea la fecha por partes: `new Date('1990-05-10')`
 * se interpreta en UTC y en husos negativos (México) caería un día antes. */
export function ageFromBirthDate(birthDate: string | undefined, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age--;
  return age >= 0 && age < 120 ? age : null;
}

/** Rangos válidos de los datos corporales: fuera de ellos es un error de
 * captura que el coach leería como dato real. */
export const BODY_LIMITS = { ageYears: [8, 100], weightKg: [30, 200], heightCm: [100, 230] } as const;

const inRange = (v: number | null | undefined, [lo, hi]: readonly [number, number]) => v != null && Number.isFinite(v) && v >= lo && v <= hi;

/** Qué le falta (o está mal) en fecha de nacimiento, peso y altura, en el
 * orden del cuestionario. null = todo bien. Son obligatorios para crear un
 * plan: la edad decide las reglas de menores y másters. */
export function bodyDataError(
  p: { birth_date?: string; weight_kg?: number; height_cm?: number },
  today: Date = new Date(),
): string | null {
  if (!inRange(ageFromBirthDate(p.birth_date, today), BODY_LIMITS.ageYears)) return 'Escribe tu fecha de nacimiento (de 8 a 100 años).';
  if (!inRange(p.weight_kg, BODY_LIMITS.weightKg)) return 'Escribe tu peso (de 30 a 200 kg).';
  if (!inRange(p.height_cm, BODY_LIMITS.heightCm)) return 'Escribe tu altura (de 100 a 230 cm).';
  return null;
}

const filled = (s: string | undefined) => !!s && s.trim().length > 0;

/** Qué le falta al cuestionario inicial, en el orden en que aparece. null =
 * completo. Todo es obligatorio para crear un plan (los archivos .fit no:
 * puede no tenerlos). Sirve igual para validar el formulario y para saber
 * si a un perfil guardado le falta algo. */
export function coachProfileError(p: Profile, today: Date = new Date()): string | null {
  if (!p.sex) return 'Elige tu sexo.';
  const body = bodyDataError(p, today);
  if (body) return body;
  if (!p.experienceLevel) return 'Elige qué tanto has entrenado con estructura.';
  if (!p.generalFitnessLevel) return 'Elige qué tan activo has estado.';
  if (!inRange(p.yearsRiding, [0, 80])) return 'Escribe cuántos años llevas andando en bici (0 si empiezas).';
  if (!inRange(p.structuredTrainingYears, [0, 80])) return 'Escribe cuántos años llevas entrenando con estructura (0 si nunca).';
  if (!p.discipline) return 'Elige tu disciplina principal.';
  if (p.ridesOutside === undefined) return 'Dinos si sales a rodar afuera.';
  if (p.ridesOutside && p.hasOutdoorPowerMeter === undefined) return 'Dinos si tienes medidor de potencia afuera.';
  if (!p.ftpSource) return 'Escribe tu FTP o marca «No sé mi FTP todavía».';
  if (p.hrMaxConfirmed === undefined) return 'Escribe tu pulso máximo o marca «No sé mi pulso máximo».';
  if (p.hrMaxConfirmed && !inRange(p.hr_max, [120, 230])) return 'Escribe tu pulso máximo (de 120 a 230 lpm).';
  if (p.otherActivities === undefined) return 'Dinos si haces otra actividad además de la bici, o marca «No hago otra actividad».';
  for (const a of p.otherActivities) {
    const err = otherActivityError(a);
    if (err) return err;
  }
  if (p.competes === undefined) return 'Dinos si compites.';
  if (p.competes && !filled(p.category)) return 'Escribe tu categoría.';
  if (!filled(p.recentBestResult)) return 'Escribe tu mejor resultado o logro reciente («ninguno todavía» también vale).';
  if (!filled(p.injuries)) return 'Escribe tus lesiones o limitaciones, o marca «No tengo».';
  return null;
}

export interface CoachProfileFtp {
  /** Solo si es un número medido: el coach no debe tratar el default o un
   * provisional como medición (null = "sin FTP medido"). */
  ftp: number | null;
  /** El número sobre el que corre el rodillo cuando es un provisional. */
  provisionalFtp: number | null;
  ftpSource: FtpSource;
  ftpUpdatedAt: string | null;
}

export function coachFtpFields(p: Profile): CoachProfileFtp {
  const source = ftpSourceOf(p);
  return {
    ftp: isMeasuredFtp(source) ? p.ftp : null,
    provisionalFtp: source === 'provisional' ? p.ftp : null,
    ftpSource: source,
    ftpUpdatedAt: p.ftpUpdatedAt ?? null,
  };
}

/** Lesiones, peso y edad para el coach. La fecha de nacimiento no sale del
 * dispositivo: solo la edad. */
export function coachProfileExtras(
  p: Profile,
  today: Date = new Date(),
): { injuries: string | null; weightKg: number | null; ageYears: number | null; otherActivities: OtherActivity[] | null } {
  return {
    injuries: p.injuries?.trim() || null,
    weightKg: p.weight_kg && p.weight_kg > 0 ? p.weight_kg : null,
    ageYears: ageFromBirthDate(p.birth_date, today),
    // Lo que hace además de la bici: el coach lo cuenta en la carga y la
    // fatiga, aunque Torq no lo agende. null = todavía no contesta.
    otherActivities: p.otherActivities ?? null,
  };
}
