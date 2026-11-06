// Clientes especiales (solo administradores): a quién no se le cobra (gratis,
// para siempre o por unos meses) y a quién se le cobra con descuento. Lo
// guarda la función billing en billing_overrides y lo lleva a Stripe (cupón o
// cancelar su suscripción si pasa a gratis). Ver docs/cobro-stripe.md,
// «Clientes especiales».
import { overrideLabel } from '../../core/billing-override';
import type { OverrideRow } from '../../core/billing-override';
import { listOverrides, removeOverride, setOverride } from '../../sync/billing';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

const ERRORS: Record<string, string> = {
  user_not_found: 'No hay ninguna cuenta con ese correo. Invítala primero (Lista de espera) y vuelve a intentarlo.',
  'correo inválido': 'Revisa el correo.',
  'descuento entre 1 y 99 %': 'El descuento va de 1 a 99 %.',
};

export function renderAdminClients(container: HTMLElement): void {
  if (!appState.billing?.isAdmin) {
    container.innerHTML = '<div class="screen"><h1>Clientes especiales</h1><p class="hint">Esta sección es solo para administradores.</p></div>';
    return;
  }
  let rows: OverrideRow[] = [];
  load();

  function load(message = ''): void {
    container.innerHTML = '<div class="screen admin-screen"><h1>Clientes especiales</h1><p class="hint">Cargando…</p></div>';
    void listOverrides().then((res) => {
      if (!container.isConnected) return;
      if (res.error || !res.data) {
        container.querySelector('.hint')!.textContent = 'No se pudo cargar la lista. Intenta de nuevo en un momento.';
        return;
      }
      rows = res.data.rows;
      paint(message);
    });
  }

  function rowHtml(r: OverrideRow): string {
    const expired = r.kind === 'free' && r.until && new Date(r.until) <= new Date();
    return `<tr>
      <td>${escapeHtml(r.email)}</td>
      <td>${escapeHtml(overrideLabel(r))}${r.kind === 'free' && r.until ? ` <span class="hint">(${expired ? 'venció' : 'hasta'} el ${fmt(r.until)})</span>` : ''}</td>
      <td>${escapeHtml(r.note ?? '—')}</td>
      <td>${fmt(r.created_at)}</td>
      <td><button class="btn-light" data-remove="${escapeHtml(r.user_id)}">Quitar</button></td>
    </tr>`;
  }

  function paint(message: string): void {
    container.innerHTML = `
      <div class="screen admin-screen">
        <h1>Clientes especiales</h1>
        <p class="hint">Personas a las que no se les cobra o se les cobra con descuento. La cuenta tiene que existir (por su correo).</p>
        <form class="panel" id="client-form">
          <div class="row-actions">
            <input type="email" name="email" placeholder="correo@ejemplo.com" required autocomplete="off" size="28">
            <select name="kind" id="client-kind">
              <option value="free">Gratis</option>
              <option value="discount">Descuento</option>
            </select>
            <label id="client-percent" hidden><input type="number" name="percentOff" min="1" max="99" step="1" size="4" placeholder="50"> % </label>
            <label>por <input type="number" name="months" min="1" max="36" step="1" size="4" placeholder="siempre"> meses</label>
          </div>
          <div class="row-actions">
            <input type="text" name="note" placeholder="Nota (opcional): por qué" maxlength="200" size="40">
            <button class="primary" type="submit" id="client-save">Guardar</button>
          </div>
          <p class="hint">Gratis: tiene Torq Coach IA sin pagar y, si ya pagaba, su suscripción se cancela al final del periodo. Descuento: se aplica en su siguiente cobro (o al suscribirse). Meses vacío = para siempre.</p>
        </form>
        <p class="hint" id="client-status" aria-live="polite">${escapeHtml(message)}</p>
        ${
          rows.length
            ? `<div class="panel" style="overflow-x:auto"><table class="legal-table admin-table">
                <thead><tr><th>Correo</th><th>Qué tiene</th><th>Nota</th><th>Desde</th><th></th></tr></thead>
                <tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`
            : '<p class="hint">Todavía no hay clientes especiales.</p>'
        }
      </div>`;
    const form = container.querySelector<HTMLFormElement>('#client-form')!;
    const kind = form.querySelector<HTMLSelectElement>('#client-kind')!;
    const percent = form.querySelector<HTMLElement>('#client-percent')!;
    const status = container.querySelector<HTMLElement>('#client-status')!;
    kind.addEventListener('change', () => (percent.hidden = kind.value !== 'discount'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const save = form.querySelector<HTMLButtonElement>('#client-save')!;
      save.disabled = true;
      status.textContent = 'Guardando…';
      const email = String(f.get('email') ?? '');
      const res = await setOverride({
        email,
        kind: kind.value === 'discount' ? 'discount' : 'free',
        percentOff: kind.value === 'discount' ? Number(f.get('percentOff')) || null : null,
        months: Number(f.get('months')) || null,
        note: String(f.get('note') ?? '') || null,
      });
      if (res.error) {
        save.disabled = false;
        status.textContent = ERRORS[res.error] ?? (res.error.startsWith('meses') ? 'Los meses van de 1 a 36.' : 'No se pudo guardar. Intenta de nuevo.');
        return;
      }
      load(`Listo: ${email.trim().toLowerCase()} guardado.`);
    });
    container.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.dataset.confirm !== '1') {
          btn.dataset.confirm = '1';
          btn.textContent = 'Sí, quitar';
          return;
        }
        btn.disabled = true;
        const res = await removeOverride(btn.dataset.remove!);
        if (res.error) {
          btn.disabled = false;
          status.textContent = 'No se pudo quitar. Intenta de nuevo.';
          return;
        }
        load('Quitado: desde su siguiente cobro paga el precio normal (si era gratis, tendrá que suscribirse).');
      });
    });
  }
}
