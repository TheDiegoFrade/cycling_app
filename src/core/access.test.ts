import { describe, expect, it } from 'vitest';
import { PRICE_MXN, aiAccess } from './access';
import type { AccessInput, SubscriptionState } from './access';

const now = new Date('2026-11-15T12:00:00Z');
const none: AccessInput = { comp: false, subscription: null, now };
const sub = (s: Partial<SubscriptionState>): SubscriptionState => ({ status: 'authorized', paidUntil: '2026-12-01T00:00:00Z', graceUntil: null, priceMxn: PRICE_MXN, ...s });

describe('aiAccess', () => {
  it('sin nada no hay IA', () => {
    expect(aiAccess(none)).toEqual({ ai: false, reason: 'none' });
  });
  it('solo la cortesía no paga (ser coach o tener coach ya no cuenta)', () => {
    expect(aiAccess({ ...none, comp: true })).toEqual({ ai: true, reason: 'comp' });
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

describe('precio', () => {
  it('$349 al mes con IVA, sin precio de fundador', () => {
    expect(PRICE_MXN).toBe(349);
  });
});
