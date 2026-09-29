import type { Comment, Interval } from './types';

export interface CourseParseResult {
  name: string;
  intervals: Interval[];
  comments: Comment[];
  errors: string[];
}

function extractSection(text: string, startTag: string, endTag: string): string | null {
  const start = text.indexOf(startTag);
  const end = text.indexOf(endTag);
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start + startTag.length, end);
}

function extractHeaderField(header: string, field: string): string | undefined {
  const re = new RegExp(`^\\s*${field}\\s*=\\s*(.+)$`, 'im');
  const m = re.exec(header);
  return m ? m[1].trim() : undefined;
}

interface Point {
  t: number; // minutos
  value: number;
}

function parsePoints(dataSection: string, errors: string[], ext: string): Point[] {
  const points: Point[] = [];
  const lines = dataSection
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    const t = Number(parts[0]);
    const value = Number(parts[1]);
    if (!Number.isFinite(t) || !Number.isFinite(value)) {
      errors.push(`línea de ${ext} con valores no numéricos: "${line}"`);
      continue;
    }
    points.push({ t, value });
  }
  return points;
}

/** Un `.mrc`/`.erg` es una lista de puntos (minuto, valor) que arma una
 * polilínea — cada par consecutivo es un bloque: mismo valor en ambos
 * extremos = bloque plano, valores distintos = rampa lineal. Un par con el
 * mismo minuto en ambos puntos no es un bloque (duración 0): es solo la
 * marca de "salto" al valor del siguiente bloque. */
function pointsToIntervals(points: Point[], toPct: (value: number) => number): Interval[] {
  const intervals: Interval[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const duration_s = Math.round((b.t - a.t) * 60);
    if (duration_s <= 0) continue;
    const power_pct = toPct(a.value);
    const ramp_to_pct = a.value !== b.value ? toPct(b.value) : undefined;
    intervals.push({ name: `Bloque ${intervals.length + 1}`, type: 'steady', duration_s, power_pct, ramp_to_pct });
  }
  return intervals;
}

function parseCourseFile(text: string, ext: string, toPct: (value: number) => number, extraErrors: string[] = []): CourseParseResult {
  const errors: string[] = [...extraErrors];
  const header = extractSection(text, '[COURSE HEADER]', '[END COURSE HEADER]') ?? '';
  const dataSection = extractSection(text, '[COURSE DATA]', '[END COURSE DATA]');
  const name = extractHeaderField(header, 'DESCRIPTION') ?? extractHeaderField(header, 'FILE NAME') ?? 'Workout importado';
  if (dataSection === null) {
    errors.push(`no se encontró el bloque \`[COURSE DATA]...[END COURSE DATA]\` en el archivo .${ext}`);
    return { name, intervals: [], comments: [], errors };
  }
  const points = parsePoints(dataSection, errors, `.${ext}`);
  if (points.length < 2) {
    errors.push(`el archivo .${ext} no tiene suficientes puntos para armar al menos un bloque`);
    return { name, intervals: [], comments: [], errors };
  }
  return { name, intervals: pointsToIntervals(points, toPct), comments: [], errors };
}

/** `.mrc`: los valores ya vienen en % de FTP, directo. */
export function parseMrc(text: string): CourseParseResult {
  return parseCourseFile(text, 'mrc', (pct) => Math.round(pct));
}

/** `.erg`: los valores vienen en watts absolutos — hace falta el FTP actual
 * del perfil para convertir a % de FTP, que es como Torq guarda los
 * objetivos internamente (así el workout se reescala si el FTP cambia). */
export function parseErg(text: string, ftp: number): CourseParseResult {
  if (!ftp || ftp <= 0) {
    return parseCourseFile(text, 'erg', (w) => w, ['no se puede convertir watts a % de FTP sin un FTP válido en tu perfil']);
  }
  return parseCourseFile(text, 'erg', (watts) => Math.round((watts / ftp) * 100));
}
