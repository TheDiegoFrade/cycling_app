// Clientes especiales: el administrador decide a quién no se le cobra
// (gratis, para siempre o por unos meses) y a quién se le cobra con
// descuento (un % del precio, para siempre o por unos meses). Lógica pura; la
// guardan las acciones de administrador de la función billing en
// billing_overrides y se ven en Admin → Clientes especiales. Ver
// docs/cobro-stripe.md, «Clientes especiales».

export type OverrideKind = 'free' | 'discount';

export interface OverrideInput {
  email: string;
  kind: OverrideKind;
  /** Solo descuento: 1–99. */
  percentOff: number | null;
  /** Por cuántos meses (null = siempre). */
  months: number | null;
  note: string | null;
}

/** Lo que guarda billing_overrides. */
export interface OverrideRow {
  user_id: string;
  email: string;
  kind: OverrideKind;
  percent_off: number | null;
  months: number | null;
  /** Gratis: hasta cuándo (null = siempre). El descuento con meses lo termina Stripe. */
  until: string | null;
  note: string | null;
  created_at: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MAX_OVERRIDE_MONTHS = 36;

const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};

/** Valida lo que manda la pantalla de administrador. */
export function parseOverrideInput(body: unknown): { ok: true; value: OverrideInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: 'correo inválido' };
  const kind = b.kind;
  if (kind !== 'free' && kind !== 'discount') return { ok: false, error: 'tipo inválido' };
  const months = intOrNull(b.months);
  if (months !== null && (Number.isNaN(months) || months < 1 || months > MAX_OVERRIDE_MONTHS)) return { ok: false, error: `meses entre 1 y ${MAX_OVERRIDE_MONTHS}` };
  let percentOff: number | null = null;
  if (kind === 'discount') {
    percentOff = intOrNull(b.percentOff);
    if (percentOff === null || Number.isNaN(percentOff) || percentOff < 1 || percentOff > 99) return { ok: false, error: 'descuento entre 1 y 99 %' };
  }
  const note = String(b.note ?? '').trim().slice(0, 200) || null;
  return { ok: true, value: { email, kind, percentOff, months, note } };
}

/** ¿Este cliente no paga ahora? (gratis y sin vencer). */
export function freeActive(o: Pick<OverrideRow, 'kind' | 'until'> | null | undefined, now: Date): boolean {
  return !!o && o.kind === 'free' && (o.until === null || new Date(o.until).getTime() > now.getTime());
}

/** Gratis por `months` meses a partir de `now` (null = siempre). */
export function freeUntil(now: Date, months: number | null): string | null {
  if (!months) return null;
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

/** Precio con descuento, en pesos con centavos (329 con 50 % → 164.5). */
export function discountedPriceMxn(priceMxn: number, percentOff: number | null | undefined): number {
  if (!percentOff) return priceMxn;
  return Math.round(priceMxn * (100 - percentOff)) / 100;
}

/** «$329» o «$164.50». Acepta el precio como número o como texto
 * (la base guarda price_mxn como numeric y puede llegar como "164.50"). */
export function fmtMxn(price: number | string): string {
  const n = Number(price);
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

/** Un cupón de Stripe por combinación: se crea la primera vez y se reutiliza. */
export function couponIdFor(percentOff: number, months: number | null): string {
  return `torq_${percentOff}off_${months ? `${months}m` : 'siempre'}`;
}

/** «50 % de descuento por 3 meses» / «gratis para siempre». */
export function overrideLabel(o: Pick<OverrideRow, 'kind' | 'percent_off' | 'months'>): string {
  const span = o.months ? `por ${o.months} ${o.months === 1 ? 'mes' : 'meses'}` : 'para siempre';
  return o.kind === 'free' ? `Gratis ${span}` : `${o.percent_off} % de descuento ${span}`;
}

/** Precio efectivo de una suscripción de Stripe: precio de lista menos los
 * descuentos de porcentaje vigentes (los de monto fijo también se restan). */
export function effectivePriceMxn(
  unitAmountCents: number,
  discounts: Array<{ end: number | null; percent_off: number | null; amount_off: number | null }>,
  nowS: number,
): number {
  let cents = unitAmountCents;
  for (const d of discounts) {
    if (d.end !== null && d.end <= nowS) continue;
    if (d.percent_off) cents = Math.round((cents * (100 - d.percent_off)) / 100);
    else if (d.amount_off) cents = Math.max(0, cents - d.amount_off);
  }
  return cents / 100;
}
