import { describe, expect, it } from 'vitest';
import { isCfdiUuid, mxDateTime, mxMonthRange, previousMonthKey, salesCsv, salesSummary, satPaymentForm } from './sales';
import type { SaleRow } from './sales';

const row = (r: Partial<SaleRow>): SaleRow => ({
  stripe_invoice_id: 'in_1',
  stripe_charge_id: 'ch_1',
  paid_at: '2026-11-03T18:00:00Z',
  total_cents: 32900,
  base_cents: 28362,
  iva_cents: 4538,
  card_funding: 'credit',
  cfdi_uuid: null,
  ...r,
});

describe('mxMonthRange', () => {
  it('el mes va de medianoche a medianoche en CDMX (UTC−6)', () => {
    expect(mxMonthRange('2026-11')).toEqual({ from: '2026-11-01T06:00:00.000Z', to: '2026-12-01T06:00:00.000Z' });
    expect(mxMonthRange('2026-12')).toEqual({ from: '2026-12-01T06:00:00.000Z', to: '2027-01-01T06:00:00.000Z' });
  });
  it('rechaza meses inválidos', () => {
    expect(() => mxMonthRange('2026-13')).toThrow();
    expect(() => mxMonthRange('nov')).toThrow();
  });
});

describe('previousMonthKey', () => {
  it('el mes anterior en hora de CDMX', () => {
    expect(previousMonthKey(new Date('2026-12-01T12:00:00Z'))).toBe('2026-11');
    // 1-dic 03:00 UTC todavía es 30-nov en CDMX
    expect(previousMonthKey(new Date('2026-12-01T03:00:00Z'))).toBe('2026-10');
    expect(previousMonthKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-12');
  });
});

describe('satPaymentForm', () => {
  it('crédito 04, débito 28', () => {
    expect(satPaymentForm('credit')).toBe('04');
    expect(satPaymentForm('debit')).toBe('28');
    expect(satPaymentForm('prepaid')).toBe('28');
    expect(satPaymentForm(null)).toBeNull();
  });
});

describe('salesSummary', () => {
  it('suma base e IVA y elige la forma de pago del mayor monto', () => {
    const s = salesSummary([row({}), row({ stripe_invoice_id: 'in_2', card_funding: 'debit' }), row({ stripe_invoice_id: 'in_3', card_funding: 'debit' })]);
    expect(s).toEqual({ count: 3, total_cents: 98700, base_cents: 85086, iva_cents: 13614, paymentForm: '28' });
    expect(salesSummary([]).paymentForm).toBeNull();
  });
});

describe('salesCsv', () => {
  it('una línea por cobro y el total al pie', () => {
    const csv = salesCsv([row({})]);
    expect(csv.split('\n')).toEqual([
      'folio,fecha_cdmx,total,base,iva,tarjeta,forma_pago_sat,factura_stripe,cfdi_uuid',
      'ch_1,2026-11-03 12:00,329.00,283.62,45.38,credit,04,in_1,',
      'TOTAL,,329.00,283.62,45.38,,04,,',
      '',
    ]);
  });
});

describe('mxDateTime / isCfdiUuid', () => {
  it('fecha en CDMX y UUID válido', () => {
    expect(mxDateTime('2026-11-01T05:30:00Z')).toBe('2026-10-31 23:30');
    expect(isCfdiUuid('6F2B1A3C-1234-4ABC-9DEF-0123456789AB')).toBe(true);
    expect(isCfdiUuid('no-es-uuid')).toBe(false);
  });
});
