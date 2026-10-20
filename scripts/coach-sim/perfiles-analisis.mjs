// Análisis de la corrida del 20-oct-2026 (planes reales de producción, ver
// out/perfiles/ y docs/evaluaciones/planes-ia-para-joe-datos/). Lo escribió
// Claude leyendo cada plan contra el perfil y las reglas de arranque; NO es
// razonamiento de la IA del coach (create_plan no devuelve uno: lo único que
// explica es la nota al atleta, que el reporte cita textual). Si se vuelve a
// correr, este análisis queda viejo: actualizarlo o quitarlo.

export const CORRIDA = '20 de octubre de 2026';

export const GENERAL = [
  '**Lo que hace bien en los 10:**',
  '',
  '- **Respeta las reglas de arranque.** Las tres personas con condición de salud (Roberto, Lucía y Paola) no tienen test ni esfuerzos máximos: nada pasa de ~76% de FTP y todo va por sensación, con la indicación de ir con su médico. Ana y Daniel, que vienen de estar sedentarios y no saben usar RPE, van sin test, por sensación y con la escala de esfuerzo explicada. Los que vienen entrenando con intensidad (Mariana y Fernando) arrancan con umbral y arranques desde la semana 1, sin rehacer base.',
  '- **Nunca se pasa de la disponibilidad**, ni de días ni de minutos por sesión, y cuenta las otras actividades (gym, carrera, natación, yoga) para no poner un día duro junto a ellas.',
  '- **Usa la salida larga afuera** cuando el objetivo es largo y hay fin de semana (Carlos, Sofía, Javier, Fernando, Lucía, y Roberto desde la semana 3). Agenda técnica afuera para XCO (Fernando).',
  '- **Pone el test donde tiene sentido:** de 20 min para quien sabe dosificarse (Carlos, Sofía, Mariana, Fernando), casi siempre después de una descarga; rampa para Javier; nada para los demás.',
  '- **Explica sus decisiones** en la nota al atleta: demanda del evento, por qué esos días, qué cuenta en la carga.',
  '',
  '**Problemas que encontré (para corregir en Torq, no para Joe):**',
  '',
  '1. **Género en las descripciones de las sesiones.** A 4 de las 5 mujeres les habla en masculino en algunas sesiones: «listo para el fin de semana», «sentirte cómodo», «llegar entero» (Ana, Sofía, Lucía y Paola). Las notas del coach están bien. El error viene del redactor de descripciones (Haiku), que sí recibe el sexo.',
  '2. **Un extra sin sentido:** a Paola le agenda «Sin gimnasio hoy» (15 min).',
  '3. **Frases que no aplican:** a Paola (que no es de montaña) le dice que «el rodillo no entrena técnica de montaña», y que «ve una prueba sin competencia».',
  '4. **Consejo médico:** a Paola, con metformina, le dice «come antes de rodar y lleva algo dulce». Es prudente, pero es una indicación médica.',
  '',
  '**Limitación de la prueba:** las fechas de los eventos caen en martes porque los calculé como «hoy + N semanas» y hoy es martes. Es un error mío en los datos de prueba, no de la IA.',
  '',
  '**Preguntas para Joe:**',
  '',
  '- **Volumen corto.** El plan siempre se queda por debajo de lo disponible: Mariana (élite, venía de 12 h) arranca con 6.3 h de 11 posibles; Fernando ~7 de 9; Sofía ~4 de 5; Ana 2 de 2.5. ¿Así arrancarías, o está siendo demasiado prudente?',
  '- **Tope de 90 min en rodillo.** Aunque la persona no ponga límite, la IA no pasa de 90 min por sesión de rodillo. A Mariana (ruta) no le pone salida larga afuera: su sesión más larga es de 90 min. ¿Está bien para una élite de ruta?',
  '- **Alcohol 1–2 veces por semana.** Hoy cuenta igual que tomar seguido: sube el estrés un nivel y pone «base antes de intensidad». Por eso Carlos (Master 40, con experiencia, duerme bien) pasa 3 semanas sin nada arriba de tempo (82%). ¿Así lo quieres, o solo a partir de 3 veces por semana? (La regla está marcada como provisional.)',
  '- **Sueño de 6 h exactas** no cuenta como «poco sueño» (el corte es menos de 6 h); sí cuenta si la calidad es mala. ¿El corte está bien?',
  '- **Test en semana 1 con sueño malo.** Javier duerme mal y tiene estrés alto (arranque conservador), pero como sí puede dar un máximo, le toca la rampa el jueves de la primera semana. ¿Lo harías tan pronto?',
].join('\n');

/** Por perfil: cómo se conectan las decisiones con sus datos y qué revisar. */
export const POR_PERFIL = {
  p01: {
    porque: [
      '**Sin test, sin ERG y por sensación (RPE 3–4):** viene de estar sedentaria y no sabe usar RPE, así que las reglas la marcan como «no puede dar un máximo» y «hay que enseñarle RPE». El coach le explica la escala en la nota.',
      '**Arranque conservador:** estrés alto (sube por el alcohol semanal) y sueño de 6.5 h regular.',
      '**Volumen:** 1.2 h → 2.0 h → 2.0 h, contra 2.5 h disponibles. Le explica que 3 días de 45 min (2.25 h) no alcanzan las 2.5 h que puso.',
      '**Intensidad:** solo fondo al 60% y, desde la semana 2, cambios de 2 min al 70%. Lo más alto (RPE 6–7) llega hasta la semana 7.',
      '**Peso:** no promete kilos; manda la parte de la comida con un nutriólogo.',
    ],
    revisar: ['Para alguien que quiere bajar de peso, ¿meterías más estímulo antes de la semana 7?', 'Las descripciones le hablan en masculino («sentirte cómodo», «listo»).'],
  },
  p02: {
    porque: [
      '**Base antes de intensidad:** la regla del alcohol (1–2 veces por semana) lo pone en «base primero» y arranque conservador. Por eso nada pasa de 82% en 3 semanas; el sweet spot llega hasta el bloque 2.',
      '**Tempo progresivo los sábados:** 3×10 → 3×12 → 2×20 min a ~80%, para la demanda de maratón MTB (tempo y subidas sostenidas).',
      '**Gym lunes y miércoles respetado:** martes fondo y jueves tempo suave; la sesión clave es el sábado. Además le agenda contenido para el gym («pierna ligera», «tren superior y core»).',
      '**Salida larga afuera los domingos:** 2 h → 2 h 15 → 2 h 30, con comida desde el minuto 30.',
      '**Test de 20 min en la semana 5,** después de la descarga: tiene FTP medido y sabe dosificarse.',
    ],
    revisar: ['Con 12 semanas y experiencia, ¿3 semanas sin nada arriba de tempo es demasiado? Es efecto de la regla del alcohol.', '¿Está bien que la IA le diga qué hacer en su gym?'],
  },
  p03: {
    porque: [
      '**Tempo y salida larga, no intervalos cortos:** la demanda de un 70.3 es ritmo sostenido largo sin vaciar las piernas para la carrera a pie. Aunque viene entrenando con intensidad, no le mete umbral todavía.',
      '**Encaja la bici entre carrera y natación:** miércoles tempo (entre dos días de carrera), viernes suave (día de natación) y sábado largo afuera, 2 h → 2.5 h. Le pregunta qué días de carrera son fuertes para ajustar el miércoles.',
      '**FTP 190 W con umbral conservador** las primeras semanas; test de 20 min en la semana 6.',
      '**Volumen:** ~3.8–4.4 h de bici de 5 disponibles, más sus 5 sesiones de carrera y natación.',
    ],
    revisar: ['¿Meterías un brick (bici + trote) antes del bloque específico?', 'Una descripción le dice «listo».'],
  },
  p04: {
    porque: [
      '**Médico primero:** hipertensión con losartán. Sin test, sin FTP, todo por sensación y nada arriba de 68%. Le pide luz verde de su médico «antes de apretar».',
      '**Tope de 60 min respetado:** sesiones de 40–60 min. Como en rodillo no puede pasar de 60, para el gran fondo usa una salida larga afuera desde la semana 3 (75 min), que crece en los bloques siguientes.',
      '**Volumen:** 2.2 h → 2.6 h de rodillo. En la semana 3 quita el viernes y deja 2 de rodillo más la primera salida afuera.',
    ],
    revisar: ['¿Le pedirías valoración médica (o prueba de esfuerzo) antes de empezar, no solo antes de subir la intensidad?', '¿Por qué baja a 2 sesiones de rodillo en la semana 3? No lo explica.'],
  },
  p05: {
    porque: [
      '**En temporada:** venía de 12 h con intensidad, así que entra directo con umbral (3×8 → 3×10 → 3×12 min al 95–97%) y arranques de 10 s a tope sin ERG (referencia ~150%), sin rehacer base.',
      '**2 sesiones duras por semana:** miércoles y sábado. Lunes y jueves suaves por sus días de fuerza.',
      '**Volumen:** 6.3 → 7.5 → 7.7 h de 11 disponibles. Le dice que es para que sume bien con la fuerza.',
      '**Test de 20 min al final de la semana 4 (descarga):** 4 semanas después de su último test.',
      '**Sin salida larga afuera:** su sesión más larga es un fondo de 90 min en rodillo.',
    ],
    revisar: ['¿Bajarías de 12 h a 6.3 h la primera semana de una élite a 8 semanas del selectivo?', '¿Le falta una salida larga en ruta?', 'Los arranques de 10 s están desde la semana 1, pero los esfuerzos de 30 s a 1 min (clave en criterium) llegan hasta el bloque 2. ¿Es tarde?'],
  },
  p06: {
    porque: [
      '**Ignora su FTP provisional (250 W):** le dice «nada de números provisionales»; todo va por sensación hasta el test.',
      '**Test de rampa el jueves de la semana 1,** después de dos rodadas suaves. Sí puede dar un máximo, pero no tiene la experiencia completa para el de 20 min.',
      '**Su tiempo real:** 3 sesiones de 40 min entre semana y el sábado largo afuera, 90 → 100 → 110 min (su tope es 120).',
      '**Arranque conservador:** sueño malo y estrés alto. Semanas 2 y 3: un día de intervalos por RPE 7 y dos de fondo.',
    ],
    revisar: ['¿Test máximo en la semana 1 con sueño malo y estrés alto?', 'Las semanas 2 y 3 siguen por RPE aunque la rampa ya le dio watts (se armaron antes del test; la evaluación semanal debería pasarlas a watts).'],
  },
  p07: {
    porque: [
      '**Médico primero:** asma con salbutamol. Sin test ni máximos, por sensación y nada arriba de 76%; le pide luz verde de su médico.',
      '**Sus días:** martes y jueves rodillo de 55–68 min; el sábado, su rodada con amigas (2 h → 2 h 20), que es donde se entrena la subida real. Respeta el yoga del miércoles.',
      '**Hacia el Ajusco:** fondo y tempo por sensación ahora; los bloques sostenidos de 6–10 min a RPE 6–7 llegan en el bloque 2.',
      '**El inhalador:** le recuerda usarlo antes de rodar y llevarlo en las salidas del sábado.',
    ],
    revisar: ['Para subir el Ajusco sin bajarse, ¿meterías trabajo de fuerza en subida (cadencia baja) antes del bloque 2?', 'Una descripción le dice «listo».'],
  },
  p08: {
    porque: [
      '**La rodilla manda:** cadencia cómoda, nada de fuerza a cadencia baja ni arranques; si duele, parar y que lo vea un fisioterapeuta.',
      '**Sin test:** viene de estar sedentario y no sabe usar RPE. Todo por sensación, nada arriba de 74%.',
      '**3 sesiones en vez de 4:** 2.2 h → 2.6 h de 4 disponibles; le explica que suma tiempo de a poco.',
      '**Base primero:** fuma de vez en cuando. El peso, con nutriólogo; su avance lo mide con sesiones cumplidas, RPE y pulso.',
    ],
    revisar: ['¿Pondrías la 4ª sesión desde el inicio para la meta de peso?'],
  },
  p09: {
    porque: [
      '**En temporada:** intensidad desde el día 1, con 40:20 s por sensación (referencia ~125%) para los arranques y umbral 3×10–12 min al 92–95% para las subidas cortas.',
      '**Por edad (51),** 3 o más días entre las dos sesiones duras (martes y sábado) y una descarga cada 3 semanas.',
      '**Afuera:** técnica en montaña los jueves (60–75 min) y salida larga los domingos (2.5 h → 3 h).',
      '**FTP 265 W se queda** hasta el test de 20 min de la semana 4 (descarga).',
      '**Volumen:** ~5.6 → 7.3 h de 9 disponibles.',
    ],
    revisar: ['Le pone 40:20 s el mismo día que crea el plan. ¿Lo harías sin una rodada antes?', '¿Le faltan arranques explosivos más cortos (10–15 s) para XCO?'],
  },
  p10: {
    porque: [
      '**Médico primero y metabolismo primero:** diabetes tipo 2 con metformina. Fondo y tempo suave parejos (≤75%), sin picos largos, sin test ni watts: todo por RPE.',
      '**Lo que le gusta:** sesiones «tipo clase» con cambios de ritmo, 4 días de 42–45 min (su tope es 45).',
      '**Sin bici martes y jueves** por su yoga.',
      '**Volumen:** 2.1 → 2.9 → 3.0 h de 3 disponibles.',
    ],
    revisar: ['El consejo «come antes de rodar y lleva algo dulce» por la metformina: ¿debe darlo la IA?', 'El extra «Sin gimnasio hoy» (15 min) sobra; la frase de técnica de montaña no aplica; las descripciones le hablan en masculino («listo», «entero»).'],
  },
};
