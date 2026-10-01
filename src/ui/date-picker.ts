const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_LABELS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseIso(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

const YEAR_RANGE_BACK = 30;
const YEAR_RANGE_FORWARD = 3;

function fmtDisplay(value: string): string {
  const p = parseIso(value);
  if (!p) return 'Elegir fecha';
  return `${p.d} ${MONTH_LABELS[p.m].slice(0, 3)} ${p.y}`;
}

/** Reemplaza el picker nativo de un <input type="date"> — cuyo aspecto y
 * atajos de teclado varían mucho entre navegador/SO — por un calendario
 * propio en un popup, manteniendo el input oculto como fuente de verdad: le
 * sigue cambiando `.value` y disparando `change`, así que cualquier listener
 * ya existente sobre ese input sigue funcionando sin tocarlo. */
export function wireDatePicker(input: HTMLInputElement): void {
  if (input.dataset.datePickerWired) return;
  input.dataset.datePickerWired = '1';
  input.classList.add('date-picker-hidden-input');

  const wrapper = document.createElement('div');
  wrapper.className = 'date-picker';
  input.parentElement!.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'date-picker-trigger';
  trigger.textContent = fmtDisplay(input.value);
  wrapper.insertBefore(trigger, input);

  let popup: HTMLElement | null = null;
  let viewY = 0;
  let viewM = 0;

  function onOutside(e: MouseEvent): void {
    if (popup && !popup.contains(e.target as Node) && e.target !== trigger) closePopup();
  }

  function closePopup(): void {
    popup?.remove();
    popup = null;
    document.removeEventListener('mousedown', onOutside, true);
  }

  function pick(y: number, m: number, d: number): void {
    input.value = toIso(y, m, d);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    trigger.textContent = fmtDisplay(input.value);
    closePopup();
  }

  function renderPopup(): void {
    if (!popup) return;
    const selected = parseIso(input.value);
    const firstWeekday = (new Date(viewY, viewM, 1).getDay() + 6) % 7; // lunes=0
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const cells: string[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push('<span class="date-picker-cell empty"></span>');
    for (let d = 1; d <= daysInMonth; d++) {
      const isSel = !!selected && selected.y === viewY && selected.m === viewM && selected.d === d;
      cells.push(`<button type="button" class="date-picker-cell${isSel ? ' selected' : ''}" data-day="${d}">${d}</button>`);
    }
    const yearOptions = Array.from({ length: YEAR_RANGE_BACK + YEAR_RANGE_FORWARD + 1 }, (_, i) => viewY - YEAR_RANGE_BACK + i)
      .map((y) => `<option value="${y}" ${y === viewY ? 'selected' : ''}>${y}</option>`)
      .join('');
    popup.innerHTML = `
      <div class="date-picker-head">
        <button type="button" class="date-picker-nav" data-nav="-1" aria-label="Mes anterior">‹</button>
        <span>${MONTH_LABELS[viewM]}</span>
        <select class="date-picker-year-select" aria-label="Año">${yearOptions}</select>
        <button type="button" class="date-picker-nav" data-nav="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="date-picker-weekdays">${WEEKDAY_LABELS.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="date-picker-grid">${cells.join('')}</div>
      <button type="button" class="date-picker-today">Hoy</button>
    `;
    popup.querySelector('[data-nav="-1"]')?.addEventListener('click', () => {
      viewM--;
      if (viewM < 0) {
        viewM = 11;
        viewY--;
      }
      renderPopup();
    });
    popup.querySelector('[data-nav="1"]')?.addEventListener('click', () => {
      viewM++;
      if (viewM > 11) {
        viewM = 0;
        viewY++;
      }
      renderPopup();
    });
    popup.querySelector<HTMLSelectElement>('.date-picker-year-select')?.addEventListener('change', (e) => {
      viewY = Number((e.target as HTMLSelectElement).value);
      renderPopup();
    });
    popup.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((btn) => {
      btn.addEventListener('click', () => pick(viewY, viewM, Number(btn.dataset.day)));
    });
    popup.querySelector('.date-picker-today')?.addEventListener('click', () => {
      const now = new Date();
      pick(now.getFullYear(), now.getMonth(), now.getDate());
    });
  }

  function openPopup(): void {
    if (popup) {
      closePopup();
      return;
    }
    const now = new Date();
    const parsed = parseIso(input.value) ?? { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
    viewY = parsed.y;
    viewM = parsed.m;
    popup = document.createElement('div');
    popup.className = 'date-picker-popup';
    wrapper.appendChild(popup);
    renderPopup();
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
  }

  trigger.addEventListener('click', openPopup);
}
