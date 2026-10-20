// Análisis de la corrida 2 (20-oct-2026, después de #54: metas realistas,
// FTP escrito se confirma, semana típica, alcohol 1-2/sem no cuenta). Lo
// escribió Claude leyendo cada plan contra el perfil, las reglas de arranque
// y la corrida 1 (docs/evaluaciones/planes-ia-para-joe-datos/v1/).
// NO es razonamiento de la IA del coach: create_plan no devuelve uno; lo único
// que explica es la nota al atleta, que el reporte cita textual. Si se vuelve
// a correr, este análisis queda viejo: actualizarlo o quitarlo.

export const CORRIDA = '20 de octubre de 2026 (corrida 2)';

export const GENERAL = [
  '**Qué cambió desde la corrida 1** (esa misma tarde, después de la revisión de producto):',
  '',
  '- **Ya no promete resultados.** A Carlos: «La meta de menos de 4 h la juzgamos tras el test y las primeras semanas; por ahora la meta del plan es llegar entero a la subida final». A Roberto: «se ve alcanzable con 15 semanas, pero con tus primeras semanas vamos a ver qué ritmo es realista». A Lucía: «aún no sé qué tiempo es realista». A Ana y Daniel: «no prometo kilos».',
  '- **El FTP que escribió la persona se confirma pronto.** Carlos y Sofía hacen su test de 20 min en la semana 2 (antes, en las semanas 5 y 6). Fernando, que hizo un test hace 10 días, lo repite hasta la semana 4.',
  '- **Parte de lo que ya hace cada quien.** Fernando: «respeto tu semana… y cambio solo la progresión». Carlos: «la salida larga del domingo, que ya haces, se queda». Mariana: «partimos de tu semana real». Lucía: «parto de lo que ya haces». Sofía: arranca en 3 h 20 min de bici, «máximo +10 % sobre lo que ya haces».',
  '- **El alcohol ocasional ya no frena.** Carlos ahora arranca normal: sweet spot hasta 89–90% desde la semana 1 (antes, nada arriba de 82% en 3 semanas).',
  '- **Mariana ahora tiene salida larga afuera** (3 h 30 min los sábados, con el equipo), como la que ya hacía.',
  '- **Género:** antes había 8 errores (7 a mujeres); ahora hay 1, al revés: a Roberto le dice «lista».',
  '- **Paola:** ya no aparece el extra «Sin gimnasio hoy» ni la frase de técnica de montaña.',
  '',
  '**Se mantiene bien:** las reglas de salud (Roberto, Lucía y Paola sin test, por sensación y con la indicación de ir al médico; nada arriba de ~78%). Nunca se pasa de la disponibilidad y cuenta gym, carrera, natación y yoga.',
  '',
  '**Pendientes para Torq:**',
  '',
  '1. **Género al revés:** una descripción de Roberto dice «lista para descansar».',
  '2. **Tope de 90 min en rodillo:** a Mariana le dice «tu sesión indoor llega a 90 min… si quieres rodillo más largo, súbelo en tu formulario», pero ella no puso tope: es el límite general del coach y se lo presenta como si fuera suyo.',
  '3. **Contenido del gym:** a Carlos y Mariana les agenda qué hacer en su gym («pierna moderada», «tren superior y core»), aunque solo dijeron que van.',
  '',
  '**Preguntas para Joe:**',
  '',
  '- **Volumen.** Sigue por debajo de lo disponible, ahora con razones explícitas: Sofía 3 h 20 min de bici de 5 («máximo +10 % sobre lo que ya haces»), Mariana ~4.7–5.9 h de rodillo más 3.5 h afuera de 11, Fernando 6.7–7.8 h de 9 contando técnica y salida larga (la semana 3 es de descarga). ¿Estás de acuerdo?',
  '- **Javier** (duerme mal, estrés alto) sigue con la rampa el jueves de la semana 1. ¿Tan pronto?',
  '- **Paola** tiene descarga en la semana 3 (baja a 1.6 h), cuando apenas lleva 2 semanas de 2.1–2.2 h. ¿Hace falta tan pronto?',
  '- **Ana** (34, sana, sedentaria): le recomienda chequeo médico antes de subir intensidad. ¿Lo pedirías a todo sedentario?',
  '- **Metformina:** a Paola le dice «come algo antes de rodar y lleva algo dulce». Es una regla escrita en el prompt (método de Joe). ¿La mantenemos así?',
  '- **Contenido del gym:** ¿quieres que la IA le diga a la persona qué hacer en su gym, o solo que lo tome en cuenta?',
].join('\n');

/** Por perfil: qué decidió, por qué (contra sus datos y las reglas) y qué cambió desde la corrida 1. */
export const POR_PERFIL = {
  p01: {
    porque: [
      '**Sin test, sin ERG, por sensación (RPE 3–4):** sedentaria y no sabe usar RPE. Le explica la escala.',
      '**Arranque conservador:** estrés alto y 6.5 h de sueño regular (el alcohol semanal ya no suma).',
      '**Volumen:** 1.2 → 2.1 → 2.2 h; explica que 3 × 45 min (2.25 h) no alcanzan sus 2.5 h.',
      '**Meta:** «no prometo kilos, sí constancia y un proceso medible»; la alimentación, con nutriólogo. Además le recomienda un chequeo médico antes de subir intensidad.',
    ],
    cambio: 'Casi igual. Ahora dice explícitamente que no promete kilos y agrega el chequeo médico. Ya no hay errores de género.',
    revisar: ['¿Chequeo médico para toda persona sedentaria, o solo con alguna señal?'],
  },
  p02: {
    porque: [
      '**Su FTP es de partida:** «arrancamos con tus 235 W y los confirmamos con el test de 20 min el sábado de la semana 2; hasta entonces nada intenso a más del 90 %».',
      '**No promete el «menos de 4 h»:** lo juzga después del test; mientras, la meta es llegar entero a la subida final.',
      '**Parte de su semana:** la salida larga de montaña del domingo «que ya haces, se queda» (2 h 30 → 2 h 45); gym lunes y miércoles contado, lo duro el sábado.',
      '**Sin freno por alcohol:** sweet spot hasta 89–90% desde la semana 1.',
    ],
    cambio: 'Antes: aceptaba «menos de 4 h» como la demanda, 3 semanas sin nada arriba de 82% por la regla del alcohol y test hasta la semana 5. Ahora: meta por evaluar, test en la semana 2, sweet spot desde la semana 1 y parte de su salida del domingo.',
    revisar: ['Le agenda contenido para su gym («pierna moderada», «tren superior y core»). ¿Debe?'],
  },
  p03: {
    porque: [
      '**Demanda del 70.3:** tempo largo y salida larga, sin vaciar las piernas para la carrera a pie.',
      '**Su FTP se confirma:** test de 20 min el viernes de la semana 2.',
      '**Parte de su carga real:** venía de 9 h en total (bici, carrera y natación); arranca en 3 h 20 min de bici, «máximo +10 % sobre lo que ya haces». Miércoles tempo (después de sus series del martes), viernes suave (natación), sábado largo afuera 1 h 40 → 2 h.',
      '**Pregunta lo que le falta:** qué día corre fuerte y si quiere brick más adelante (el brick entra en el bloque específico).',
    ],
    cambio: 'Antes: test en la semana 6 y no hablaba de su carga actual. Ahora: test en la semana 2, volumen calculado desde lo que ya hace y brick planeado.',
    revisar: ['3 h 20 min de 5 h disponibles: ¿la regla del +10 % sobre su carga total te parece bien para una triatleta?'],
  },
  p04: {
    porque: [
      '**Médico primero:** hipertensión con losartán. Sin test, sin FTP, todo por sensación, nada arriba de 72%.',
      '**Meta realista sin prometer:** «se ve alcanzable con 15 semanas, pero con tus primeras semanas vamos a ver qué ritmo es realista; la meta es llegar entero».',
      '**3 sesiones de 45–60 min** (su tope es 60), viernes libre; la salida larga afuera llega en el bloque 2.',
    ],
    cambio: 'Antes: en la semana 3 bajaba a 2 sesiones sin explicar. Ahora: 3 sesiones estables (2.5 → 2.7 h) y una evaluación explícita de la meta.',
    revisar: ['Una descripción le dice «lista para descansar» (error de género, para Torq).'],
  },
  p05: {
    porque: [
      '**Parte de su semana real:** umbral el martes, fondo el miércoles, salida larga el sábado, arranques el domingo.',
      '**En temporada:** umbral (3×10 → 4×10 min al 95–97%) y arranques desde la semana 1.',
      '**Salida larga afuera con el equipo:** 3 h 30 min los sábados, que completa las horas que el rodillo no da.',
      '**Retest de 20 min en la semana 4** (su último test fue hace 2 semanas).',
    ],
    cambio: 'Antes: todo en rodillo (máximo 90 min) y sin salida larga. Ahora: respeta su salida del sábado y su estructura.',
    revisar: ['Rodillo 4.7–5.9 h + 3.5 h afuera = ~8–9.5 h, de 11 disponibles y 12 que venía haciendo. ¿Bien a 8 semanas del selectivo?', 'Le presenta el tope general de 90 min como si ella lo hubiera puesto (para Torq).'],
  },
  p06: {
    porque: [
      '**Ignora el FTP provisional:** todo por sensación hasta la rampa del jueves de la semana 1.',
      '**Su tiempo real:** 3 × 40 min entre semana y el sábado de gravel afuera 1 h 30 → 2 h (su techo de 4 h).',
      '**Conservador:** sueño corto y estrés alto; una sola sesión de intensidad por semana (tempo hasta 78% por RPE).',
    ],
    cambio: 'Casi igual. Ahora las semanas 2 y 3 tienen un tempo por RPE (hasta 78%) en lugar de solo fondo.',
    revisar: ['¿Rampa en la semana 1 con sueño malo y estrés alto?'],
  },
  p07: {
    porque: [
      '**Médico primero:** asma con inhalador. Sin test ni máximos, por sensación, nada arriba de 78%.',
      '**Parte de lo que ya hace:** martes de rodillo y sábado de 2 h con sus amigas (2 h → 2 h 15); jueves rodillo; yoga del miércoles libre.',
      '**Meta honesta:** «aún no sé qué tiempo es realista… la meta es subir sin bajarte».',
    ],
    cambio: 'Antes ya iba bien. Ahora parte explícitamente de su rutina y dice la meta. Ya no hay errores de género.',
    revisar: ['¿Trabajo de fuerza en subida (cadencia baja) antes del bloque 2?'],
  },
  p08: {
    porque: [
      '**La rodilla manda:** cadencia cómoda, sin fuerza a cadencia baja ni arranques máximos; recomienda fisioterapeuta o médico del deporte.',
      '**Sin test, todo a RPE 3–4** (≤60%): dos años sin entrenar y no sabe usar RPE.',
      '**3 sesiones (~2.2 h) de 4 disponibles,** con días libres entre ellas.',
      '**Peso:** «no prometo cifras ni plazos»; nutriólogo.',
    ],
    cambio: 'Más prudente que antes: tope de 60% (antes, cambios hasta 74%) y dice explícitamente que no promete kilos.',
    revisar: ['¿Muy suave para un exfutbolista de 31 años? ¿4ª sesión desde el inicio?'],
  },
  p09: {
    porque: [
      '**Respeta su semana:** lunes suave, martes 40:20, jueves técnica, sábado umbral, domingo largo; «cambio solo la progresión».',
      '**XCO = repetir esfuerzos arriba del umbral:** 40:20 s y umbral con picos.',
      '**51 años:** descarga cada 3 semanas y nunca dos días duros en 72 h.',
      '**Su FTP (rampa de hace 10 días) se queda** hasta el test de 20 min de la semana 4.',
    ],
    cambio: 'Antes ya iba bien. Ahora lo construye explícitamente sobre su rutina y explica por qué no usa las 9 h (la salida larga es afuera).',
    revisar: ['¿Faltan arranques más cortos (10–15 s) para XCO?'],
  },
  p10: {
    porque: [
      '**Médico primero y metabolismo primero:** diabetes tipo 2 con metformina. Fondo y ritmo suave parejos, sin picos, ≤68%, por RPE (no más de 5–6).',
      '**Parte de lo que ya hace** (~2 h por semana) y sube poco a poco; yoga martes y jueves sin bici.',
      '**«Come algo antes de rodar y lleva algo dulce»:** es una regla escrita del método (prompt), no algo inventado.',
      '**Semana 3 de descarga** (1.6 h).',
    ],
    cambio: 'Antes: un extra «Sin gimnasio hoy» y una frase de técnica de montaña que no aplicaban, y descripciones en masculino. Ahora no hay nada de eso. Arranca con 3 sesiones en lugar de 4.',
    revisar: ['¿Descarga en la semana 3 después de solo 2 semanas de ~2.2 h?'],
  },
};
