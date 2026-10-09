// Qué día es (YYYY-MM-DD) en la zona horaria del atleta. Antes la app
// decidía el día con toISOString() (UTC): en México, de las 6 pm en
// adelante ya era "mañana" — hoy aparecía un día antes de tiempo en las
// gráficas y una sesión de las 7:49 pm del 5 caía en el 6, mientras que Plan
// agenda con la fecha local. Usa estas funciones para DECIDIR el día; la
// aritmética entre claves YYYY-MM-DD (sumar días, lunes de la semana) puede
// seguir en UTC, que no depende de la zona.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` de un instante, en la zona local (o en `timeZone`, p. ej. en
 * el servidor, que corre en UTC). */
export function localDateKey(d: Date, timeZone?: string): string {
  if (timeZone) {
    // en-CA da YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Hoy, en la zona del atleta. */
export function todayKey(now: Date = new Date(), timeZone?: string): string {
  return localDateKey(now, timeZone);
}

/** El día de una sesión (su `startedAt`, ISO) en la zona del atleta. Si ya
 * viene como YYYY-MM-DD, se queda igual. */
export function dayKeyOf(iso: string, timeZone?: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso.slice(0, 10) : localDateKey(new Date(t), timeZone);
}

/** Suma (o resta) días a una clave YYYY-MM-DD. */
export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Hace `days` días, contando desde hoy en la zona del atleta. */
export function daysAgoKey(days: number, now: Date = new Date()): string {
  return addDaysKey(todayKey(now), -days);
}
