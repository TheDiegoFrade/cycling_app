// El FTP del perfil y lo que el coach de IA necesita saber de él. El rodillo
// siempre corre sobre `profile.ftp` (aunque sea el default de 200 W); el
// coach necesita saber además de dónde salió ese número para no tomar un
// default o un provisional por una medición (ver prompt.ts, "El FTP del
// perfil"). Lógica pura: la usan el Perfil, el cuestionario y coach.ts.
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
export function coachProfileExtras(p: Profile, today: Date = new Date()): { injuries: string | null; weightKg: number | null; ageYears: number | null } {
  return {
    injuries: p.injuries?.trim() || null,
    weightKg: p.weight_kg && p.weight_kg > 0 ? p.weight_kg : null,
    ageYears: ageFromBirthDate(p.birth_date, today),
  };
}
