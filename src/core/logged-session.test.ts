import { describe, expect, it } from 'vitest';
import { buildLoggedSession, LOGGED_SESSION_WORKOUT_ID, validateLogSessionForm } from './logged-session';
import type { LogSessionForm } from './logged-session';
import type { Sample } from './types';

const NOW = new Date(2026, 9, 13, 18, 30, 0); // 13 oct 2026, 6:30pm local

function form(overrides: Partial<LogSessionForm> = {}): LogSessionForm {
  return {
    kind: 'strength',
    name: '',
    dateKey: '2026-10-13',
    completion: 'complete',
    minutes: 45,
    rpe: 6,
    note: '',
    fit: null,
    ...overrides,
  };
}

describe('validateLogSessionForm', () => {
  it('pide duración y RPE si la hizo', () => {
    expect(validateLogSessionForm(form())).toEqual([]);
    expect(validateLogSessionForm(form({ minutes: null, rpe: null }))).toHaveLength(2);
    expect(validateLogSessionForm(form({ minutes: 601 }))).toHaveLength(1);
  });

  it('no pide duración ni RPE si no la hizo', () => {
    expect(validateLogSessionForm(form({ completion: 'skipped', minutes: null, rpe: null }))).toEqual([]);
  });

  it('pide la fecha', () => {
    expect(validateLogSessionForm(form({ dateKey: '' }))).toHaveLength(1);
  });
});

describe('buildLoggedSession', () => {
  it('arma una sesión manual sin samples, con duración de reloj', () => {
    const s = buildLoggedSession(form({ note: '  rodilla bien ' }), null, 250, NOW);
    expect(s.workoutId).toBe(LOGGED_SESSION_WORKOUT_ID);
    expect(s.workoutName).toBe('Fuerza');
    expect(s.kind).toBe('strength');
    expect(s.completion).toBe('complete');
    expect(s.source).toBe('manual');
    expect(s.samples).toEqual([]);
    expect(s.rpe).toBe(6);
    expect(s.note).toBe('rodilla bien');
    expect(s.ftp).toBe(250);
    // hoy: termina "ahora", empezó hace 45 min
    expect(new Date(s.finishedAt).getTime()).toBe(NOW.getTime());
    expect(new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()).toBe(45 * 60000);
  });

  it('usa mediodía local para otro día', () => {
    const s = buildLoggedSession(form({ dateKey: '2026-10-10', name: 'Pierna' }), null, 250, NOW);
    const started = new Date(s.startedAt);
    expect([started.getFullYear(), started.getMonth(), started.getDate(), started.getHours()]).toEqual([2026, 9, 10, 12]);
    expect(s.workoutName).toBe('Pierna');
  });

  it('"No la hice" no guarda duración, RPE ni samples', () => {
    const samples: Sample[] = [{ t: 0, power: 0, cadence: 0, hr: 100, target: 0, intensity: 100, interval_index: 0 }];
    const s = buildLoggedSession(form({ completion: 'skipped', fit: { samples, startedAt: NOW.toISOString() } }), null, 250, NOW);
    expect(s.startedAt).toBe(s.finishedAt);
    expect(s.rpe).toBeUndefined();
    expect(s.samples).toEqual([]);
    expect(s.source).toBe('manual');
  });

  it('con .fit: toma su hora de inicio en la fecha elegida y marca fit_upload', () => {
    const samples: Sample[] = [{ t: 0, power: 0, cadence: 0, hr: 120, target: 0, intensity: 100, interval_index: 0 }];
    const fitStart = new Date(2026, 9, 9, 7, 15, 0).toISOString();
    const s = buildLoggedSession(form({ dateKey: '2026-10-11', fit: { samples, startedAt: fitStart } }), null, 250, NOW);
    const started = new Date(s.startedAt);
    expect([started.getDate(), started.getHours(), started.getMinutes()]).toEqual([11, 7, 15]);
    expect(s.samples).toBe(samples);
    expect(s.source).toBe('fit_upload');
  });

  it('al editar conserva id, workoutId, ftp y hora si no cambió la fecha', () => {
    const first = buildLoggedSession(form({ dateKey: '2026-10-10' }), null, 250, NOW);
    const edited = buildLoggedSession(form({ dateKey: '2026-10-10', kind: 'mobility', minutes: 30, rpe: 3 }), first, 300, NOW);
    expect(edited.id).toBe(first.id);
    expect(edited.ftp).toBe(250);
    expect(edited.startedAt).toBe(first.startedAt);
    expect(edited.kind).toBe('mobility');
    expect(edited.workoutName).toBe('Movilidad');
  });
});
