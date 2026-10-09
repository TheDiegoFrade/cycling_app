import { describe, expect, it } from 'vitest';
import { buildPlanEmail, buildWeeklyEmail, dayList, glossaryFor, shortDate, testDateOf, withoutGreeting } from '../../supabase/functions/coach-chat/report-email';

const week = (weekNumber: number) => ({
  weekNumber,
  workouts: [
    { date: '2026-10-12', name: 'Rodada suave', minutes: 60, erg: 'off' as const, isTest: false, intent: 'Por sensación, RPE 3-4.' },
    { date: '2026-10-14', name: 'Test de rampa', minutes: 48, erg: 'on' as const, isTest: true, intent: 'ERG prendido hasta que no sostengas la cadencia.' },
  ],
});

const plan = {
  athleteName: 'Alex',
  planName: 'Fondo MTB',
  goal: 'Fondo MTB',
  startDate: '2026-10-09',
  days: ['mon', 'wed', 'fri', 'sat'],
  hoursPerWeek: 5,
  coachNote: 'Hasta el test vas por sensación.',
  welcome: 'Qué gusto que empecemos, Alex.',
  why: [{ title: 'Arrancamos por sensación', body: 'No hay FTP medido.' }],
  closing: 'Nos vemos al cerrar el bloque.',
  blocks: [{ name: 'Base', weeks: 4, focus: 'Base y test', targetHoursPerWeek: 4 }],
  weeks: [week(2)],
  nextTest: { weekNumber: 2, type: 'ramp' as const, reason: 'Llegas fresco.' },
  appUrl: 'https://app.test',
};

describe('correos del coach', () => {
  it('fechas y días en español', () => {
    expect(shortDate('2026-10-14')).toBe('mié 14 oct');
    expect(dayList(['mon', 'wed', 'sat'])).toBe('lunes, miércoles y sábado');
    expect(testDateOf([week(2)], { weekNumber: 2, type: 'ramp', reason: '' })).toBe('2026-10-14');
  });

  it('el correo de bienvenida: saludo, primera sesión, cómo vamos a trabajar y test con su fecha', () => {
    const e = buildPlanEmail(plan);
    expect(e.subject).toBe('Alex, te doy la bienvenida: así arrancamos · Fondo MTB');
    expect(buildPlanEmail({ ...plan, athleteName: null }).subject).toBe('Te doy la bienvenida: así arrancamos · Fondo MTB');
    expect(e.html).toContain('Hola, Alex');
    expect(e.html).toContain('Qué gusto que empecemos, Alex.');
    expect(e.html).toContain('Tu primera sesión · lun 12 oct');
    expect(e.html).toContain('Test de rampa el mié 14 oct');
    expect(e.html).toContain('href="https://app.test"');
    expect(e.html).not.toContain('Modo de prueba');
    expect(e.text).toContain('Tu primera sesión (lun 12 oct): Rodada suave, 60 min.');
    expect(buildPlanEmail({ ...plan, testIntendedFor: 'alex@test.com' }).html).toContain('Modo de prueba');
  });

  it('el semanal: decisión, cumplimiento, preguntas y FTP solo si cambia', () => {
    const base = {
      athleteName: null,
      decision: 'maintain' as const,
      reasoning: 'Te faltó el sábado.',
      questions: ['¿Fue por tiempo o por cansancio?'],
      lastWeek: { plannedTSS: 200, actualTSS: 160, completed: 3, missed: 1 },
      nextWeek: week(3),
      nextTest: null,
      ftp: { action: 'keep' as const, suggested: null },
      appUrl: 'https://app.test',
    };
    const e = buildWeeklyEmail(base);
    expect(e.subject).toBe('Tu semana 3: mantenemos la carga');
    expect(e.html).toContain('3 de 4 sesiones · 80 % de la carga planeada');
    expect(e.html).toContain('¿Fue por tiempo o por cansancio?');
    expect(e.html).not.toContain('Tu FTP');
    expect(buildWeeklyEmail({ ...base, ftp: { action: 'change', suggested: 214 } }).text).toContain('Pon 214 W como FTP en tu perfil.');
    expect(e.text).toContain('Cuéntame en tu nota:');
    // Una observación (no pregunta) no se presenta como pregunta.
    const obs = buildWeeklyEmail({ ...base, questions: ['Tomo la nota para ajustar la cadencia, no para subir carga.'] });
    expect(obs.text).toContain('Lo que tomé en cuenta:');
    expect(obs.text).not.toContain('Cuéntame en tu nota');
    expect(buildWeeklyEmail({ ...base, nextTest: { weekNumber: 3, type: 'ramp', reason: '' } }).text).toContain('Test de rampa esta semana: mié 14 oct.');
  });

  it('glosario: solo los términos que aparecen en el plan', () => {
    expect(glossaryFor(plan).map((g) => g.term)).toEqual(['RPE', 'ERG', 'FTP', 'Rampa', 'Cadencia']);
  });

  it('con coach: su nota va arriba, firma él y la sesión sin modo no muestra "·"', () => {
    const coach = { name: 'Diego', comment: 'Cuida el sueño antes del test.' };
    const e = buildPlanEmail({ ...plan, coach });
    expect(e.html).toContain('Nota de Diego');
    expect(e.html).toContain('Cuida el sueño antes del test.');
    expect(e.html).toContain('Te lo envía Diego, tu coach en Torq.');
    expect(e.text).toContain('Nota de Diego: Cuida el sueño antes del test.');
    const noErg = { weekNumber: 3, workouts: [{ date: '2026-10-19', name: 'Fondo', minutes: 60, isTest: false, intent: '' }] };
    const w = buildWeeklyEmail({ athleteName: null, decision: 'progress', reasoning: 'Bien.', questions: [], lastWeek: null, nextWeek: noErg, nextTest: null, ftp: null, appUrl: 'https://app.test', coach });
    expect(w.text).toContain('- lun 19 oct: Fondo · 60 min\n');
    expect(w.html).toContain('Nota de Diego');
  });

  it('escapa el HTML de lo que escribe el modelo', () => {
    expect(buildPlanEmail({ ...plan, welcome: '<script>x</script>' }).html).not.toContain('<script>x');
  });

  it('no saluda dos veces si el texto del coach ya empieza con «Hola»', () => {
    expect(withoutGreeting('Hola, bienvenido. Vamos juntos hacia tu maratón.')).toBe('Vamos juntos hacia tu maratón.');
    expect(withoutGreeting('¡Hola! Vamos.')).toBe('Vamos.');
    expect(withoutGreeting('Vamos juntos hacia tu carrera.')).toBe('Vamos juntos hacia tu carrera.');
  });
});
