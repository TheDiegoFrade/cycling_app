import { describe, expect, it } from 'vitest';
import { PINON_QUICK, localAnswer, matchIntent, pinonCacheKey } from './pinon-chat';
import type { PinonChatData, PinonIntent } from './pinon-chat';

const base: PinonChatData = {
  todayKey: '2026-10-15',
  humanCoach: false,
  hasPlan: true,
  ftp: 220,
  today: { name: 'Sweet spot 3×10', minutes: 60, zone: 'sweet spot', description: null, done: false },
  week: { done: 2, planned: 4 },
  form: { ctl: 42, atl: 50, tsb: -8 },
  recent: [],
  schedule: [],
  daysSinceLastRide: 1,
};

function tone(text: string): void {
  expect(text.length).toBeLessThanOrEqual(200);
  expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
}

describe('matchIntent', () => {
  it('reconoce las preguntas comunes escritas a mano, con o sin acentos', () => {
    const cases: [string, PinonIntent][] = [
      ['¿Qué me toca hoy?', 'today'],
      ['que toca hoy', 'today'],
      ['¿cómo voy esta semana?', 'week'],
      ['como esta mi forma', 'form'],
      ['¿para qué sirve esto?', 'why'],
      ['estoy muy cansado', 'tired'],
      ['dormí mal', 'tired'],
      ['dame ánimo', 'cheer'],
      ['motívame', 'cheer'],
    ];
    for (const [text, intent] of cases) expect(matchIntent(text), text).toBe(intent);
  });

  it('pedir un cambio al plan se reconoce aunque sea largo', () => {
    expect(matchIntent('¿puedes mover el entreno del jueves al viernes?')).toBe('change');
    expect(matchIntent('Cámbiame la semana que viene porque me voy de viaje y no voy a tener rodillo, ¿sí puedes?')).toBe('change');
    expect(matchIntent('quita el test del día 20')).toBe('change');
    expect(matchIntent('súbeme el FTP')).toBe('change');
  });

  it('lo que no encaja (o es largo) va a la IA', () => {
    expect(matchIntent('¿qué desayuno antes de un entreno de dos horas?')).toBeNull();
    expect(matchIntent('Oye Piñón, el sábado tengo una rodada larga con amigos en la montaña, ¿cómo me hidrato?')).toBeNull();
    expect(matchIntent('')).toBeNull();
    expect(matchIntent('¿qué pasa si hago el entreno en la tarde?')).not.toBe('change');
    expect(matchIntent('¿por qué sube mi pulso en el entreno?')).not.toBe('change');
    // otro día, un concepto o un cansancio con matiz: los contesta la IA con la agenda
    expect(matchIntent('¿qué me toca el sábado?')).toBeNull();
    expect(matchIntent('¿qué me toca este fin de semana?')).toBeNull();
    expect(matchIntent('¿cómo viene la semana que entra?')).toBeNull();
    expect(matchIntent('¿qué es el FTP y para qué sirve?')).toBeNull();
    expect(matchIntent('¿por qué mi coach me puso umbral si estoy tan cansado?')).toBeNull();
    expect(matchIntent('¿para qué sirve el entreno de hoy?')).toBe('why');
  });
});

describe('localAnswer', () => {
  it('hoy: el entreno con botón de rodar; hecho; sin plan; descanso', () => {
    expect(localAnswer('today', base).text).toBe('Hoy toca Sweet spot 3×10, 60 min. Es de sweet spot.');
    expect(localAnswer('today', base).action?.href).toBe('#/prepare');
    expect(localAnswer('today', { ...base, today: { ...base.today!, done: true } }).text).toMatch(/^Hoy ya rodaste/);
    expect(localAnswer('today', { ...base, today: undefined, hasPlan: false }).action?.href).toBe('#/plan');
    expect(localAnswer('today', { ...base, today: undefined }).text).toMatch(/descansar/);
  });

  it('semana y forma con números', () => {
    expect(localAnswer('week', base).text).toBe('Llevas 2 de 4. Te faltan 2; vas a tiempo.');
    expect(localAnswer('week', { ...base, week: { done: 3, planned: 4 } }).text).toMatch(/Una más/);
    expect(localAnswer('week', { ...base, week: { done: 4, planned: 4 } }).text).toMatch(/semana cerrada/);
    expect(localAnswer('form', base).text).toBe('Tu base (fitness) es 42 y tu forma -8. Estás entrenando en serio: algo de fatiga, justo lo que te hace mejorar.');
    expect(localAnswer('form', { ...base, form: { ctl: 0, atl: 0, tsb: 0 } }).text).toMatch(/muy baja/);
    expect(localAnswer('form', { ...base, form: undefined }).text).toMatch(/Todavía no/);
  });

  it('nunca cambia el plan; con coach humano ni siquiera manda al ajuste', () => {
    const solo = localAnswer('change', base);
    expect(solo.text).toMatch(/no muevo tu plan/);
    expect(solo.action?.href).toBe('#/plan');
    const coached = localAnswer('change', { ...base, humanCoach: true });
    expect(coached.text).toMatch(/tu coach/);
    expect(coached.action).toBeUndefined();
    expect(localAnswer('tired', { ...base, humanCoach: true }).text).not.toMatch(/ajuste|descansa/);
    expect(localAnswer('today', { ...base, humanCoach: true, hasPlan: false, today: undefined }).action).toBeUndefined();
  });

  it('todas las respuestas cuidan el tono', () => {
    const variants: PinonChatData[] = [
      base,
      { ...base, today: undefined, form: undefined, week: { done: 0, planned: 0 } },
      { ...base, humanCoach: true, form: { ctl: 30, atl: 60, tsb: -30 } },
    ];
    for (const d of variants) for (const q of PINON_QUICK) for (const seed of [0, 1, 2, 3]) tone(localAnswer(q.intent, d, seed).text);
  });
});

describe('pinonCacheKey', () => {
  it('misma pregunta y datos → misma llave; otro día o datos → otra', () => {
    expect(pinonCacheKey('¿Qué desayuno?', base)).toBe(pinonCacheKey('que desayuno', base));
    expect(pinonCacheKey('¿Qué desayuno?', base)).not.toBe(pinonCacheKey('¿Qué desayuno?', { ...base, todayKey: '2026-10-16' }));
    expect(pinonCacheKey('¿Qué desayuno?', base)).not.toBe(pinonCacheKey('¿Qué desayuno?', { ...base, week: { done: 3, planned: 4 } }));
  });
});

describe('PINON_QUICK', () => {
  it('cada botón, escrito a mano, cae en su misma respuesta', () => {
    for (const q of PINON_QUICK) expect(matchIntent(q.label)).toBe(q.intent);
  });
  it('los botones no dan por hecho el género', () => {
    for (const q of PINON_QUICK) expect(q.label).not.toMatch(/\b\w+(ado|ada)\b/);
  });
});
