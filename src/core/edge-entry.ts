// Lo de src/core que usan las Edge Functions (Deno no resuelve los imports sin
// extensión de src/). `npm run build:edge` lo empaqueta en
// supabase/functions/_shared/core.gen.js; core.gen.test.ts revisa que esté al día.
export { addDays, buildMonthlyReport, defaultReviewMonth, monthEnd, monthStart, reviewAiContext, shiftMonth } from './monthly-report';
export { emailKpis } from './monthly-report-email';
export { mondayOfWeek } from '../engine/streaks';
export { localDateKey } from './day-key';
export { startPhase } from './self-report-start';
