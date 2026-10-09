import { describe, expect, it } from 'vitest';
import { buildCompletedSessionFromFit } from './completed-session-import';

const FIT_EPOCH_OFFSET_S = 631065600;
const profile = { ftp: 200, hr_max: 190, cadence_floor: 70, hr_ceiling: 176, hr_min: 0, cadence_max: 999 };

function buildFitBytes(timestamp: number): Uint8Array {
  const defBytes = [0x40, 0x00, 0x00, 20, 0x00, 2, 253, 4, 0x86, 7, 2, 0x84];
  const recordBytes = [0x00, timestamp & 0xff, (timestamp >> 8) & 0xff, (timestamp >> 16) & 0xff, (timestamp >> 24) & 0xff, 100, 0];
  const dataBytes = [...defBytes, ...recordBytes];
  const headerSize = 12;
  const header = new Uint8Array(headerSize);
  header[0] = headerSize;
  const dataSize = dataBytes.length;
  header[4] = dataSize & 0xff;
  header.set([0x2e, 0x46, 0x49, 0x54], 8);
  const full = new Uint8Array(headerSize + dataBytes.length);
  full.set(header, 0);
  full.set(dataBytes, headerSize);
  return full;
}

describe('buildCompletedSessionFromFit', () => {
  it('rechaza archivos que no son .fit sin intentar parsear', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'actividad.tcx');
    const result = await buildCompletedSessionFromFit(file, profile);
    expect(result.errors[0]).toContain('.fit');
  });

  it('arma una SessionRecord con la fecha real del archivo cuando no hay override', async () => {
    const timestamp = 100000;
    const file = new File([buildFitBytes(timestamp).buffer as ArrayBuffer], 'Morning_Ride.fit');
    const { session, errors } = await buildCompletedSessionFromFit(file, profile);
    expect(errors).toEqual([]);
    expect(session?.workoutName).toBe('Morning Ride');
    expect(session?.samples).toHaveLength(1);
    expect(session?.startedAt).toBe(new Date((timestamp + FIT_EPOCH_OFFSET_S) * 1000).toISOString());
  });

  it('usa un nombre genérico si el archivo no trae un nombre legible (export críptico de un dispositivo)', async () => {
    const timestamp = 100000;
    const file = new File([buildFitBytes(timestamp).buffer as ArrayBuffer], '260928212319_gsh42bpj.fit');
    const { session } = await buildCompletedSessionFromFit(file, profile);
    expect(session?.workoutName).toBe('Actividad importada');
  });

  it('con dateOverride cambia el día pero conserva la hora original', async () => {
    const timestamp = 100000; // -> 1990-01-02T03:46:40.000Z
    const file = new File([buildFitBytes(timestamp).buffer as ArrayBuffer], 'ride.fit');
    const { session } = await buildCompletedSessionFromFit(file, profile, '2026-06-15');
    expect(session?.startedAt.startsWith('2026-06-15T')).toBe(true);
    // misma hora:minuto:segundo que el original, solo cambia año/mes/día
    const originalTime = new Date((timestamp + FIT_EPOCH_OFFSET_S) * 1000).toISOString().slice(11);
    expect(session?.startedAt.slice(11)).toBe(originalTime);
  });

  it('rechaza una actividad con fecha futura (bloqueaba ese día en el plan)', async () => {
    const file = new File([buildFitBytes(100000).buffer as ArrayBuffer], 'salida.fit');
    const { session, errors } = await buildCompletedSessionFromFit(file, profile, '2099-01-01');
    expect(session).toBeUndefined();
    expect(errors[0]).toContain('futuro');
  });
});
