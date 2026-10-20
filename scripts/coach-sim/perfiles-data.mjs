// 10 personas realistas para que Joe evalúe qué plan arma el coach IA en sus
// primeras semanas. Cada una trae el cuestionario completo, como lo llena la
// app hoy (salud y hábitos, otras actividades, FTP medido / provisional / sin
// dato). Datos puros: sin red, sin variables de entorno (lo usa perfiles.mjs
// para correrlos y perfiles-check.ts para validarlos sin gastar IA).

const DAY_MS = 86_400_000;
export const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const fmtLong = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const inWeeks = (n) => fmtLong(addDays(todayKey(), n * 7));

const healthy = { conditions: [], takesMedication: false, recentInjury: false, injuryLimitsIntensity: false, smoking: 'no', alcohol: 'rarely' };

export const PERFILES = [
  {
    id: 'p01', name: 'Ana López', sex: 'F', age: 34, weight: 68,
    resumen: 'Oficinista sin experiencia, quiere bajar de peso y tener energía',
    discipline: 'other', experienceLevel: 'new_to_cycling', generalFitnessLevel: 'sedentary', yearsRiding: 0, structuredTrainingYears: 0, competes: false, category: null,
    ftp: null, hrMax: null, injuries: null, otherActivities: [],
    intake: { ...healthy, alcohol: 'weekly', stress: 'high', sleepHours: 6.5, sleepQuality: 'fair', restingHr: null, rpeLiteracy: 'no', maxEffortExperience: false, recentTraining: 'little', recentHoursPerWeek: 0 },
    availability: { hoursPerWeek: 2.5, days: ['mon', 'wed', 'fri'], maxSessionMinutes: 45 },
    goal: () => 'Quiero bajar 5 kg y tener más energía. Trabajo en oficina todo el día y nunca he entrenado en serio. Compré un rodillo para hacer ejercicio en casa.',
  },
  {
    id: 'p02', name: 'Carlos Méndez', sex: 'M', age: 42, weight: 84,
    resumen: 'MTB Master 40, primera carrera larga (Chupacabras 60 km)',
    discipline: 'mountain', experienceLevel: 'experienced', generalFitnessLevel: 'active_cyclist', yearsRiding: 6, structuredTrainingYears: 2, competes: true, category: 'Master 40',
    ftp: { watts: 235, source: 'manual', ageDays: 21 }, hrMax: 182, injuries: null,
    otherActivities: [{ kind: 'strength', perWeek: 2, minutes: 60, days: ['mon', 'wed'] }],
    intake: { ...healthy, alcohol: 'weekly', stress: 'medium', sleepHours: 7, sleepQuality: 'good', restingHr: 56, rpeLiteracy: 'yes', maxEffortExperience: true, recentTraining: 'easy', recentHoursPerWeek: 5 },
    availability: { hoursPerWeek: 6, days: ['tue', 'thu', 'sat', 'sun'], maxSessionMinutes: null },
    goal: () => `Correr el Chupacabras 60 km (MTB) el ${inWeeks(12)}. Quiero terminar en menos de 4 horas y no tronarme en la subida final. Voy al gym lunes y miércoles.`,
  },
  {
    id: 'p03', name: 'Sofía Ramírez', sex: 'F', age: 29, weight: 58,
    resumen: 'Triatleta: la bici es su punto débil para un 70.3',
    discipline: 'road', experienceLevel: 'experienced', generalFitnessLevel: 'active_cyclist', yearsRiding: 3, structuredTrainingYears: 3, competes: true, category: 'Grupos de edad 25-29',
    ftp: { watts: 190, source: 'manual', ageDays: 40 }, hrMax: 189, injuries: null,
    otherActivities: [
      { kind: 'running', perWeek: 3, minutes: 50, days: ['tue', 'thu', 'sun'] },
      { kind: 'swimming', perWeek: 2, minutes: 60, days: ['mon', 'fri'] },
    ],
    intake: { ...healthy, stress: 'medium', sleepHours: 7.5, sleepQuality: 'good', restingHr: 50, rpeLiteracy: 'yes', maxEffortExperience: true, recentTraining: 'with_intensity', recentHoursPerWeek: 9 },
    availability: { hoursPerWeek: 5, days: ['wed', 'fri', 'sat'], maxSessionMinutes: null },
    goal: () => `Medio Ironman 70.3 en Cozumel el ${inWeeks(16)}. Corro y nado bien; la bici (90 km) es mi punto débil y quiero llegar a correr el medio maratón sin morirme.`,
  },
  {
    id: 'p04', name: 'Roberto García', sex: 'M', age: 58, weight: 88,
    resumen: 'Retoma después de 3 años, hipertensión controlada, gran fondo 80 km',
    discipline: 'road', experienceLevel: 'returning_or_new_to_app', generalFitnessLevel: 'sedentary', yearsRiding: 10, structuredTrainingYears: 0, competes: false, category: null,
    ftp: null, hrMax: null, injuries: null, otherActivities: [],
    intake: { ...healthy, conditions: ['hypertension'], takesMedication: true, medicationNote: 'Losartán todos los días', alcohol: 'weekly', stress: 'medium', sleepHours: 6, sleepQuality: 'fair', restingHr: 72, rpeLiteracy: 'somewhat', maxEffortExperience: false, recentTraining: 'little', recentHoursPerWeek: 0 },
    availability: { hoursPerWeek: 4, days: ['mon', 'wed', 'fri', 'sat'], maxSessionMinutes: 60 },
    goal: () => `Rodar un gran fondo de 80 km el ${inWeeks(14)} con mis amigos. Dejé la bici hace 3 años y subí de peso. Tengo la presión alta controlada con medicamento.`,
  },
  {
    id: 'p05', name: 'Mariana Torres', sex: 'F', age: 23, weight: 56,
    resumen: 'Ciclista élite, selectivo nacional en 8 semanas',
    discipline: 'road', experienceLevel: 'experienced', generalFitnessLevel: 'active_cyclist', yearsRiding: 7, structuredTrainingYears: 4, competes: true, category: 'Élite femenil',
    ftp: { watts: 235, source: 'test_20min', ageDays: 14 }, hrMax: 196, injuries: null,
    otherActivities: [{ kind: 'strength', perWeek: 2, minutes: 45, days: ['mon', 'thu'] }],
    intake: { ...healthy, stress: 'low', sleepHours: 8, sleepQuality: 'good', restingHr: 46, rpeLiteracy: 'yes', maxEffortExperience: true, recentTraining: 'with_intensity', recentHoursPerWeek: 12 },
    availability: { hoursPerWeek: 11, days: ['mon', 'tue', 'wed', 'thu', 'sat', 'sun'], maxSessionMinutes: null },
    goal: () => `Selectivo nacional de ruta (criterium y contrarreloj) el ${inWeeks(8)}. Quiero mejorar mis arranques y aguantar más tiempo en umbral.`,
  },
  {
    id: 'p06', name: 'Javier Hernández', sex: 'M', age: 37, weight: 79,
    resumen: 'Papá con poco tiempo, gravel de 100 km, FTP provisional',
    discipline: 'gravel', experienceLevel: 'experienced', generalFitnessLevel: 'active_cyclist', yearsRiding: 5, structuredTrainingYears: 1, competes: false, category: null,
    ftp: { watts: 250, source: 'provisional', ageDays: 3 }, hrMax: null, injuries: null, otherActivities: [],
    intake: { ...healthy, stress: 'high', sleepHours: 6, sleepQuality: 'poor', restingHr: 60, rpeLiteracy: 'somewhat', maxEffortExperience: true, recentTraining: 'easy', recentHoursPerWeek: 3 },
    availability: { hoursPerWeek: 4, days: ['tue', 'wed', 'thu', 'sat'], maxSessionMinutes: 120 },
    goal: () => `Gravel de 100 km en la Sierra Gorda el ${inWeeks(12)}. Tengo dos hijos chicos: entre semana solo puedo 40 minutos temprano y el sábado hasta 2 horas. Duermo mal.`,
  },
  {
    id: 'p07', name: 'Lucía Fernández', sex: 'F', age: 46, weight: 64,
    resumen: 'MTB recreativa con asma, quiere subir el Ajusco sin bajarse',
    discipline: 'mountain', experienceLevel: 'returning_or_new_to_app', generalFitnessLevel: 'active_cyclist', yearsRiding: 3, structuredTrainingYears: 0, competes: false, category: null,
    ftp: null, hrMax: null, injuries: null,
    otherActivities: [{ kind: 'mobility', perWeek: 1, minutes: 60, days: ['wed'] }],
    intake: { ...healthy, conditions: ['asthma'], takesMedication: true, medicationNote: 'Inhalador (salbutamol) antes de rodar', stress: 'medium', sleepHours: 7, sleepQuality: 'good', restingHr: null, rpeLiteracy: 'no', maxEffortExperience: false, recentTraining: 'easy', recentHoursPerWeek: 3 },
    availability: { hoursPerWeek: 4, days: ['tue', 'thu', 'sat'], maxSessionMinutes: null },
    goal: () => 'Subir el Ajusco sin bajarme de la bici en las rodadas con mis amigas. Martes y jueves rodillo; el sábado salgo a rodar con ellas. No compito.',
  },
  {
    id: 'p08', name: 'Daniel Ortiz', sex: 'M', age: 31, weight: 98,
    resumen: 'Exfutbolista con sobrepeso y molestia de rodilla',
    discipline: 'other', experienceLevel: 'new_to_cycling', generalFitnessLevel: 'sedentary', yearsRiding: 0, structuredTrainingYears: 0, competes: false, category: null,
    ftp: null, hrMax: null,
    injuries: 'Molestia en la rodilla derecha: me operaron el menisco hace 4 años y me duele al subir escaleras rápido.',
    otherActivities: [],
    intake: { ...healthy, smoking: 'occasional', alcohol: 'weekly', stress: 'medium', sleepHours: 6.5, sleepQuality: 'fair', restingHr: 78, rpeLiteracy: 'no', maxEffortExperience: true, recentTraining: 'little', recentHoursPerWeek: 0 },
    availability: { hoursPerWeek: 4, days: ['mon', 'tue', 'thu', 'sat'], maxSessionMinutes: 60 },
    goal: () => 'Bajar 12 kg y volver a estar en forma. Jugaba fútbol hasta hace 2 años y dejé de hacer ejercicio.',
  },
  {
    id: 'p09', name: 'Fernando Ruiz', sex: 'M', age: 51, weight: 72,
    resumen: 'XCO Master 50 a media temporada, Copa Nacional en 8 semanas',
    discipline: 'mountain', experienceLevel: 'experienced', generalFitnessLevel: 'active_cyclist', yearsRiding: 15, structuredTrainingYears: 8, competes: true, category: 'Master 50',
    ftp: { watts: 265, source: 'test_ramp', ageDays: 10 }, hrMax: 176, injuries: null, otherActivities: [],
    intake: { ...healthy, stress: 'low', sleepHours: 7, sleepQuality: 'good', restingHr: 48, rpeLiteracy: 'yes', maxEffortExperience: true, recentTraining: 'with_intensity', recentHoursPerWeek: 9 },
    availability: { hoursPerWeek: 9, days: ['mon', 'tue', 'thu', 'sat', 'sun'], maxSessionMinutes: null },
    goal: () => `Copa Nacional de XCO (Master 50) el ${inWeeks(8)}. Estoy a media temporada: corrí hace 2 semanas. Quiero llegar con más chispa en los arranques y en las subidas cortas.`,
  },
  {
    id: 'p10', name: 'Paola Jiménez', sex: 'F', age: 39, weight: 70,
    resumen: 'Diabetes tipo 2 controlada, entrena por salud y diversión',
    discipline: 'other', experienceLevel: 'returning_or_new_to_app', generalFitnessLevel: 'active_other_sport', yearsRiding: 1, structuredTrainingYears: 0, competes: false, category: null,
    ftp: null, hrMax: null, injuries: null,
    otherActivities: [{ kind: 'mobility', perWeek: 2, minutes: 60, days: ['tue', 'thu'] }],
    intake: { ...healthy, conditions: ['diabetes'], takesMedication: true, medicationNote: 'Metformina', stress: 'high', sleepHours: 7, sleepQuality: 'fair', restingHr: 70, rpeLiteracy: 'somewhat', maxEffortExperience: false, recentTraining: 'easy', recentHoursPerWeek: 2 },
    availability: { hoursPerWeek: 3, days: ['mon', 'wed', 'fri', 'sun'], maxSessionMinutes: 45 },
    goal: () => 'Quiero hacer ejercicio que me guste para controlar mi glucosa y bajar el estrés. Me gustan las clases con música; nada de competir.',
  },
];

function birthDateFor(age) {
  const t = todayKey();
  return `${Number(t.slice(0, 4)) - age}-01-15`;
}

/** Fila de `profiles` para la cuenta dummy (lo que dejaría el cuestionario). */
export function profileRow(p, now = Date.now()) {
  const ftpUpdatedAt = p.ftp ? new Date(now - p.ftp.ageDays * DAY_MS).toISOString() : null;
  return {
    name: p.name, sex: p.sex, birth_date: birthDateFor(p.age), weight_kg: p.weight,
    ftp: p.ftp?.watts ?? 200, ftp_source: p.ftp?.source ?? 'default', ftp_confirmed: !!p.ftp && p.ftp.source !== 'provisional', ftp_updated_at: ftpUpdatedAt,
    hr_max: p.hrMax ?? 185, hr_max_confirmed: p.hrMax !== null,
    experience_level: p.experienceLevel, general_fitness_level: p.generalFitnessLevel, years_riding: p.yearsRiding, structured_training_years: p.structuredTrainingYears,
    competes: p.competes, category: p.category, discipline: p.discipline, injuries: p.injuries,
    other_activities: p.otherActivities, health_intake: p.intake, rpe_zones: null, updated_at: new Date(now).toISOString(),
  };
}

/** El `context` de create_plan, armado igual que src/ui/coach.ts (persona nueva en Torq: sin historial). */
export function createContext(p, startDate = todayKey(), occupiedDates = [], now = Date.now()) {
  const row = profileRow(p, now);
  const measured = !!p.ftp && p.ftp.source !== 'provisional';
  return {
    startDate,
    goal: p.goal(),
    experienceLevel: p.experienceLevel,
    generalFitnessLevel: p.generalFitnessLevel,
    discipline: p.discipline,
    yearsRiding: p.yearsRiding,
    competes: p.competes,
    category: p.competes ? p.category : null,
    availability: p.availability,
    occupiedDates,
    profile: {
      ftp: measured ? p.ftp.watts : null,
      provisionalFtp: p.ftp?.source === 'provisional' ? p.ftp.watts : null,
      ftpSource: row.ftp_source,
      ftpUpdatedAt: row.ftp_updated_at,
      hr_max: p.hrMax,
      sex: p.sex,
      name: p.name,
      injuries: p.injuries,
      weightKg: p.weight,
      ageYears: p.age,
      otherActivities: p.otherActivities,
      intake: p.intake,
      experienceLevel: p.experienceLevel,
      generalFitnessLevel: p.generalFitnessLevel,
      structuredTrainingYears: p.structuredTrainingYears,
      rpeZones: null,
    },
    recentHistory: null,
    lastTest: null,
  };
}
