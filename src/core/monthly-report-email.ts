// Los números del reporte mensual en texto, para el correo. Vive en core (sin
// DOM) porque lo usan la vista del coach y la función del reporte mensual sin
// coach (supabase/functions/monthly-self-report, vía el bundle generado).
import type { MonthlyReport } from './monthly-report';
import { monthName, shiftMonth } from './monthly-report';

const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "+12", "−3" o "0"; con `digits` usa un decimal. */
export function signedNumber(n: number, digits = 0): string {
  const v = digits ? nf1.format(Math.abs(n)) : nf.format(Math.abs(Math.round(n)));
  return n > 0 ? `+${v}` : n < 0 ? `−${v}` : v;
}

/** Zona de forma según el TSB. */
export function tsbZone(tsb: number): string {
  if (tsb > 5) return 'Fresca';
  if (tsb >= -10) return 'Transición';
  if (tsb >= -30) return 'Zona productiva';
  return 'Fatiga alta';
}

/** Los mismos números del resumen, en texto, para el correo. */
export function emailKpis(r: MonthlyReport): { label: string; value: string; delta: string }[] {
  const k = r.kpis;
  const prev = monthName(shiftMonth(r.monthKey, -1));
  const vs = (n: number | null, unit: string, digits = 0) => {
    if (n === null || !Number.isFinite(n)) return 'sin comparación';
    const v = digits ? Math.round(n * 10) / 10 : Math.round(n);
    return v === 0 ? `igual que ${prev}` : `${v > 0 ? '+' : '−'}${digits ? nf1.format(Math.abs(v)) : nf.format(Math.abs(v))}${unit} vs. ${prev}`;
  };
  return [
    { label: 'Horas de bici', value: `${nf1.format(k.hours)} h`, delta: vs(k.hours - k.hoursPrev, ' h', 1) },
    { label: 'Carga (TSS)', value: nf.format(k.tss), delta: vs(k.tssPrev > 0 ? ((k.tss - k.tssPrev) / k.tssPrev) * 100 : null, ' %') },
    { label: 'Cumplimiento', value: k.compliancePct === null ? '—' : `${k.compliancePct} %`, delta: k.compliancePct === null ? 'sin plan agendado' : `${k.doneCount} de ${k.plannedCount} sesiones` },
    { label: 'Fitness (CTL)', value: nf.format(k.ctlEnd), delta: `${signedNumber(k.ctlEnd - k.ctlStart)} desde ${nf.format(k.ctlStart)}` },
    { label: 'FTP', value: k.ftp ? `${nf.format(k.ftp)} W` : '—', delta: k.ftp && k.ftpPrev ? vs(k.ftp - k.ftpPrev, ' W') : 'sin comparación' },
    { label: 'Forma (TSB)', value: signedNumber(k.tsbEnd), delta: tsbZone(k.tsbEnd) },
  ];
}
