import { describe, expect, it } from 'vitest';
import { BILLING_LIMITS, billingLimitReached, disputeIsFraud, isGuardedAction, trialCardReused } from './billing-guard';

describe('billingLimitReached', () => {
  it('suscribirse: hasta 5 por hora y 15 por día', () => {
    expect(billingLimitReached('subscribe', 4, 4)).toBe(false);
    expect(billingLimitReached('subscribe', 5, 5)).toBe(true);
    expect(billingLimitReached('subscribe', 0, 15)).toBe(true);
    expect(billingLimitReached('subscribe', 0, 14)).toBe(false);
  });
  it('portal y cancelar tienen más margen', () => {
    expect(billingLimitReached('portal', 9, 9)).toBe(false);
    expect(billingLimitReached('portal', 10, 10)).toBe(true);
    expect(billingLimitReached('cancel', 0, BILLING_LIMITS.cancel.perDay)).toBe(true);
  });
  it('solo se limitan las acciones que llaman a Stripe por el usuario', () => {
    expect(isGuardedAction('subscribe')).toBe(true);
    expect(isGuardedAction('status')).toBe(false);
    expect(isGuardedAction('sales')).toBe(false);
  });
});

describe('trialCardReused', () => {
  it('la misma tarjeta en otra cuenta ya no tiene prueba', () => {
    expect(trialCardReused(null, 'u1')).toBe(false);
    expect(trialCardReused({ user_id: 'u1' }, 'u1')).toBe(false);
    expect(trialCardReused({ user_id: 'u2' }, 'u1')).toBe(true);
  });
});

describe('disputeIsFraud', () => {
  it('fraude o cargo no reconocido', () => {
    expect(disputeIsFraud('fraudulent')).toBe(true);
    expect(disputeIsFraud('unrecognized')).toBe(true);
    expect(disputeIsFraud('product_not_received')).toBe(false);
    expect(disputeIsFraud(null)).toBe(false);
  });
});
