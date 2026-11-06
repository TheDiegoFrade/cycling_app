// Torq Coach IA: precio, suscripción (cobro con Stripe) y su estado. El precio
// se ve ANTES del cuestionario (nunca después del esfuerzo). Los coaches y
// sus atletas no pagan; a un atleta con coach nunca se le ofrece esto.
import { PRICE_MXN } from '../core/access';
import { fmtMxn } from '../core/billing-override';
import { cancelSubscription, openBillingPortal, startSubscription } from '../sync/billing';
import type { BillingStatus, SubscribeError } from '../sync/billing';
import { refresh } from './router';
import { appState } from './state';
import { escapeHtml } from './workout-cover';

/** ¿Tiene la IA? Si no se sabe (sin internet), se deja intentar: el
 * servidor decide de todos modos. */
export function hasAi(): boolean {
  return appState.billing ? appState.billing.ai : true;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

const span = (months: number | null | undefined) => (months ? `por ${months} ${months === 1 ? 'mes' : 'meses'}` : '');

function priceHtml(b: BillingStatus | null): string {
  const trial = b?.trialDays ? ` <span class="pricing-trial">${b.trialDays} días de prueba</span>` : '';
  const discount = b?.discountPercent ? ` <span class="pricing-trial pricing-discount">${b.discountPercent} % de descuento${b.discountMonths ? ` ${span(b.discountMonths)}` : ''}</span>` : '';
  return `<span class="pricing-price">${fmtMxn(b?.priceMxn ?? PRICE_MXN)}</span> al mes${discount}${trial}`;
}

function fineHtml(b: BillingStatus | null): string {
  const base = b?.trialDays
    ? `Mes con mes. IVA incluido. Pones tu tarjeta al empezar y el primer cobro es al terminar los ${b.trialDays} días de prueba. Cancela cuando quieras desde Perfil.`
    : 'Mes con mes. IVA incluido. Cancela cuando quieras desde Perfil.';
  // Descuento por unos meses: decir cuánto se paga después.
  return b?.discountMonths && b.listPriceMxn ? `${base} Después de ${b.discountMonths === 1 ? 'ese mes' : `esos ${b.discountMonths} meses`}, ${fmtMxn(b.listPriceMxn)} al mes.` : base;
}

export function pricingPanelHtml(b: BillingStatus | null = appState.billing): string {
  const ready = b?.billingReady !== false;
  return `
    <div class="panel pricing-card" data-pricing>
      <span class="pricing-kicker">Torq Coach IA</span>
      <h2 class="pricing-title">Tu rodillo y tu coach en una sola app</h2>
      <p class="pricing-amount">${priceHtml(b)}</p>
      <ul class="pricing-list">
        <li>Desarrollado con coaches de ciclismo: tu plan se arma con tus datos</li>
        <li>Se ajusta cada semana a lo que de verdad rodaste</li>
        <li>Piñón te acompaña todos los días y comenta cada sesión</li>
      </ul>
      <button class="primary" data-subscribe ${ready ? '' : 'disabled'}>Suscribirme</button>
      <p class="hint pricing-fine">${fineHtml(b)}${ready ? '' : ' <strong>El cobro todavía no está activo (modo de prueba).</strong>'}</p>
      <p class="hint pricing-fine">¿Tu coach usa Torq? Pídele tu invitación: con coach, Torq va incluido.</p>
      <p class="hint" data-subscribe-status aria-live="polite"></p>
    </div>`;
}

/** Cablea los botones «Suscribirme» que haya dentro de `root`. */
export function wirePricing(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('[data-subscribe]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const status = btn.closest('[data-pricing]')?.querySelector<HTMLElement>('[data-subscribe-status]');
      btn.disabled = true;
      if (status) status.textContent = 'Abriendo el pago…';
      const res = await startSubscription();
      if ('initPoint' in res) {
        location.assign(res.initPoint);
        return;
      }
      btn.disabled = res.error === 'blocked';
      if (status) status.textContent = SUBSCRIBE_ERRORS[res.error];
    });
  });
}

const SUBSCRIBE_ERRORS: Record<SubscribeError, string> = {
  not_needed: 'Ya tienes Torq Coach IA.',
  billing_not_ready: 'El cobro todavía no está activo. Pronto podrás suscribirte.',
  too_many_attempts: 'Lo intentaste muchas veces seguidas. Espera una hora y vuelve a intentarlo.',
  blocked: 'No podemos procesar una suscripción en esta cuenta. Escríbenos para revisarlo.',
  failed: 'No se pudo abrir el pago. Intenta de nuevo en un momento.',
};

export function openPricingModal(): void {
  if (document.getElementById('pricing-backdrop')) return;
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="modal-backdrop" id="pricing-backdrop"><div class="pricing-modal" role="dialog" aria-label="Torq Coach IA">
      <button class="plan-create-close pricing-close" id="pricing-close" aria-label="Cerrar">✕</button>
      ${pricingPanelHtml()}
    </div></div>`,
  );
  const backdrop = document.getElementById('pricing-backdrop')!;
  backdrop.querySelector('#pricing-close')?.addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  wirePricing(backdrop);
}

/** «Tu plan» en Perfil: qué tiene y qué puede hacer. */
export function subscriptionPanelHtml(b: BillingStatus | null = appState.billing): string {
  if (!b) return '';
  const coachName = appState.coach.myCoach?.coachName;
  const s = b.subscription;
  let body: string;
  if (b.reason === 'comp') body = `<p>Cuenta de cortesía: tienes Torq Coach IA sin costo${b.compUntil ? ` hasta el ${fmtDate(b.compUntil)}` : ''}.</p>`;
  else if (b.reason === 'coach') body = '<p>Como coach, usas Torq gratis con tus atletas.</p>';
  else if (b.reason === 'coached') body = `<p>Torq va incluido por tu coach${coachName ? ` <strong>${escapeHtml(coachName)}</strong>` : ''}.</p>`;
  else if (b.reason === 'grace')
    body = `<p><strong>No pudimos cobrar tu mes.</strong> Actualiza tu tarjeta${s?.grace_until ? ` antes del ${fmtDate(s.grace_until)}` : ''} para no perder el coach IA. Tus datos no se borran.</p>
      <div class="row-actions"><button class="btn-light" id="billing-portal">Actualizar tarjeta</button></div>
      <p class="hint" id="billing-portal-status" aria-live="polite"></p>`;
  else if (b.reason === 'subscription' && s?.status === 'cancelled')
    body = `<p>Cancelaste tu suscripción. Tienes el coach IA${s.paid_until ? ` hasta el ${fmtDate(s.paid_until)}` : ''}.</p>
      <div class="row-actions"><button class="btn-light" data-subscribe>Volver a suscribirme · ${fmtMxn(s.price_mxn)} al mes</button></div><p class="hint" data-subscribe-status aria-live="polite"></p>`;
  else if (b.reason === 'subscription' && s)
    body = `<p>Torq Coach IA · <strong>${fmtMxn(s.price_mxn)} al mes</strong>${s.paid_until ? ` · pagado hasta el ${fmtDate(s.paid_until)}` : ''}.</p>
      <div class="row-actions"><button class="btn-light" id="subscription-cancel">Cancelar suscripción</button></div>
      <p class="hint" id="subscription-cancel-status" aria-live="polite"></p>`;
  else return `<div data-pricing-host>${pricingPanelHtml(b)}</div>`;
  return `<div class="panel perfil-panel" data-pricing><h2 class="perfil-h2">Tu plan</h2>${body}</div>`;
}

export function wireSubscriptionPanel(root: ParentNode): void {
  wirePricing(root);
  const portal = root.querySelector<HTMLButtonElement>('#billing-portal');
  portal?.addEventListener('click', async () => {
    const status = root.querySelector<HTMLElement>('#billing-portal-status');
    portal.disabled = true;
    if (status) status.textContent = 'Abriendo…';
    const res = await openBillingPortal();
    if ('url' in res) {
      location.assign(res.url);
      return;
    }
    portal.disabled = false;
    if (status) status.textContent = res.error === 'too_many_attempts' ? SUBSCRIBE_ERRORS.too_many_attempts : 'No se pudo abrir. Intenta de nuevo en un momento.';
  });
  const cancel = root.querySelector<HTMLButtonElement>('#subscription-cancel');
  cancel?.addEventListener('click', async () => {
    const status = root.querySelector<HTMLElement>('#subscription-cancel-status');
    if (cancel.dataset.confirm !== '1') {
      cancel.dataset.confirm = '1';
      cancel.textContent = 'Sí, cancelar';
      if (status) status.textContent = 'Conservas el coach IA hasta el fin del periodo que ya pagaste.';
      return;
    }
    cancel.disabled = true;
    if (status) status.textContent = 'Cancelando…';
    const ok = await cancelSubscription();
    if (!ok) {
      cancel.disabled = false;
      if (status) status.textContent = 'No se pudo cancelar. Intenta de nuevo en un momento.';
      return;
    }
    await appState.refreshBilling();
    refresh();
  });
}

function toast(text: string): HTMLElement {
  document.querySelector('.billing-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'billing-toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

/** Al volver del pago (`?billing=return`): Stripe avisa al servidor por su
 * cuenta (webhook), así que se pregunta unas veces hasta que el acceso
 * aparezca. */
export function maybeConfirmBillingReturn(): void {
  const params = new URLSearchParams(location.search);
  if (params.get('billing') !== 'return') return;
  history.replaceState(null, '', location.pathname + location.hash);
  const el = toast('Estamos confirmando tu pago…');
  let tries = 0;
  const tick = async () => {
    tries++;
    const b = await appState.refreshBilling();
    if (b?.ai) {
      el.textContent = 'Listo: ya tienes Torq Coach IA.';
      setTimeout(() => el.remove(), 4000);
      refresh();
      return;
    }
    if (tries >= 10) {
      el.textContent = 'Todavía no nos llega la confirmación del pago. Puede tardar unos minutos; revisa Perfil más tarde.';
      setTimeout(() => el.remove(), 8000);
      return;
    }
    setTimeout(tick, 3000);
  };
  void tick();
}
