// Exportar a CSV: sesiones (Historial → Actividad) y lo agendado (Plan).
// Todo se arma en el navegador con lo que la app ya tiene: sin IA ni
// servidor. Lógica pura; el botón y la descarga viven en las pantallas.
//
// Formato: UTF-8 con BOM (Excel en español respeta acentos), coma como
// separador, punto decimal y fin de línea CRLF.

export type CsvCell = string | number | null | undefined;

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '') : v;
  // Excel ejecuta celdas que empiezan con = + - @ como fórmula: una nota
  // escrita por el atleta nunca debe poder hacerlo.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export interface CsvSession {
  startedAt: string;
  name: string;
  /** «Bici» o el tipo de actividad (Fuerza, Correr…). */
  kind: string;
  source: string;
  durationMin: number;
  avgPower: number | null;
  normalizedPower: number | null;
  maxPower: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  intensityFactor: number | null;
  tss: number | null;
  ftp: number | null;
  rpe: number | null;
  note: string | null;
}

export const SESSION_HEADERS = [
  'Fecha',
  'Hora',
  'Nombre',
  'Tipo',
  'Origen',
  'Duración (min)',
  'Potencia promedio (W)',
  'Potencia normalizada (W)',
  'Potencia máxima (W)',
  'Pulso promedio (lpm)',
  'Pulso máximo (lpm)',
  'Cadencia promedio (rpm)',
  'IF',
  'TSS',
  'FTP de la sesión (W)',
  'RPE',
  'Nota',
] as const;

const pad = (n: number) => String(n).padStart(2, '0');
/** Fecha y hora locales del dispositivo (la misma que se ve en la app). */
function localDateTime(iso: string): [string, string] {
  const d = new Date(iso);
  return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`];
}
/** 0 en un promedio casi siempre es «no había sensor»: mejor celda vacía. */
const orBlank = (v: number | null) => (v === null || v === 0 ? null : Math.round(v));

/** Más reciente primero, igual que la lista de Actividad. */
export function sessionsCsv(sessions: readonly CsvSession[]): string {
  const rows = [...sessions]
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .map((s) => {
      const [date, time] = localDateTime(s.startedAt);
      return [
        date,
        time,
        s.name,
        s.kind,
        s.source,
        Math.round(s.durationMin),
        orBlank(s.avgPower),
        orBlank(s.normalizedPower),
        orBlank(s.maxPower),
        orBlank(s.avgHr),
        orBlank(s.maxHr),
        orBlank(s.avgCadence),
        s.intensityFactor,
        s.tss === null ? null : Math.round(s.tss),
        orBlank(s.ftp),
        s.rpe,
        s.note,
      ];
    });
  return toCsv(SESSION_HEADERS, rows);
}

export interface CsvPlanItem {
  date: string;
  name: string;
  /** «Rodillo» o el tipo de rutina (Fuerza, Movilidad…). */
  kind: string;
  zone: string | null;
  minutes: number | null;
  tss: number | null;
  done: boolean;
  description: string | null;
}

export const PLAN_HEADERS = ['Fecha', 'Día', 'Nombre', 'Tipo', 'Zona', 'Duración (min)', 'TSS estimado', 'Hecho', 'Descripción'] as const;

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Por fecha, la más antigua primero (como se lee un plan). */
export function planCsv(items: readonly CsvPlanItem[]): string {
  const rows = [...items]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((i) => [
      i.date,
      WEEKDAYS[new Date(`${i.date}T00:00:00Z`).getUTCDay()],
      i.name,
      i.kind,
      i.zone,
      i.minutes === null ? null : Math.round(i.minutes),
      i.tss === null ? null : Math.round(i.tss),
      i.done ? 'Sí' : 'No',
      i.description,
    ]);
  return toCsv(PLAN_HEADERS, rows);
}

/** Nombre del archivo: torq-sesiones-2026-10-19.csv */
export function csvFileName(what: 'sesiones' | 'plan', todayKey: string): string {
  return `torq-${what}-${todayKey}.csv`;
}
