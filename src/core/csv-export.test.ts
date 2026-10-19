import { describe, expect, it } from 'vitest';
import { PLAN_HEADERS, SESSION_HEADERS, csvFileName, planCsv, sessionsCsv, toCsv } from './csv-export';
import type { CsvSession } from './csv-export';

const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

describe('toCsv', () => {
  it('BOM, comas, comillas y saltos de línea escapados', () => {
    const csv = toCsv(['a', 'b'], [['hola, "tú"', 'dos\nlíneas']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines(csv)[1]).toBe('"hola, ""tú""","dos\nlíneas"');
  });

  it('una nota que parece fórmula de Excel no se ejecuta', () => {
    expect(lines(toCsv(['n'], [['=HYPERLINK("x")'], ['+1'], ['-tired'], ['@a']])).slice(1)).toEqual([`"'=HYPERLINK(""x"")"`, "'+1", "'-tired", "'@a"]);
  });

  it('números redondeados a 2 decimales; vacíos para null', () => {
    expect(lines(toCsv(['x', 'y', 'z'], [[0.876543, null, undefined]]))[1]).toBe('0.88,,');
  });
});

const ride: CsvSession = {
  startedAt: '2026-10-15T13:05:00.000Z',
  name: 'Sweet spot 3×10',
  kind: 'Bici',
  source: 'Torq',
  durationMin: 60.4,
  avgPower: 182.4,
  normalizedPower: 196.2,
  maxPower: 310,
  avgHr: 0,
  maxHr: null,
  avgCadence: 88.6,
  intensityFactor: 0.8918,
  tss: 79.6,
  ftp: 220,
  rpe: 7,
  note: 'piernas pesadas, pero bien',
};

describe('sessionsCsv', () => {
  it('encabezados en español y una fila por sesión, la más reciente primero', () => {
    const csv = sessionsCsv([ride, { ...ride, startedAt: '2026-10-17T13:00:00.000Z', name: 'Fondo' }]);
    const [head, first, second] = lines(csv);
    expect(head).toBe(SESSION_HEADERS.join(','));
    expect(first).toContain('Fondo');
    expect(second).toContain('Sweet spot 3×10');
  });

  it('valores: redondeo, 0 de sensor como vacío, IF con decimales y nota entre comillas', () => {
    const cols = lines(sessionsCsv([ride]))[1].match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, ''));
    expect(cols.slice(2, 17)).toEqual(['Sweet spot 3×10', 'Bici', 'Torq', '60', '182', '196', '310', '', '', '89', '0.89', '80', '220', '7', '"piernas pesadas, pero bien"']);
  });
});

describe('planCsv', () => {
  it('ordenado por fecha, con día de la semana y Sí/No', () => {
    const csv = planCsv([
      { date: '2026-10-18', name: 'Fondo 3 h', kind: 'Rodillo', zone: 'fondo', minutes: 180, tss: 150.4, done: false, description: null },
      { date: '2026-10-16', name: 'Fuerza tren inferior', kind: 'Fuerza', zone: null, minutes: null, tss: null, done: true, description: 'Sentadilla 4×8' },
    ]);
    const [head, a, b] = lines(csv);
    expect(head).toBe(PLAN_HEADERS.join(','));
    expect(a).toBe('2026-10-16,viernes,Fuerza tren inferior,Fuerza,,,,Sí,Sentadilla 4×8');
    expect(b).toBe('2026-10-18,domingo,Fondo 3 h,Rodillo,fondo,180,150,No,');
  });

  it('nombre de archivo con la fecha', () => {
    expect(csvFileName('plan', '2026-10-19')).toBe('torq-plan-2026-10-19.csv');
    expect(csvFileName('sesiones', '2026-10-19', 'Andrea Guerrero Guzmán')).toBe('torq-andrea-guerrero-guzman-sesiones-2026-10-19.csv');
    expect(csvFileName('plan', '2026-10-19', '  ')).toBe('torq-plan-2026-10-19.csv');
  });
});
