import { describe, expect, it } from 'vitest';
import { OPEN_STEP_S, parseFitWorkout } from './fit-workout-parser';

/** Arma un .fit mínimo: file_id + workout + workout_steps (little endian). */
type Field = [num: number, size: number, baseType: number, value: number | string];
function fit(fileType: number, workoutName: string, steps: Field[][]): ArrayBuffer {
  const bytes: number[] = [];
  const u16 = (v: number) => bytes.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v: number) => bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  let local = 0;
  const message = (global: number, fields: Field[]) => {
    const l = local++ & 0x0f;
    bytes.push(0x40 | l, 0, 0);
    u16(global);
    bytes.push(fields.length);
    for (const [num, size, type] of fields) bytes.push(num, size, type);
    bytes.push(l);
    for (const [, size, , value] of fields) {
      if (typeof value === 'string') {
        const enc = new TextEncoder().encode(value);
        for (let i = 0; i < size; i++) bytes.push(enc[i] ?? 0);
      } else if (size === 1) bytes.push(value & 0xff);
      else if (size === 2) u16(value);
      else u32(value);
    }
  };
  message(0, [[0, 1, 0x00, fileType]]);
  for (const s of steps) message(27, s);
  message(26, [[8, 24, 0x07, workoutName], [4, 1, 0x00, 2]]);
  const header = [14, 0x20, 0, 0];
  const size = bytes.length;
  const out = new Uint8Array(14 + size + 2);
  out.set(header, 0);
  new DataView(out.buffer).setUint32(4, size, true);
  out.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
  out.set(bytes, 14);
  return out.buffer;
}
const step = (index: number, name: string, f: Partial<Record<'dt' | 'dv' | 'tt' | 'tv' | 'lo' | 'hi' | 'int', number>>): Field[] => [
  [254, 2, 0x84, index],
  [0, 16, 0x07, name],
  [1, 1, 0x00, f.dt ?? 0],
  [2, 4, 0x86, f.dv ?? 0xffffffff],
  [3, 1, 0x00, f.tt ?? 2],
  [4, 4, 0x86, f.tv ?? 0],
  [5, 4, 0x86, f.lo ?? 0],
  [6, 4, 0x86, f.hi ?? 0],
  [7, 1, 0x00, f.int ?? 0],
];
const opts = { ftp: 250, hrMax: 185 };

describe('parseFitWorkout', () => {
  it('por pulso: bloques libres con su rango de pulso; paso abierto de 5 min', () => {
    const r = parseFitWorkout(
      fit(5, 'Endurance Sesión 1', [
        step(0, 'Recuperación', { dt: 0, dv: 300000, tt: 1, lo: 201, hi: 206, int: 1 }),
        step(1, 'Activo', { dt: 0, dv: 3300000, tt: 1, lo: 210, hi: 228 }),
        step(2, '', { dt: 5, tt: 2, int: 3 }),
      ]),
      opts,
    );
    expect(r.errors).toEqual([]);
    expect(r.name).toBe('Endurance Sesión 1');
    expect(r.allFree).toBe(true);
    expect(r.intervals.map((i) => [i.name, i.type, i.duration_s, i.hr_min, i.hr_ceiling])).toEqual([
      ['Recuperación', 'free', 300, 101, 106],
      ['Activo', 'free', 3300, 110, 128],
      ['Enfriamiento', 'free', OPEN_STEP_S, undefined, undefined],
    ]);
    expect(r.warnings.join()).toMatch(/abierto/);
  });

  it('por potencia: % del FTP con ERG; watts absolutos se convierten', () => {
    const r = parseFitWorkout(
      fit(5, 'Umbral', [
        step(0, 'Calentamiento', { dv: 600000, tt: 4, lo: 50, hi: 70, int: 2 }),
        step(1, 'Umbral', { dv: 480000, tt: 4, lo: 1240, hi: 1260 }),
      ]),
      opts,
    );
    expect(r.allFree).toBe(false);
    expect(r.intervals.map((i) => [i.type, i.power_pct])).toEqual([
      ['warmup', 60],
      ['steady', 100],
    ]);
  });

  it('repeticiones: desenrolla y numera', () => {
    const r = parseFitWorkout(
      fit(5, 'Series', [
        step(0, 'Duro', { dv: 60000, tt: 4, lo: 110, hi: 120 }),
        step(1, 'Suave', { dv: 60000, tt: 4, lo: 50, hi: 50, int: 1 }),
        step(2, '', { dt: 6, dv: 0, tv: 3 }),
      ]),
      opts,
    );
    expect(r.intervals.map((i) => i.name)).toEqual(['Duro 1/3', 'Suave 1/3', 'Duro 2/3', 'Suave 2/3', 'Duro 3/3', 'Suave 3/3']);
  });

  it('una actividad grabada no es un entrenamiento', () => {
    expect(parseFitWorkout(fit(4, 'x', []), opts).errors[0]).toMatch(/actividad/);
  });
});
