# Ronda 2 · ANTES (código del commit 981a517, suite nueva)

Generado por `npm run test:ux:report` el 2026-10-20 02:29 UTC.

**89 pruebas:** 66 pasan · 22 fallan · 1 deuda conocida (se espera que fallen) · 0 inestables.

«Clics» y «campos» son lo que hizo la persona simulada; «esfuerzo» estima los segundos humanos (2.5 s por clic, 5 s por campo, 3 s por pausa a leer y 200 palabras/min en textos largos).

## local/01-sin-cuenta.spec.ts

| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |
|---|---|---|---:|---:|---:|---|
| local | abrir la app por primera vez y rodar en modo demo: ≤ 5 clics | FALLA | 1 | 0 | 6 s | Test timeout of 60000ms exceeded. |
| local | primera vez sin cuenta: bienvenida con un solo camino (rodar), sin promesas de coach | FALLA | 0 | 0 | 0 s | Error: expect(locator).toBeVisible() failed |
| local | ya con algo agendado, la guía de Inicio describe lo que sí hay en pantalla | FALLA | 0 | 0 | 0 s | Test timeout of 60000ms exceeded. |
| local | después de la demo, volver a «Antes de empezar» no graba una sesión falsa | FALLA | 0 | 0 | 0 s | Test timeout of 60000ms exceeded. |
| local | chat sin cuenta: los botones contestan y la pregunta libre explica por qué no hay IA (no «sin conexión») | pasa | 3 | 1 | 13 s |  |
| local | Piñón sin cuenta y sin plan no receta «descansar»: propone empezar | pasa | 2 | 0 | 5 s |  |
| local | sin cuenta, lo que creas sobrevive a recargar la página | FALLA | 0 | 0 | 0 s | Test timeout of 60000ms exceeded. |

## local/02-movil-y-recorrido.spec.ts

| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |
|---|---|---|---:|---:|---:|---|
| local | Escritorio › #/home: título, acción a la vista, sin inglés, sin errores | pasa | 0 | 0 | 0 s |  |
| local | Escritorio › #/plan: título, acción a la vista, sin inglés, sin errores | pasa | 0 | 0 | 0 s |  |
| local | Escritorio › #/library: título, acción a la vista, sin inglés, sin errores | pasa | 0 | 0 | 0 s |  |
| local | Escritorio › #/form: título, acción a la vista, sin inglés, sin errores | pasa | 0 | 0 | 0 s |  |
| local | Escritorio › #/profile: título, acción a la vista, sin inglés, sin errores | pasa | 0 | 0 | 0 s |  |
| local | Escritorio › #/prepare: título, acción a la vista, sin inglés, sin errores | pasa | 0 | 0 | 0 s |  |
| local | Escritorio › #/session: título, acción a la vista, sin inglés, sin errores | pasa | 0 | 0 | 0 s |  |
| local | Escritorio › una ruta que no existe lleva a Inicio | pasa |  |  |  |  |
| local | Celular (iPhone 13) › #/home: sin scroll horizontal | pasa | 0 | 0 | 0 s |  |
| local | Celular (iPhone 13) › #/plan: sin scroll horizontal | pasa | 0 | 0 | 0 s |  |
| local | Celular (iPhone 13) › #/library: sin scroll horizontal | pasa | 0 | 0 | 0 s |  |
| local | Celular (iPhone 13) › #/form: sin scroll horizontal | pasa | 0 | 0 | 0 s |  |
| local | Celular (iPhone 13) › #/profile: sin scroll horizontal | pasa | 0 | 0 | 0 s |  |
| local | Celular (iPhone 13) › #/prepare: sin scroll horizontal | pasa | 0 | 0 | 0 s |  |
| local | Celular (iPhone 13) › #/session: sin scroll horizontal | pasa | 0 | 0 | 0 s |  |
| local | Celular (iPhone 13) › Piñón: el chat se abre en 1 toque, cabe en la pantalla y no tapa la barra de abajo | pasa | 1 | 0 | 3 s |  |

## nube/01-primer-ingreso.spec.ts

| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |
|---|---|---|---:|---:|---:|---|
| nube | Entrar a la app › login con correo y contraseña: 4 interacciones y se ve tu nombre | pasa | 2 | 2 | 15 s |  |
| nube | Entrar a la app › Enter en la contraseña inicia sesión (no obliga a buscar el botón) | pasa | 1 | 2 | 13 s |  |
| nube | Entrar a la app › contraseña equivocada: el error está en español y dice qué hacer | pasa | 2 | 2 | 15 s |  |
| nube | Entrar a la app › campos vacíos: avisa sin llamar al servidor | pasa | 2 | 0 | 5 s |  |
| nube | Entrar a la app › un link profundo sin sesión muestra el login y, al entrar, vuelve a esa pantalla | pasa | 2 | 2 | 15 s |  |
| nube | Bienvenida › la primera pantalla da la bienvenida por nombre, con Piñón y dos caminos claros | FALLA | 2 | 2 | 15 s | Error: expect(locator).toBeVisible() failed |
| nube | Bienvenida › «Rodar 30 min suave ahora»: de la bienvenida a «Antes de empezar» en 1 clic | FALLA | 2 | 2 | 15 s | Test timeout of 60000ms exceeded. |
| nube | Bienvenida › las guías se pueden apagar en 1 clic y no vuelven | pasa | 3 | 2 | 18 s |  |
| nube | Cuestionario inicial › Ana (novata, sin FTP): lo completa y queda claro qué sigue | FALLA | 3 | 2 | 21 s | Test timeout of 60000ms exceeded. |
| nube | Cuestionario inicial › Beto (experimentado): lo completa y queda claro qué sigue | FALLA | 3 | 2 | 21 s | Test timeout of 60000ms exceeded. |
| nube | Cuestionario inicial › guiado por Piñón: un paso a la vez, con progreso y ≤ 8 preguntas por pantalla | FALLA | 3 | 2 | 21 s | Test timeout of 60000ms exceeded. |
| nube | Cuestionario inicial › Piñón cambia de tono al elegir el sexo y «Atrás» conserva lo contestado | FALLA | 3 | 2 | 21 s | Test timeout of 60000ms exceeded. |
| nube | Cuestionario inicial › si falta un dato, lo señala en el campo (no solo un texto al pie) | FALLA | 3 | 2 | 21 s | Test timeout of 60000ms exceeded. |
| nube | Cuestionario inicial › «Saltar por ahora» no te deja atorada: la app sigue usable y el camino al plan sigue ahí | FALLA | 3 | 2 | 21 s | Test timeout of 60000ms exceeded. |

## nube/02-pinon-chat.spec.ts

| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |
|---|---|---|---:|---:|---:|---|
| nube | Llegar a Piñón › desde home: ≤ 3 clics para empezar a hablar | pasa | 1 | 0 | 3 s |  |
| nube | Llegar a Piñón › desde plan: ≤ 3 clics para empezar a hablar | pasa | 1 | 0 | 3 s |  |
| nube | Llegar a Piñón › desde form: ≤ 3 clics para empezar a hablar | pasa | 1 | 0 | 3 s |  |
| nube | Llegar a Piñón › desde library: ≤ 3 clics para empezar a hablar | pasa | 1 | 0 | 3 s |  |
| nube | Llegar a Piñón › desde profile: ≤ 3 clics para empezar a hablar | pasa | 2 | 0 | 8 s | UX-PIN-1: En «profile» no hay botón de Piñón. |
| nube | Llegar a Piñón › desde session: ≤ 3 clics para empezar a hablar | pasa | 2 | 0 | 8 s | UX-PIN-1: En «session» no hay botón de Piñón. |
| nube | Llegar a Piñón › el chat se ve completo y el saludo dice qué puede hacer Piñón | pasa | 1 | 0 | 3 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › nueva · «¿Qué toca hoy?» | pasa | 2 | 0 | 5 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › nueva · «¿Cómo voy esta semana?» | pasa | 2 | 0 | 5 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › nueva · «¿Cómo está mi forma?» | pasa | 2 | 0 | 5 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › nueva · «¿Para qué sirve el entreno de hoy?» | pasa | 2 | 0 | 5 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › nueva · «Dame ánimo» | pasa | 2 | 0 | 5 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › con-entreno · «¿Qué toca hoy?» | pasa | 2 | 0 | 5 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › con-entreno · «¿Cómo voy esta semana?» | pasa | 2 | 0 | 5 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › con-entreno · «¿Cómo está mi forma?» | pasa | 2 | 0 | 5 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › con-entreno · «¿Para qué sirve el entreno de hoy?» | pasa | 2 | 0 | 5 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › con-entreno · «Dame ánimo» | pasa | 2 | 0 | 5 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › con-entreno · «¿Qué toca hoy?» lleva a rodar en 1 clic más | pasa | 3 | 0 | 8 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › nueva · «¿Qué toca hoy?» sin nada agendado ofrece un siguiente paso | pasa | 2 | 0 | 5 s |  |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › el botón de cansancio habla en neutro (no da por hecho el género) | pasa | 1 | 0 | 3 s |  |
| nube | Preguntas abiertas (IA) › pregunta libre: indicador de «escribiendo», 1 llamada con contexto, respuesta visible | pasa | 2 | 1 | 10 s |  |
| nube | Preguntas abiertas (IA) › la misma pregunta dos veces no vuelve a gastar IA (caché) | pasa | 3 | 2 | 18 s |  |
| nube | Preguntas abiertas (IA) › pedir un cambio de plan: lo contesta sin IA y manda a quien sí lo cambia | pasa | 2 | 1 | 10 s |  |
| nube | Preguntas abiertas (IA) › doble clic en Enviar manda una sola pregunta | pasa | 1 | 1 | 8 s |  |
| nube | Preguntas abiertas (IA) › el límite de 200 caracteres se ve antes de chocar con él | pasa | 1 | 0 | 3 s |  |
| nube | Cuando la IA falla, la persona no se queda atorada › cuenta sin acceso (403): mensaje en español, botones siguen funcionando | pasa | 4 | 2 | 20 s |  |
| nube | Cuando la IA falla, la persona no se queda atorada › límite diario (429): mensaje en español, botones siguen funcionando | pasa | 4 | 2 | 20 s |  |
| nube | Cuando la IA falla, la persona no se queda atorada › error del servidor (500): mensaje en español, botones siguen funcionando | pasa | 4 | 2 | 20 s |  |
| nube | Cuando la IA falla, la persona no se queda atorada › IA lenta (8 s): se ve que está pensando y llega la respuesta | pasa | 2 | 1 | 10 s |  |
| nube | Cuando la IA falla, la persona no se queda atorada › IA colgada: a los 25 s Piñón avisa y deja seguir (no se queda «escribiendo» para siempre) | pasa | 2 | 1 | 10 s |  |
| nube | Ir y volver › el chat sigue abierto al pasar a Plan y la conversación se conserva al cerrarlo y abrirlo | pasa | 5 | 0 | 13 s |  |
| nube | Ir y volver › Esc cierra el chat y regresa el foco al botón de Piñón | pasa | 1 | 0 | 3 s |  |

## nube/03-coach-ia.spec.ts

| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |
|---|---|---|---:|---:|---:|---|
| nube | Crear mi plan › perfil completo: de Inicio a plan creado en ≤ 8 interacciones | pasa | 7 | 1 | 23 s |  |
| nube | Crear mi plan › los días disponibles se distinguen (martes ≠ miércoles) | pasa | 1 | 0 | 3 s |  |
| nube | Crear mi plan › mientras piensa no muestra siglas técnicas (CTL/ATL/TSB) | pasa | 3 | 1 | 13 s |  |
| nube | Crear mi plan › perfil incompleto: el cuestionario se abre en medio y al guardar sigue directo a «Crear tu plan» | FALLA | 1 | 0 | 3 s | Error: expect(locator).toBeVisible() failed |
| nube | Crear mi plan › cuenta sin acceso al coach: se avisa ANTES de pedirle el cuestionario | deuda | 0 | 0 | 0 s |  |
| nube | Crear mi plan › cuenta sin acceso: mide el esfuerzo tirado hasta enterarse | FALLA | 1 | 0 | 3 s | Error: expect(locator).toBeVisible() failed |
| nube | Crear mi plan › servidor caído (502): mensaje en español y se puede reintentar sin re-escribir | pasa | 4 | 1 | 15 s |  |
| nube | Crear mi plan › error sin cuerpo (500): mensaje en español y se puede reintentar sin re-escribir | pasa | 4 | 1 | 15 s |  |
| nube | Crear mi plan › doble clic en «Crear plan» manda una sola petición (no gasta 2 de 3 del mes) | pasa | 2 | 1 | 10 s |  |
| nube | Con plan activo › Plan muestra la meta y acciones claras; Inicio dice qué toca hoy | pasa | 1 | 0 | 3 s |  |

## nube/04-volver-a-rodar.spec.ts

| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |
|---|---|---|---:|---:|---:|---|
| nube | Beto vuelve con entreno hoy: Inicio → conectar rodillo en 1 clic | pasa | 1 | 0 | 3 s |  |
| nube | Beto vuelve tras 6 días sin rodar: Piñón lo recibe sin regañar | pasa | 0 | 0 | 0 s |  |

## nube/05-decisiones.spec.ts

| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |
|---|---|---|---:|---:|---:|---|
| nube | Género según el perfil › ana: Piñón concuerda («Vienes cargada») | FALLA | 2 | 0 | 5 s | Error: expect(received).toContain(expected) // indexOf |
| nube | Género según el perfil › beto: Piñón concuerda («Vienes cargado») | pasa | 2 | 0 | 5 s |  |
| nube | Género según el perfil › la guía de Forma y la tarjeta de forma también concuerdan | FALLA | 0 | 0 | 0 s | Error: expect(received).toContain(expected) // indexOf |
| nube | Piñón en el Resumen › comenta la sesión en el género del perfil, ofrece el chat y la sesión abre por enlace | FALLA | 0 | 0 | 0 s | Error: expect(locator).toContainText(expected) failed |
| nube | Lista de espera › sin invitación: se apunta en 2 campos y queda claro qué sigue | FALLA | 0 | 0 | 0 s | Test timeout of 60000ms exceeded. |
| nube | Lista de espera › correo mal escrito: avisa en español y no manda nada | FALLA | 0 | 0 | 0 s | Test timeout of 60000ms exceeded. |
| nube | Lista de espera › si ya estaba apuntado, la respuesta es la misma (no revela quién está) | FALLA | 0 | 0 | 0 s | Test timeout of 60000ms exceeded. |
| nube | Lista de espera › desde la lista de espera se vuelve al login en 1 clic | FALLA | 0 | 0 | 0 s | Test timeout of 60000ms exceeded. |

