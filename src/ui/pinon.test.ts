import { describe, expect, it } from 'vitest';
import { MAX_PEEKS_PER_DAY, PEEK_PROBABILITY, pinonTip, shouldCelebrateWeek, shouldPeek } from './pinon';
import type { PinonTipContext } from './pinon';

describe('shouldPeek', () => {
  it('solo en las pantallas del atleta permitidas', () => {
    for (const s of ['home', 'plan', 'form', 'library'] as const) expect(shouldPeek(s, 0, true, 0)).toBe(true);
    for (const s of ['train', 'prepare', 'login', 'limits', 'invite', 'profile', 'session', 'log', 'coach-athletes', 'coach-week', 'coach-weeks', 'coach-library', 'coach-invite', 'coach-review', 'coach-session'] as const) {
      expect(shouldPeek(s, 0, true, 0)).toBe(false);
    }
  });

  it('tope de 4 al día', () => {
    expect(MAX_PEEKS_PER_DAY).toBe(4);
    expect(shouldPeek('home', 3, true, 0)).toBe(true);
    expect(shouldPeek('home', 4, true, 0)).toBe(false);
    expect(shouldPeek('home', 9, true, 0)).toBe(false);
  });

  it('apagado en Perfil → nunca', () => {
    expect(shouldPeek('home', 0, false, 0)).toBe(false);
  });

  it('40 % de probabilidad por render', () => {
    expect(PEEK_PROBABILITY).toBe(0.4);
    expect(shouldPeek('plan', 0, true, 0.39)).toBe(true);
    expect(shouldPeek('plan', 0, true, 0.4)).toBe(false);
    expect(shouldPeek('plan', 0, true, 0.99)).toBe(false);
  });
});

const base: PinonTipContext = { weekDone: 0, weekPlanned: 0, hasPlan: true, isRestDay: false, seed: 0 };

/** Sin emojis (pictográficos), ≤ 120 caracteres, a lo más un «!». */
function expectTone(text: string): void {
  expect(text.length).toBeLessThanOrEqual(120);
  expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
  expect((text.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
}

describe('pinonTip', () => {
  it('1 · entrenamiento hoy → nombre, minutos, frase de zona y Empezar a rodar', () => {
    const t = pinonTip({ ...base, todayWorkout: { name: 'Endurance', minutes: 65, zone: 'fondo' }, weekDone: 2, weekPlanned: 3, tsb: -30, isRestDay: true });
    expect(t.text).toBe('Hoy toca Endurance, 65 min. Suave y parejo, que puedas platicar.');
    expect(t.action).toEqual({ label: 'Empezar a rodar', href: '#/prepare', kind: 'ride' });
    expectTone(t.text);
  });

  it('1 · un nombre muy largo no pasa de 120 caracteres', () => {
    const t = pinonTip({ ...base, todayWorkout: { name: 'Sweet spot 3×12 con cadencia alta y sprints al final de cada bloque para la Iguanera MTB', minutes: 75, zone: 'sweet spot' } });
    expectTone(t.text);
    expect(t.text.startsWith('Hoy toca ')).toBe(true);
    expect(t.action?.kind).toBe('ride');
  });

  it('1 · sin zona usa una frase neutra', () => {
    expect(pinonTip({ ...base, todayWorkout: { name: 'Libre', minutes: 30, zone: null } }).text).toBe('Hoy toca Libre, 30 min. A rodar con calma.');
  });

  it('2 · falta una para cerrar la semana → Ver mi plan', () => {
    const t = pinonTip({ ...base, weekDone: 3, weekPlanned: 4, tsb: -30 });
    expect(t.text).toBe('Llevas 3 de 4. Una más y cierras la semana.');
    expect(t.action).toEqual({ label: 'Ver mi plan', href: '#/plan', kind: 'plan' });
  });

  it('3 · vienes cargado (TSB < −20)', () => {
    const t = pinonTip({ ...base, tsb: -21, isRestDay: true });
    expect(t.text).toMatch(/^Vienes con mucha carga\. Hoy suave o descanso/);
    expect(pinonTip({ ...base, tsb: -21, gender: 'm' }).text).toMatch(/^Vienes cargado\./);
    expect(pinonTip({ ...base, tsb: -21, gender: 'f' }).text).toMatch(/^Vienes cargada\./);
    expect(t.action).toBeUndefined();
    expect(pinonTip({ ...base, tsb: -20, isRestDay: true }).text).toMatch(/^Hoy descansas/);
  });

  it('4 · día de descanso', () => {
    expect(pinonTip({ ...base, isRestDay: true }).text).toBe('Hoy descansas. Mañana rodamos con piernas frescas.');
  });

  it('5 · sin plan → Crear plan', () => {
    const t = pinonTip({ ...base, hasPlan: false });
    expect(t.text).toBe('¿Armamos tu plan? Te hago unas preguntas sobre ti y tu bici, y el coach lo arma.');
    expect(t.action).toEqual({ label: 'Crear plan', href: '#/plan', kind: 'create' });
  });

  it('6 · si no aplica nada, consejos genéricos que rotan', () => {
    const texts = new Set([0, 1, 2, 3].map((seed) => pinonTip({ ...base, seed }).text));
    expect(texts.size).toBeGreaterThanOrEqual(3);
    texts.forEach(expectTone);
    expect(pinonTip({ ...base, seed: 4 }).text).toBe(pinonTip({ ...base, seed: 0 }).text);
  });

  it('con coach humano nunca sugiere cambiar el plan: solo anima', () => {
    const contexts: PinonTipContext[] = [
      { ...base, humanCoach: true, todayWorkout: { name: 'Umbral 2×15', minutes: 60, zone: 'umbral' } },
      { ...base, humanCoach: true, weekDone: 3, weekPlanned: 4 },
      { ...base, humanCoach: true, tsb: -35 },
      { ...base, humanCoach: true, isRestDay: true },
      { ...base, humanCoach: true, hasPlan: false },
      { ...base, humanCoach: true, seed: 2 },
    ];
    for (const ctx of contexts) {
      const t = pinonTip(ctx);
      expect(t.action?.kind).not.toBe('create');
      expect(t.text).not.toMatch(/suave o descanso|cambia|mueve|quita|armamos tu plan|crear plan/i);
      expectTone(t.text);
    }
  });

  it('todas las ramas cuidan el tono', () => {
    const all = [
      pinonTip({ ...base, todayWorkout: { name: 'VO2max 5×3', minutes: 55, zone: 'VO2' } }),
      pinonTip({ ...base, weekDone: 1, weekPlanned: 2 }),
      pinonTip({ ...base, tsb: -40 }),
      pinonTip({ ...base, isRestDay: true }),
      pinonTip({ ...base, hasPlan: false }),
    ];
    all.forEach((t) => expectTone(t.text));
  });
});

describe('shouldCelebrateWeek', () => {
  it('solo con todo lo agendado hecho y una vez por semana', () => {
    expect(shouldCelebrateWeek(4, 4, false)).toBe(true);
    expect(shouldCelebrateWeek(3, 4, false)).toBe(false);
    expect(shouldCelebrateWeek(0, 0, false)).toBe(false);
    expect(shouldCelebrateWeek(4, 4, true)).toBe(false);
  });
});

describe('guías, apoyo y juego', () => {
  it('guía: solo la primera vez, en sus pantallas, y nunca si se apagaron', async () => {
    const { shouldShowGuide, GUIDES } = await import('./pinon');
    expect(shouldShowGuide('home', false, false)).toBe(true);
    expect(shouldShowGuide('profile', false, false)).toBe(true);
    expect(shouldShowGuide('home', true, false)).toBe(false);
    expect(shouldShowGuide('home', false, true)).toBe(false);
    for (const s of ['train', 'prepare', 'login', 'limits', 'invite', 'coach-athletes', 'session'] as const) expect(shouldShowGuide(s, false, false)).toBe(false);
    Object.values(GUIDES).forEach(expectTone);
  });

  it('bienvenida de vuelta a partir de 5 días sin rodar, una vez', async () => {
    const { shouldWelcomeBack, welcomeBackText } = await import('./pinon');
    expect(shouldWelcomeBack(4, false)).toBe(false);
    expect(shouldWelcomeBack(5, false)).toBe(true);
    expect(shouldWelcomeBack(12, true)).toBe(false);
    expect(shouldWelcomeBack(null, false)).toBe(false);
    expect(welcomeBackText(true)).not.toMatch(/suave|cambia|plan/i);
    expectTone(welcomeBackText(false));
    expectTone(welcomeBackText(true));
  });

  it('racha: cada 3 semanas, sin repetir', async () => {
    const { streakMilestone } = await import('./pinon');
    expect(streakMilestone(2, 0)).toBeNull();
    expect(streakMilestone(3, 0)).toBe(3);
    expect(streakMilestone(3, 3)).toBeNull();
    expect(streakMilestone(4, 3)).toBeNull();
    expect(streakMilestone(6, 3)).toBe(6);
  });

  it('atraparlo: cuenta y celebra en 10, 25, 50 y 100', async () => {
    const { catchTitle, isCatchMilestone } = await import('./pinon');
    expect(catchTitle(1)).toBe('ME ATRAPASTE 1 VEZ');
    expect(catchTitle(7)).toBe('ME ATRAPASTE 7 VECES');
    expect([9, 10, 11, 25, 50, 100].map(isCatchMilestone)).toEqual([false, true, false, true, true, true]);
  });
});
