// El FTP del perfil y lo que el coach de IA necesita saber de él. El rodillo
// siempre corre sobre `profile.ftp` (aunque sea el default de 200 W); el
// coach necesita saber además de dónde salió ese número para no tomar un
// default o un provisional por una medición (ver prompt.ts, "El FTP del
// perfil"). Lógica pura: la usan el Perfil, el cuestionario y coach.ts.
import { intakeError } from './intake';
import type { HealthIntake } from './intake';
import { otherActivityError } from './other-activities';
import type { OtherActivity } from './other-activities';
import type { RpeZones } from './rpe-ramp';
import type { FtpSource, Profile } from './types';

/** Fuente del FTP, con la migración implícita de perfiles anteriores a
 * `ftpSource`: confirmado → 'manual', lo demás → 'default'. */
export function ftpSourceOf(p: Pick<Profile, 'ftpSource' | 'ftpConfirmed'>): FtpSource {
  return p.ftpSource ?? (p.ftpConfirmed ? 'manual' : 'default');
}

/** FTP con el que arranca alguien de quien no sabemos nada todavía (antes
 * del cuestionario). Antes era 200 W: el de alguien que ya entrena, y a un
 * principiante le dejaba la Z2 en 130 W. */
export const STARTING_FTP_FALLBACK = 150;
/** El default que traían los perfiles viejos (se reemplaza al cargar). */
export const LEGACY_DEFAULT_FTP = 200;

/** W/kg de arranque según qué tan activo ha estado. A propósito por debajo
 * del promedio: es mejor que la primera semana se sienta fácil y subir con
 * +/− (o con el test de las primeras semanas) que prometer un número que no
 * sostiene. */
const START_WKG: Record<NonNullable<Profile['generalFitnessLevel']>, number> = {
  sedentary: 1.6,
  active_other_sport: 1.9,
  active_cyclist: 2.2,
};
const START_WKG_EXPERIENCED_CYCLIST = 2.7;

/** Peso que cuenta para la potencia: hasta un peso de referencia cuenta
 * completo; arriba, solo una parte. Los kilos de más no suben la potencia en
 * la misma proporción (85 kg × 2.5 W/kg daba 215 W a un ciclista recreativo). */
const REF_WEIGHT_KG = { M: 70, F: 60 } as const;
const EXTRA_WEIGHT_SHARE = 0.3;
function powerWeightKg(weightKg: number, sex: Profile['sex']): number {
  const ref = sex === 'F' ? REF_WEIGHT_KG.F : REF_WEIGHT_KG.M;
  return weightKg <= ref ? weightKg : ref + (weightKg - ref) * EXTRA_WEIGHT_SHARE;
}

/** FTP estimado para quien no sabe el suyo, con lo que contestó en el
 * cuestionario: peso, actividad, experiencia, sexo y edad. Redondeado a 5 W,
 * entre 80 y 280. Sin peso, el de respaldo. */
export function estimatedStartingFtp(
  p: Pick<Profile, 'weight_kg' | 'sex' | 'birth_date' | 'generalFitnessLevel' | 'experienceLevel'>,
  today: Date = new Date(),
): number {
  if (!p.weight_kg || p.weight_kg <= 0) return STARTING_FTP_FALLBACK;
  let wkg = p.generalFitnessLevel ? START_WKG[p.generalFitnessLevel] : 1.9;
  if (p.generalFitnessLevel === 'active_cyclist' && p.experienceLevel === 'experienced') wkg = START_WKG_EXPERIENCED_CYCLIST;
  if (p.sex === 'F') wkg *= 0.88;
  const age = ageFromBirthDate(p.birth_date, today);
  if (age !== null && age >= 60) wkg *= 0.85;
  else if (age !== null && age >= 50) wkg *= 0.92;
  return Math.min(280, Math.max(80, Math.round((powerWeightKg(p.weight_kg, p.sex) * wkg) / 5) * 5));
}

/** Perfil cargado con el FTP por defecto de antes (200, o el de respaldo):
 * se cambia por el estimado si ya contestó su peso. Un FTP medido, escrito
 * por la persona o provisional no se toca. */
export function withStartingFtpEstimate(p: Profile, today: Date = new Date()): Profile {
  if (ftpSourceOf(p) !== 'default' || !p.weight_kg) return p;
  if (p.ftp !== LEGACY_DEFAULT_FTP && p.ftp !== STARTING_FTP_FALLBACK) return p;
  const ftp = estimatedStartingFtp(p, today);
  return ftp === p.ftp ? p : { ...p, ftp };
}

/** Un número que el atleta midió o escribió como suyo (no default ni
 * provisional). Es lo que significa `ftpConfirmed`. */
export function isMeasuredFtp(source: FtpSource): boolean {
  return source === 'manual' || source === 'test_ramp' || source === 'test_20min' || source === 'test_rpe_ramp';
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
// Edad: Torq es solo para mayores de 18 (términos §2, ver core/access.ts).
export const BODY_LIMITS = { ageYears: [18, 100], weightKg: [30, 200], heightCm: [100, 230] } as const;

const inRange = (v: number | null | undefined, [lo, hi]: readonly [number, number]) => v != null && Number.isFinite(v) && v >= lo && v <= hi;

/** Qué le falta (o está mal) en fecha de nacimiento, peso y altura, en el
 * orden del cuestionario. null = todo bien. Son obligatorios para crear un
 * plan: la edad decide las reglas de menores y másters. */
export function bodyDataError(
  p: { birth_date?: string; weight_kg?: number; height_cm?: number },
  today: Date = new Date(),
): string | null {
  const age = ageFromBirthDate(p.birth_date, today);
  if (age !== null && age < BODY_LIMITS.ageYears[0]) return 'Torq es solo para mayores de 18 años. Revisa tu fecha de nacimiento.';
  if (!inRange(age, BODY_LIMITS.ageYears)) return 'Escribe tu fecha de nacimiento (de 18 a 100 años).';
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
  // Salud y hábitos van justo después: es lo primero que manda (método de Joe).
  const health = intakeError(p.intake);
  if (health) return health;
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
): {
  injuries: string | null;
  weightKg: number | null;
  ageYears: number | null;
  otherActivities: OtherActivity[] | null;
  intake: HealthIntake | null;
  experienceLevel: Profile['experienceLevel'] | null;
  generalFitnessLevel: Profile['generalFitnessLevel'] | null;
  structuredTrainingYears: number | null;
  rpeZones: Omit<RpeZones, 'steps'> | null;
} {
  return {
    injuries: p.injuries?.trim() || null,
    weightKg: p.weight_kg && p.weight_kg > 0 ? p.weight_kg : null,
    ageYears: ageFromBirthDate(p.birth_date, today),
    // Lo que hace además de la bici: el coach lo cuenta en la carga y la
    // fatiga, aunque Torq no lo agende. null = todavía no contesta.
    otherActivities: p.otherActivities ?? null,
    // Salud y hábitos: el servidor saca de aquí el perfil de arranque (core/intake.ts).
    intake: p.intake ?? null,
    experienceLevel: p.experienceLevel ?? null,
    generalFitnessLevel: p.generalFitnessLevel ?? null,
    structuredTrainingYears: p.structuredTrainingYears ?? null,
    // Zonas en watts de su rampa por RPE (sin el detalle de escalones).
    rpeZones: p.rpeZones ? (({ steps: _steps, ...z }) => z)(p.rpeZones) : null,
  };
}
