// Torq Coach IA: precio, suscripción con Mercado Pago y su estado. El precio
// se ve ANTES del cuestionario (nunca después del esfuerzo). Los coaches y
// sus atletas no pagan; a un atleta con coach nunca se le ofrece esto.
import { FOUNDER_PRICE_MXN, PRICE_MXN } from '../core/access';
import { cancelSubscription, startSubscription } from '../sync/billing';
import type { BillingStatus } from '../sync/billing';
import { refresh } from './router';
import { appState } from './state';
import { escapeHtml } from './workout-cover';

/** ¿Tiene la IA? Si no se sabe (sin internet), se deja intentar: el
 * servidor decide de todos modos. */
export function hasAi(): boolean {
  return appState.billing ? appState.billing.ai : true;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

function priceHtml(b: BillingStatus | null): string {
  const price = b?.priceMxn ?? PRICE_MXN;
  return price === FOUNDER_PRICE_MXN
    ? `<span class="pricing-price">$${FOUNDER_PRICE_MXN}</span> al mes <span class="pricing-founder">Precio de fundador · normal $${PRICE_MXN}</span>`
    : `<span class="pricing-price">$${price}</span> al mes`;
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
      <button class="primary" data-subscribe ${ready ? '' : 'disabled'}>Suscribirme con Mercado Pago</button>
      <p class="hint pricing-fine">Mes con mes. IVA incluido. Cancela cuando quieras desde Perfil.${ready ? '' : ' <strong>El cobro todavía no está activo (modo de prueba).</strong>'}</p>
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
      if (status) status.textContent = 'Abriendo Mercado Pago…';
      const res = await startSubscription();
      if ('initPoint' in res) {
        location.assign(res.initPoint);
        return;
      }
      btn.disabled = false;
      if (status)
        status.textContent =
          res.error === 'not_needed'
            ? 'Ya tienes Torq Coach IA.'
            : res.error === 'billing_not_ready'
              ? 'El cobro todavía no está activo. Pronto podrás suscribirte.'
              : 'No se pudo abrir Mercado Pago. Intenta de nuevo en un momento.';
    });
  });
}

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
  if (b.reason === 'comp') body = '<p>Cuenta de cortesía: tienes Torq Coach IA sin costo.</p>';
  else if (b.reason === 'coach') body = '<p>Como coach, usas Torq gratis con tus atletas.</p>';
  else if (b.reason === 'coached') body = `<p>Torq va incluido por tu coach${coachName ? ` <strong>${escapeHtml(coachName)}</strong>` : ''}.</p>`;
  else if (b.reason === 'grace')
    body = `<p><strong>No pudimos cobrar tu mes.</strong> Actualiza tu tarjeta en Mercado Pago${s?.grace_until ? ` antes del ${fmtDate(s.grace_until)}` : ''} para no perder el coach IA. Tus datos no se borran.</p>
      <div class="row-actions"><a class="btn-light" href="https://www.mercadopago.com.mx/subscriptions" target="_blank" rel="noopener">Ir a Mercado Pago</a></div>`;
  else if (b.reason === 'subscription' && s?.status === 'cancelled')
    body = `<p>Cancelaste tu suscripción. Tienes el coach IA${s.paid_until ? ` hasta el ${fmtDate(s.paid_until)}` : ''}.</p>
      <div class="row-actions"><button class="btn-light" data-subscribe>Volver a suscribirme · $${s.price_mxn} al mes</button></div><p class="hint" data-subscribe-status aria-live="polite"></p>`;
  else if (b.reason === 'subscription' && s)
    body = `<p>Torq Coach IA · <strong>$${s.price_mxn} al mes</strong>${s.price_mxn === FOUNDER_PRICE_MXN ? ' (precio de fundador)' : ''}${s.paid_until ? ` · pagado hasta el ${fmtDate(s.paid_until)}` : ''}.</p>
      <div class="row-actions"><button class="btn-light" id="subscription-cancel">Cancelar suscripción</button></div>
      <p class="hint" id="subscription-cancel-status" aria-live="polite"></p>`;
  else return `<div data-pricing-host>${pricingPanelHtml(b)}</div>`;
  return `<div class="panel perfil-panel" data-pricing><h2 class="perfil-h2">Tu plan</h2>${body}</div>`;
}

export function wireSubscriptionPanel(root: ParentNode): void {
  wirePricing(root);
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

/** Al volver de Mercado Pago (`?billing=return`): Mercado Pago avisa al
 * servidor por su cuenta (webhook), así que se pregunta unas veces hasta que
 * el acceso aparezca. */
export function maybeConfirmBillingReturn(): void {
  const params = new URLSearchParams(location.search);
  if (params.get('billing') !== 'return') return;
  history.replaceState(null, '', location.pathname + location.hash);
  const el = toast('Estamos confirmando tu pago con Mercado Pago…');
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
      el.textContent = 'Todavía no nos llega la confirmación de Mercado Pago. Puede tardar unos minutos; revisa Perfil más tarde.';
      setTimeout(() => el.remove(), 8000);
      return;
    }
    setTimeout(tick, 3000);
  };
  void tick();
}
