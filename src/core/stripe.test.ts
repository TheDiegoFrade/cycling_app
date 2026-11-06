import { describe, expect, it } from 'vitest';
import { ivaSplit, laterIso, paidUntilFromPeriodEnd, resumable, stillLive, stripeStatusOf, subscriptionChangeOf, trialEligible } from './stripe';
import type { StripeSubscriptionLike } from './stripe';

const sub = (s: Partial<StripeSubscriptionLike>): StripeSubscriptionLike => ({ status: 'active', cancel_at_period_end: false, cancel_at: null, trial_end: null, ...s });
const ts = (iso: string) => Date.parse(iso) / 1000;

describe('stripeStatusOf', () => {
  it('active, trialing y past_due: autorizada', () => {
    expect(stripeStatusOf(sub({}))).toBe('authorized');
    expect(stripeStatusOf(sub({ status: 'trialing' }))).toBe('authorized');
    expect(stripeStatusOf(sub({ status: 'past_due' }))).toBe('authorized');
  });
  it('pidió cancelar al final del periodo: cancelada (conserva lo pagado)', () => {
    expect(stripeStatusOf(sub({ cancel_at_period_end: true }))).toBe('cancelled');
    expect(stripeStatusOf(sub({ status: 'trialing', cancel_at_period_end: true }))).toBe('cancelled');
    expect(stripeStatusOf(sub({ cancel_at: ts('2026-12-01T00:00:00Z') }))).toBe('cancelled');
  });
  it('paused, terminadas e incompletas', () => {
    expect(stripeStatusOf(sub({ status: 'paused' }))).toBe('paused');
    for (const status of ['canceled', 'unpaid', 'incomplete_expired']) expect(stripeStatusOf(sub({ status }))).toBe('cancelled');
    expect(stripeStatusOf(sub({ status: 'incomplete' }))).toBe('pending');
    expect(stripeStatusOf(sub({ status: 'algo_nuevo' }))).toBe('pending');
  });
});

describe('paidUntilFromPeriodEnd', () => {
  it('fin del periodo + 2 días', () => {
    expect(paidUntilFromPeriodEnd(ts('2026-12-06T10:00:00Z'))).toBe('2026-12-08T10:00:00.000Z');
  });
});

describe('subscriptionChangeOf', () => {
  it('en prueba da acceso hasta el fin de la prueba (con margen)', () => {
    const trialEnd = ts('2026-11-13T10:00:00Z');
    expect(subscriptionChangeOf(sub({ status: 'trialing', trial_end: trialEnd }))).toEqual({ status: 'authorized', paid_until: '2026-11-15T10:00:00.000Z' });
  });
  it('si cancela en la prueba, el acceso termina justo con la prueba', () => {
    const trialEnd = ts('2026-11-13T10:00:00Z');
    expect(subscriptionChangeOf(sub({ status: 'trialing', trial_end: trialEnd, cancel_at_period_end: true }))).toEqual({ status: 'cancelled', paid_until: '2026-11-13T10:00:00.000Z' });
  });
  it('fuera de prueba no toca paid_until (eso lo hace invoice.paid)', () => {
    expect(subscriptionChangeOf(sub({ trial_end: ts('2026-11-01T00:00:00Z') }))).toEqual({ status: 'authorized' });
  });
});

describe('resumable / stillLive', () => {
  it('reactivar sin Checkout solo si sigue viva y pidió cancelar', () => {
    expect(resumable(sub({ cancel_at_period_end: true }))).toBe(true);
    expect(resumable(sub({ status: 'trialing', cancel_at_period_end: true }))).toBe(true);
    expect(resumable(sub({}))).toBe(false);
    expect(resumable(sub({ status: 'canceled', cancel_at_period_end: true }))).toBe(false);
  });
  it('viva = todavía puede cobrar', () => {
    expect(stillLive(sub({ status: 'past_due' }))).toBe(true);
    expect(stillLive(sub({ status: 'unpaid' }))).toBe(true);
    expect(stillLive(sub({ status: 'canceled' }))).toBe(false);
    expect(stillLive(sub({ status: 'incomplete_expired' }))).toBe(false);
  });
});

describe('trialEligible', () => {
  it('una sola prueba por cuenta', () => {
    expect(trialEligible(null)).toBe(true);
    // abrió Checkout y no terminó: sigue teniendo su prueba
    expect(trialEligible({ stripe_subscription_id: null, paid_until: null })).toBe(true);
    expect(trialEligible({ stripe_subscription_id: 'sub_1', paid_until: null })).toBe(false);
    // ya pagó antes (p. ej. con Mercado Pago)
    expect(trialEligible({ stripe_subscription_id: null, paid_until: '2026-10-01T00:00:00Z' })).toBe(false);
  });
});

describe('laterIso', () => {
  it('un aviso viejo no recorta lo pagado', () => {
    expect(laterIso('2027-01-08T00:00:00.000Z', '2026-12-08T00:00:00.000Z')).toBe('2027-01-08T00:00:00.000Z');
    expect(laterIso('2026-12-08T00:00:00.000Z', '2027-01-08T00:00:00.000Z')).toBe('2027-01-08T00:00:00.000Z');
    expect(laterIso(null, '2027-01-08T00:00:00.000Z')).toBe('2027-01-08T00:00:00.000Z');
  });
});

describe('ivaSplit', () => {
  it('$329 con IVA: base 283.62, IVA 45.38', () => {
    expect(ivaSplit(32900)).toEqual({ base_cents: 28362, iva_cents: 4538 });
  });
  it('base + IVA = total siempre, también con montos raros', () => {
    for (const total of [0, 1, 99, 116, 29900, 39900, 32901, 123457, 999999]) {
      const { base_cents, iva_cents } = ivaSplit(total);
      expect(base_cents + iva_cents).toBe(total);
      expect(Number.isInteger(base_cents) && Number.isInteger(iva_cents)).toBe(true);
      expect(Math.abs(iva_cents - base_cents * 0.16)).toBeLessThanOrEqual(1);
    }
  });
});
