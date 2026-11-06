// Ventas del mes (solo administradores): los cobros que van en la factura
// global mensual, con totales, CSV y dónde guardar el UUID del CFDI ya
// timbrado. Ver docs/cobro-stripe.md, fase 5.
import { mxDateTime, previousMonthKey, salesCsv, salesSummary, satPaymentForm } from '../../core/sales';
import type { SaleRow } from '../../core/sales';
import { fetchSales, setSalesCfdi } from '../../sync/billing';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';

const money = (cents: number) => (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const FUNDING: Record<string, string> = { credit: 'Crédito', debit: 'Débito', prepaid: 'Prepago' };

export function renderAdminSales(container: HTMLElement): void {
  if (!appState.billing?.isAdmin) {
    container.innerHTML = '<div class="screen"><h1>Ventas del mes</h1><p class="hint">Esta sección es solo para administradores.</p></div>';
    return;
  }
  let month = previousMonthKey(new Date());
  let rows: SaleRow[] = [];
  load();

  function load(): void {
    container.innerHTML = `<div class="screen admin-screen"><h1>Ventas del mes</h1><p class="hint">Cargando…</p></div>`;
    void fetchSales(month).then((res) => {
      if (!container.isConnected) return;
      if (res.error || !res.data) {
        container.querySelector('.hint')!.textContent = 'No se pudieron cargar las ventas. Intenta de nuevo en un momento.';
        return;
      }
      rows = res.data.rows;
      paint();
    });
  }

  function paint(): void {
    const s = salesSummary(rows);
    const pending = rows.filter((r) => !r.cfdi_uuid).length;
    container.innerHTML = `
      <div class="screen admin-screen">
        <h1>Ventas del mes</h1>
        <p class="hint">Cobros pagados que van en la factura global (sin reembolsados ni facturados aparte). Fechas en hora de CDMX.</p>
        <div class="row-actions">
          <label>Mes <input type="month" id="sales-month" value="${escapeHtml(month)}"></label>
          <button class="btn-light" id="sales-csv" ${rows.length ? '' : 'disabled'}>Descargar CSV</button>
        </div>
        ${
          rows.length
            ? `<div class="panel" style="overflow-x:auto"><table class="legal-table admin-table">
                <thead><tr><th>Folio</th><th>Fecha</th><th>Total</th><th>Base</th><th>IVA</th><th>Tarjeta</th><th>CFDI</th></tr></thead>
                <tbody>${rows.map(rowHtml).join('')}</tbody>
                <tfoot><tr><th>${s.count} cobros</th><th></th><th>${money(s.total_cents)}</th><th>${money(s.base_cents)}</th><th>${money(s.iva_cents)}</th><th>${s.paymentForm ? `Forma de pago ${s.paymentForm}` : ''}</th><th></th></tr></tfoot>
              </table></div>
              ${
                pending
                  ? `<div class="panel"><p>Cuando timbres la global en el portal del SAT, guarda aquí su UUID (se pone en los ${pending} cobros sin CFDI).</p>
                      <div class="row-actions"><input type="text" id="sales-uuid" placeholder="UUID del CFDI" size="38" autocomplete="off"><button class="btn-light" id="sales-uuid-save">Guardar UUID</button></div></div>`
                  : '<p class="hint">Todos los cobros de este mes ya tienen CFDI.</p>'
              }`
            : '<p class="hint">No hay cobros en este mes.</p>'
        }
        <p class="hint" id="sales-status" aria-live="polite"></p>
      </div>`;
    container.querySelector<HTMLInputElement>('#sales-month')!.addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (/^\d{4}-\d{2}$/.test(v)) {
        month = v;
        load();
      }
    });
    container.querySelector<HTMLButtonElement>('#sales-csv')?.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([salesCsv(rows)], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `torq-ventas-${month}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const save = container.querySelector<HTMLButtonElement>('#sales-uuid-save');
    save?.addEventListener('click', async () => {
      const uuid = container.querySelector<HTMLInputElement>('#sales-uuid')!.value.trim();
      const status = container.querySelector<HTMLElement>('#sales-status')!;
      save.disabled = true;
      const res = await setSalesCfdi(month, uuid);
      if (res.error) {
        save.disabled = false;
        status.textContent = res.error === 'UUID inválido' ? 'Ese no parece un UUID (36 caracteres con guiones).' : 'No se pudo guardar. Intenta de nuevo.';
        return;
      }
      load();
    });
  }
}

function rowHtml(r: SaleRow): string {
  const form = satPaymentForm(r.card_funding);
  return `<tr>
    <td>${escapeHtml(r.stripe_charge_id ?? r.stripe_invoice_id)}</td>
    <td>${escapeHtml(mxDateTime(r.paid_at))}</td>
    <td>${money(r.total_cents)}</td>
    <td>${money(r.base_cents)}</td>
    <td>${money(r.iva_cents)}</td>
    <td>${escapeHtml(FUNDING[r.card_funding ?? ''] ?? '—')}${form ? ` (${form})` : ''}</td>
    <td>${r.cfdi_uuid ? escapeHtml(r.cfdi_uuid.slice(0, 8)) + '…' : '—'}</td>
  </tr>`;
}
