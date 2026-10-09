import { describe, expect, it } from 'vitest';
import { buildPlanEmail, buildWeeklyEmail, dayList, shortDate, testDateOf } from '../../supabase/functions/coach-chat/report-email';

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

  it('el correo del plan lleva la nota, la primera semana y el test con su fecha', () => {
    const e = buildPlanEmail(plan);
    expect(e.subject).toBe('Tu plan está listo: Fondo MTB');
    expect(e.html).toContain('Hasta el test vas por sensación.');
    expect(e.html).toContain('Test de rampa en tu semana 2 (mié 14 oct).');
    expect(e.html).toContain('href="https://app.test"');
    expect(e.html).not.toContain('Modo de prueba');
    expect(e.text).toContain('- lun 12 oct: Rodada suave · 60 min · Sensación');
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
    expect(buildWeeklyEmail({ ...base, nextTest: { weekNumber: 3, type: 'ramp', reason: '' } }).text).toContain('Test de rampa esta semana: mié 14 oct.');
  });

  it('escapa el HTML de lo que escribe el modelo', () => {
    expect(buildPlanEmail({ ...plan, coachNote: '<script>x</script>' }).html).not.toContain('<script>x');
  });
});
