// Lo de src/core que usan las Edge Functions (Deno no resuelve los imports sin
// extensión de src/). `npm run build:edge` lo empaqueta en
// supabase/functions/_shared/core.gen.js; core.gen.test.ts revisa que esté al día.
export { addDays, buildMonthlyReport, defaultReviewMonth, monthEnd, monthStart, reviewAiContext, shiftMonth } from './monthly-report';
export { emailKpis } from './monthly-report-email';
export { mondayOfWeek } from '../engine/streaks';
export { localDateKey } from './day-key';
export { startPhase } from './self-report-start';
export { evalWeekTarget, planTotalWeeks, planWeekOf } from './eval-week';
export { startingProfile } from './intake';
export { rpeRampIntervals } from './rpe-ramp';
export { hasUnlimitedCoach } from './coach-testers';
export { parsePinonRequest, pinonLimitReached, pinonUserMessage } from './pinon-chat-request';
export { GRACE_DAYS, PRICE_MXN, TRIAL_DAYS, aiAccess } from './access';
// Mercado Pago: ya no lo usa ninguna función (se cobra con Stripe); se queda
// mientras Stripe no esté en producción (docs/cobro-stripe.md, 3.4).
export { applyPayment, subscriptionStatusOf, verifyMpSignature } from './mercadopago';
export { isCfdiUuid, isValidMonthKey, mxMonthRange, previousMonthKey } from './sales';
export { billingLimitReached, disputeIsFraud, isGuardedAction, trialCardReused } from './billing-guard';
export { couponIdFor, discountedPriceMxn, effectivePriceMxn, freeActive, freeUntil, parseOverrideInput } from './billing-override';
export { PAID_MARGIN_DAYS, ivaSplit, laterIso, paidUntilFromPeriodEnd, resumable, stillLive, stripeStatusOf, subscriptionChangeOf, trialEligible } from './stripe';
export { DEFAULT_MAX_ATHLETES, clampMaxAthletes, normalizeCoachApplication, validateCoachApplication } from './coach-application';
