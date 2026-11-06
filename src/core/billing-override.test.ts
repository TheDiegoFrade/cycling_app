import { describe, expect, it } from 'vitest';
import { couponIdFor, discountedPriceMxn, fmtMxn, effectivePriceMxn, freeActive, freeUntil, overrideLabel, parseOverrideInput } from './billing-override';

describe('parseOverrideInput', () => {
  it('gratis, con o sin meses', () => {
    expect(parseOverrideInput({ email: ' Ana@Correo.com ', kind: 'free' })).toEqual({ ok: true, value: { email: 'ana@correo.com', kind: 'free', percentOff: null, months: null, note: null } });
    expect(parseOverrideInput({ email: 'a@b.mx', kind: 'free', months: '3', note: 'amigo' })).toMatchObject({ ok: true, value: { months: 3, note: 'amigo' } });
  });
  it('descuento: pide el porcentaje entre 1 y 99', () => {
    expect(parseOverrideInput({ email: 'a@b.mx', kind: 'discount', percentOff: 50 })).toMatchObject({ ok: true, value: { percentOff: 50 } });
    expect(parseOverrideInput({ email: 'a@b.mx', kind: 'discount' })).toEqual({ ok: false, error: 'descuento entre 1 y 99 %' });
    expect(parseOverrideInput({ email: 'a@b.mx', kind: 'discount', percentOff: 100 }).ok).toBe(false);
    expect(parseOverrideInput({ email: 'a@b.mx', kind: 'discount', percentOff: 12.5 }).ok).toBe(false);
  });
  it('rechaza lo demás', () => {
    expect(parseOverrideInput({ email: 'no-es-correo', kind: 'free' }).ok).toBe(false);
    expect(parseOverrideInput({ email: 'a@b.mx', kind: 'otro' }).ok).toBe(false);
    expect(parseOverrideInput({ email: 'a@b.mx', kind: 'free', months: 0 }).ok).toBe(false);
    expect(parseOverrideInput({ email: 'a@b.mx', kind: 'free', months: 37 }).ok).toBe(false);
    expect(parseOverrideInput(null).ok).toBe(false);
  });
});

describe('freeActive / freeUntil', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  it('gratis para siempre o hasta una fecha', () => {
    expect(freeActive({ kind: 'free', until: null }, now)).toBe(true);
    expect(freeActive({ kind: 'free', until: '2026-12-01T00:00:00Z' }, now)).toBe(true);
    expect(freeActive({ kind: 'free', until: '2026-11-01T00:00:00Z' }, now)).toBe(false);
    expect(freeActive({ kind: 'discount', until: null }, now)).toBe(false);
    expect(freeActive(null, now)).toBe(false);
  });
  it('meses a partir de hoy', () => {
    expect(freeUntil(now, 3)).toBe('2027-02-06T12:00:00.000Z');
    expect(freeUntil(now, null)).toBeNull();
  });
});

describe('precios con descuento', () => {
  it('porcentaje del precio, con centavos', () => {
    expect(discountedPriceMxn(329, 50)).toBe(164.5);
    expect(discountedPriceMxn(329, 30)).toBe(230.3);
    expect(discountedPriceMxn(329, null)).toBe(329);
  });
  it('el precio efectivo de Stripe ignora descuentos vencidos', () => {
    const now = 1_800_000_000;
    expect(effectivePriceMxn(32900, [], now)).toBe(329);
    expect(effectivePriceMxn(32900, [{ end: null, percent_off: 50, amount_off: null }], now)).toBe(164.5);
    expect(effectivePriceMxn(32900, [{ end: now - 1, percent_off: 50, amount_off: null }], now)).toBe(329);
    expect(effectivePriceMxn(32900, [{ end: now + 100, percent_off: null, amount_off: 10000 }], now)).toBe(229);
  });
  it('un cupón por combinación y su texto', () => {
    expect(couponIdFor(50, null)).toBe('torq_50off_siempre');
    expect(couponIdFor(20, 3)).toBe('torq_20off_3m');
    expect(overrideLabel({ kind: 'discount', percent_off: 20, months: 3 })).toBe('20 % de descuento por 3 meses');
    expect(overrideLabel({ kind: 'free', percent_off: null, months: null })).toBe('Gratis para siempre');
    expect(overrideLabel({ kind: 'free', percent_off: null, months: 1 })).toBe('Gratis por 1 mes');
  });
});

describe('fmtMxn', () => {
  it('centavos solo si hacen falta', () => {
    expect(fmtMxn(329)).toBe('$329');
    expect(fmtMxn(164.5)).toBe('$164.50');
    // numeric de Postgres puede llegar como texto
    expect(fmtMxn('164.50')).toBe('$164.50');
    expect(fmtMxn('329.00')).toBe('$329');
  });
});
