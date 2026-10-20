import { describe, expect, it } from 'vitest';
import { FOUNDER_PRICE_MXN, PRICE_MXN, aiAccess, priceForNewSubscription } from './access';
import type { AccessInput, SubscriptionState } from './access';

const now = new Date('2026-11-15T12:00:00Z');
const none: AccessInput = { comp: false, isCoach: false, hasActiveCoach: false, subscription: null, now };
const sub = (s: Partial<SubscriptionState>): SubscriptionState => ({ status: 'authorized', paidUntil: '2026-12-01T00:00:00Z', graceUntil: null, priceMxn: 399, ...s });

describe('aiAccess', () => {
  it('sin nada no hay IA', () => {
    expect(aiAccess(none)).toEqual({ ai: false, reason: 'none' });
  });
  it('cortesía, coach y atleta con coach: gratis', () => {
    expect(aiAccess({ ...none, comp: true }).reason).toBe('comp');
    expect(aiAccess({ ...none, isCoach: true }).reason).toBe('coach');
    expect(aiAccess({ ...none, hasActiveCoach: true }).reason).toBe('coached');
  });
  it('suscripción al corriente', () => {
    expect(aiAccess({ ...none, subscription: sub({}) })).toEqual({ ai: true, reason: 'subscription' });
  });
  it('periodo vencido sin cobro nuevo: sin IA', () => {
    expect(aiAccess({ ...none, subscription: sub({ paidUntil: '2026-11-01T00:00:00Z' }) }).ai).toBe(false);
  });
  it('cobro rechazado: días de gracia', () => {
    const s = sub({ paidUntil: '2026-11-10T00:00:00Z', graceUntil: '2026-11-17T00:00:00Z' });
    expect(aiAccess({ ...none, subscription: s })).toEqual({ ai: true, reason: 'grace' });
    expect(aiAccess({ ...none, subscription: s, now: new Date('2026-11-18T00:00:00Z') }).ai).toBe(false);
  });
  it('canceló: conserva lo pagado hasta el fin del periodo', () => {
    expect(aiAccess({ ...none, subscription: sub({ status: 'cancelled' }) }).ai).toBe(true);
    expect(aiAccess({ ...none, subscription: sub({ status: 'cancelled', paidUntil: '2026-11-01T00:00:00Z' }) }).ai).toBe(false);
  });
  it('pendiente (no ha autorizado el pago): sin IA', () => {
    expect(aiAccess({ ...none, subscription: sub({ status: 'pending', paidUntil: null }) }).ai).toBe(false);
  });
});

describe('priceForNewSubscription', () => {
  it('fundador hasta el fin del día límite (hora de CDMX)', () => {
    expect(priceForNewSubscription(new Date('2026-12-31T18:00:00Z'), '2026-12-31')).toBe(FOUNDER_PRICE_MXN);
    expect(priceForNewSubscription(new Date('2027-01-01T07:00:00Z'), '2026-12-31')).toBe(PRICE_MXN);
  });
  it('sin fecha límite, precio normal', () => {
    expect(priceForNewSubscription(now, null)).toBe(PRICE_MXN);
    expect(priceForNewSubscription(now, 'mañana')).toBe(PRICE_MXN);
  });
});
