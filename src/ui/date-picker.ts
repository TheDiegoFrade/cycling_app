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
const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const CALENDAR_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2"></rect><line x1="3" y1="9.5" x2="21" y2="9.5"></line><line x1="8" y1="2.5" x2="8" y2="6.5"></line><line x1="16" y1="2.5" x2="16" y2="6.5"></line></svg>';

type SegKey = 'd' | 'm' | 'y';
const SEG_ORDER: SegKey[] = ['d', 'm', 'y'];
const SEG_LEN: Record<SegKey, number> = { d: 2, m: 2, y: 4 };
const SEG_MIN: Record<SegKey, number> = { d: 1, m: 1, y: 1 };
const SEG_MAX: Record<SegKey, number> = { d: 31, m: 12, y: 9999 };
const SEG_PLACEHOLDER: Record<SegKey, string> = { d: 'dd', m: 'mm', y: 'aaaa' };

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

function toIso(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

function parseIso(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Campo de fecha segmentado (día/mes/año, cada uno tecleable y con flechas
 * arriba/abajo) + botón de calendario que abre un popup con grid de mes —
 * inspirado en el patrón de wa-date-input (webawesome.com), con los colores
 * de Torq. Reemplaza el picker nativo de un <input type="date">, que varía
 * mucho entre navegador/SO y en algunos no deja escribir un año lejano
 * directo. El input original se mantiene oculto como fuente de verdad: le
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

  const field = document.createElement('div');
  field.className = 'date-field';
  wrapper.insertBefore(field, input);

  const segEls: Record<SegKey, HTMLSpanElement> = {} as Record<SegKey, HTMLSpanElement>;
  const values: Record<SegKey, number | null> = { d: null, m: null, y: null };
  let buffer = '';
  let bufferSeg: SegKey | null = null;

  const initial = parseIso(input.value);
  if (initial) {
    values.d = initial.d;
    values.m = initial.m;
    values.y = initial.y;
  }

  SEG_ORDER.forEach((key, i) => {
    const seg = document.createElement('span');
    seg.className = 'date-seg';
    seg.tabIndex = 0;
    seg.setAttribute('role', 'spinbutton');
    seg.setAttribute('aria-label', key === 'd' ? 'Día' : key === 'm' ? 'Mes' : 'Año');
    seg.dataset.seg = key;
    field.appendChild(seg);
    segEls[key] = seg;
    if (i < SEG_ORDER.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'date-sep';
      sep.textContent = '/';
      field.appendChild(sep);
    }
  });

  const calBtn = document.createElement('button');
  calBtn.type = 'button';
  calBtn.className = 'date-field-cal-btn';
  calBtn.setAttribute('aria-label', 'Abrir calendario');
  calBtn.innerHTML = CALENDAR_ICON;
  field.appendChild(calBtn);

  function renderSegs(): void {
    SEG_ORDER.forEach((key) => {
      const v = values[key];
      const showBuffer = bufferSeg === key && buffer.length > 0;
      segEls[key].textContent = showBuffer ? buffer : v !== null ? pad(v, SEG_LEN[key]) : SEG_PLACEHOLDER[key];
      segEls[key].classList.toggle('empty', v === null && !showBuffer);
    });
  }

  function commit(): void {
    const { d, m, y } = values;
    if (d !== null && m !== null && y !== null && y >= 1000) {
      const safeD = Math.min(d, daysInMonth(y, m));
      input.value = toIso(y, m, safeD);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function focusSeg(key: SegKey): void {
    segEls[key].focus();
  }

  function resetBuffer(): void {
    buffer = '';
    bufferSeg = null;
  }

  function onSegFocus(): void {
    resetBuffer();
    renderSegs();
  }

  function onSegKeydown(key: SegKey, e: KeyboardEvent): void {
    const idx = SEG_ORDER.indexOf(key);
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      if (bufferSeg !== key) {
        buffer = '';
        bufferSeg = key;
      }
      buffer += e.key;
      const n = Number(buffer);
      // auto-avanza cuando ya no cabe un segundo dígito válido (p.ej. día "4" no puede
      // seguir siendo "4x" porque 40+ no existe) o al llegar al largo máximo del segmento.
      const maxFirstDigit = key === 'y' ? 9 : Math.floor(SEG_MAX[key] / 10);
      const mustAdvance = buffer.length >= SEG_LEN[key] || (buffer.length === 1 && n > maxFirstDigit);
      if (mustAdvance) {
        values[key] = clamp(n, SEG_MIN[key], SEG_MAX[key]);
        resetBuffer();
        commit();
        const next = SEG_ORDER[idx + 1];
        if (next) focusSeg(next);
      } else {
        values[key] = n;
      }
      renderSegs();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      resetBuffer();
      const base = values[key] ?? (key === 'y' ? new Date().getFullYear() : SEG_MIN[key] - 1);
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      values[key] = clamp(base + delta, SEG_MIN[key], SEG_MAX[key]);
      commit();
      renderSegs();
      return;
    }
    if (e.key === 'ArrowLeft') {
      const prev = SEG_ORDER[idx - 1];
      if (prev) {
        e.preventDefault();
        focusSeg(prev);
      }
      return;
    }
    if (e.key === 'ArrowRight') {
      const next = SEG_ORDER[idx + 1];
      if (next) {
        e.preventDefault();
        focusSeg(next);
      }
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      resetBuffer();
      values[key] = null;
      commit();
      renderSegs();
      if (e.key === 'Backspace') {
        const prev = SEG_ORDER[idx - 1];
        if (prev) focusSeg(prev);
      }
    }
  }

  SEG_ORDER.forEach((key) => {
    const seg = segEls[key];
    seg.addEventListener('focus', onSegFocus);
    seg.addEventListener('keydown', (e) => onSegKeydown(key, e));
  });

  let popup: HTMLElement | null = null;
  let viewY = 0;
  let viewM = 0;

  function onOutside(e: MouseEvent): void {
    if (popup && !popup.contains(e.target as Node) && e.target !== calBtn) closePopup();
  }

  function closePopup(): void {
    popup?.remove();
    popup = null;
    document.removeEventListener('mousedown', onOutside, true);
  }

  function pick(y: number, m: number, d: number): void {
    values.y = y;
    values.m = m;
    values.d = d;
    renderSegs();
    commit();
    closePopup();
  }

  function renderPopup(): void {
    if (!popup) return;
    const firstWeekday = (new Date(viewY, viewM - 1, 1).getDay() + 6) % 7; // lunes=0
    const total = daysInMonth(viewY, viewM);
    const cells: string[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push('<span class="date-picker-cell empty"></span>');
    for (let d = 1; d <= total; d++) {
      const isSel = values.y === viewY && values.m === viewM && values.d === d;
      cells.push(`<button type="button" class="date-picker-cell${isSel ? ' selected' : ''}" data-day="${d}">${d}</button>`);
    }
    popup.innerHTML = `
      <div class="date-picker-head">
        <button type="button" class="date-picker-nav" data-nav="-1" aria-label="Mes anterior">‹</button>
        <span>${MONTH_LABELS[viewM - 1]} ${viewY}</span>
        <button type="button" class="date-picker-nav" data-nav="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="date-picker-weekdays">${WEEKDAY_LABELS.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="date-picker-grid">${cells.join('')}</div>
      <button type="button" class="date-picker-today">Hoy</button>
    `;
    popup.querySelector('[data-nav="-1"]')?.addEventListener('click', () => {
      viewM--;
      if (viewM < 1) {
        viewM = 12;
        viewY--;
      }
      renderPopup();
    });
    popup.querySelector('[data-nav="1"]')?.addEventListener('click', () => {
      viewM++;
      if (viewM > 12) {
        viewM = 1;
        viewY++;
      }
      renderPopup();
    });
    popup.querySelectorAll<HTMLButtonElement>('[data-day]').forEach((btn) => {
      btn.addEventListener('click', () => pick(viewY, viewM, Number(btn.dataset.day)));
    });
    popup.querySelector('.date-picker-today')?.addEventListener('click', () => {
      const now = new Date();
      pick(now.getFullYear(), now.getMonth() + 1, now.getDate());
    });
  }

  function openPopup(): void {
    if (popup) {
      closePopup();
      return;
    }
    const now = new Date();
    viewY = values.y ?? now.getFullYear();
    viewM = values.m ?? now.getMonth() + 1;
    popup = document.createElement('div');
    popup.className = 'date-picker-popup';
    wrapper.appendChild(popup);
    renderPopup();
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
  }

  calBtn.addEventListener('click', openPopup);

  renderSegs();
}
