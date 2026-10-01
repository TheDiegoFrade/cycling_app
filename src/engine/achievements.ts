export interface AchievementInput {
  totalSessions: number;
  totalDurationS: number;
  longestSessionS: number;
  bestStreakWeeks: number;
  currentStreakWeeks: number;
  /** FTP del registro más antiguo con un FTP válido (>0), o null si no hay
   * ninguno todavía — nunca se compara contra 0/undefined para no disparar
   * falsos positivos de "FTP en subida". */
  oldestFtp: number | null;
  currentFtp: number;
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  /** Sirve como meta ("esto falta") cuando está bloqueado y como logro
   * ("esto lograste") cuando ya se ganó — redactado como un hecho simple,
   * no como instrucción ni felicitación genérica, para que funcione en los
   * dos estados sin sonar raro en ninguno. */
  description: string;
  earned(input: AchievementInput): boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_session',
    icon: '🚲',
    title: 'Primer pedalazo',
    description: 'Toda base se construye sesión por sesión — esta es la primera de muchas.',
    earned: (i) => i.totalSessions >= 1,
  },
  {
    id: 'sessions_10',
    icon: '🔥',
    title: 'Ritmo constante',
    description: '10 sesiones registradas. Ya no es casualidad, es hábito.',
    earned: (i) => i.totalSessions >= 10,
  },
  {
    id: 'sessions_50',
    icon: '🔥',
    title: 'Motor rodado',
    description: '50 sesiones a tus espaldas — esto ya es una base sólida de verdad.',
    earned: (i) => i.totalSessions >= 50,
  },
  {
    id: 'sessions_100',
    icon: '💯',
    title: 'Cien sesiones',
    description: '100 entrenamientos completados. Pocos llegan hasta aquí.',
    earned: (i) => i.totalSessions >= 100,
  },
  {
    id: 'long_session_2h',
    icon: '⛰️',
    title: 'Fondo largo',
    description: 'Más de 2 horas en una sola sesión — tu resistencia de base está donde debe estar.',
    earned: (i) => i.longestSessionS >= 7200,
  },
  {
    id: 'long_session_3h',
    icon: '🏔️',
    title: 'Larga distancia',
    description: 'Más de 3 horas pedaleando de corrido. Eso es aguante.',
    earned: (i) => i.longestSessionS >= 10800,
  },
  {
    id: 'volume_100h',
    icon: '⏱️',
    title: '100 horas en la bici',
    description: '100 horas acumuladas de entrenamiento — un volumen que habla por sí solo.',
    earned: (i) => i.totalDurationS >= 360000,
  },
  {
    id: 'streak_4w',
    icon: '📅',
    title: 'Un mes sin fallar',
    description: '4 semanas seguidas entrenando. La constancia ya es tu aliada.',
    earned: (i) => i.bestStreakWeeks >= 4,
  },
  {
    id: 'streak_12w',
    icon: '📅',
    title: 'Trimestre completo',
    description: '12 semanas seguidas sin cortar la racha. Esto ya es disciplina de verdad.',
    earned: (i) => i.bestStreakWeeks >= 12,
  },
  {
    id: 'streak_current_8w',
    icon: '⚡',
    title: 'En racha ahora mismo',
    description: 'Llevas 8 semanas seguidas entrenando — estás en tu mejor momento de constancia.',
    earned: (i) => i.currentStreakWeeks >= 8,
  },
  {
    id: 'ftp_improved',
    icon: '📈',
    title: 'FTP en subida',
    description: 'Tu FTP subió desde tu primer registro — la prueba directa de que el trabajo está rindiendo.',
    earned: (i) => i.oldestFtp !== null && i.currentFtp > i.oldestFtp,
  },
];

export function evaluateAchievements(input: AchievementInput): { achievement: Achievement; earned: boolean }[] {
  return ACHIEVEMENTS.map((achievement) => ({ achievement, earned: achievement.earned(input) }));
}

/** Arma el input de logros a partir de todas las sesiones completadas —
 * mismo cálculo lo usan tanto la galería de Forma como el chequeo de
 * celebración al terminar un entrenamiento, para no tener dos formas
 * distintas de decidir qué cuenta. */
export function buildAchievementInput(
  rows: readonly { startedAt: string; durationS: number; ftp: number }[],
  streak: { currentWeeks: number; bestWeeks: number },
  currentFtp: number,
): AchievementInput {
  const sortedByDate = [...rows].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const oldestFtpRow = sortedByDate.find((r) => r.ftp > 0) ?? null;
  return {
    totalSessions: rows.length,
    totalDurationS: rows.reduce((sum, r) => sum + r.durationS, 0),
    longestSessionS: rows.reduce((max, r) => Math.max(max, r.durationS), 0),
    bestStreakWeeks: streak.bestWeeks,
    currentStreakWeeks: streak.currentWeeks,
    oldestFtp: oldestFtpRow?.ftp ?? null,
    currentFtp,
  };
}
