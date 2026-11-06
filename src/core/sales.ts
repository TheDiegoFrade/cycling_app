// Ventas del mes para la factura global (docs/cobro-stripe.md, fase 5). Lógica
// pura: el rango del mes en hora de CDMX, los totales, la forma de pago SAT y
// el CSV. La consulta vive en la función billing (acción `sales`) y la
// pantalla en src/ui/screens/admin-sales.ts.

/** Un cobro de billing_payments, como lo regresa la acción `sales`. */
export interface SaleRow {
  stripe_invoice_id: string;
  stripe_charge_id: string | null;
  paid_at: string;
  total_cents: number;
  base_cents: number;
  iva_cents: number;
  card_funding: string | null;
  cfdi_uuid: string | null;
}

/** CDMX no cambia de horario desde 2022: siempre UTC−6. */
const MX_OFFSET = '-06:00';

const isMonthKey = (ym: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);

/** Mes (YYYY-MM) → [desde, hasta) en ISO, con los límites a medianoche de CDMX. */
export function mxMonthRange(ym: string): { from: string; to: string } {
  if (!isMonthKey(ym)) throw new Error(`mes inválido: ${ym}`);
  const [y, m] = ym.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { from: new Date(`${ym}-01T00:00:00${MX_OFFSET}`).toISOString(), to: new Date(`${next}-01T00:00:00${MX_OFFSET}`).toISOString() };
}

/** El mes anterior (YYYY-MM) en hora de CDMX: el que se factura el día 1. */
export function previousMonthKey(now: Date): string {
  const local = new Date(now.getTime() - 6 * 3_600_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth(); // 0-11: el mes anterior en 1-12
  return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, '0')}`;
}

export function isValidMonthKey(ym: unknown): ym is string {
  return typeof ym === 'string' && isMonthKey(ym);
}

/** Forma de pago SAT: 04 tarjeta de crédito, 28 tarjeta de débito. */
export function satPaymentForm(funding: string | null | undefined): '04' | '28' | null {
  if (funding === 'credit') return '04';
  if (funding === 'debit' || funding === 'prepaid') return '28';
  return null;
}

export interface SalesSummary {
  count: number;
  total_cents: number;
  base_cents: number;
  iva_cents: number;
  /** La forma de pago de la global: la del mayor monto. */
  paymentForm: '04' | '28' | null;
}

export function salesSummary(rows: SaleRow[]): SalesSummary {
  const byForm = new Map<string, number>();
  let total = 0;
  let base = 0;
  let iva = 0;
  for (const r of rows) {
    total += r.total_cents;
    base += r.base_cents;
    iva += r.iva_cents;
    const form = satPaymentForm(r.card_funding);
    if (form) byForm.set(form, (byForm.get(form) ?? 0) + r.total_cents);
  }
  const credit = byForm.get('04');
  const debit = byForm.get('28');
  const paymentForm = credit === undefined && debit === undefined ? null : (credit ?? 0) >= (debit ?? 0) ? '04' : '28';
  return { count: rows.length, total_cents: total, base_cents: base, iva_cents: iva, paymentForm };
}

const pesos = (cents: number) => (cents / 100).toFixed(2);

/** Fecha y hora de CDMX (YYYY-MM-DD HH:MM). */
export function mxDateTime(iso: string): string {
  return new Date(new Date(iso).getTime() - 6 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV para capturar la global en el portal del SAT (una línea por cobro). */
export function salesCsv(rows: SaleRow[]): string {
  const head = ['folio', 'fecha_cdmx', 'total', 'base', 'iva', 'tarjeta', 'forma_pago_sat', 'factura_stripe', 'cfdi_uuid'];
  const lines = rows.map((r) =>
    [r.stripe_charge_id ?? '', mxDateTime(r.paid_at), pesos(r.total_cents), pesos(r.base_cents), pesos(r.iva_cents), r.card_funding ?? '', satPaymentForm(r.card_funding) ?? '', r.stripe_invoice_id, r.cfdi_uuid ?? '']
      .map(csvCell)
      .join(','),
  );
  const s = salesSummary(rows);
  lines.push(['TOTAL', '', pesos(s.total_cents), pesos(s.base_cents), pesos(s.iva_cents), '', s.paymentForm ?? '', '', ''].join(','));
  return [head.join(','), ...lines].join('\n') + '\n';
}

/** UUID de un CFDI (36 caracteres con guiones). */
export function isCfdiUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}
