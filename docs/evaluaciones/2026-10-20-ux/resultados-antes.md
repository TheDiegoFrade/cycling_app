# Resultados ANTES de los arreglos (main en d1ec0f4)

Generado por `npm run test:ux:report` el 2026-10-20 01:34 UTC.

**77 pruebas:** 57 pasan · 18 fallan · 2 deuda conocida (se espera que fallen) · 0 inestables.

«Clics» y «campos» son lo que hizo la persona simulada; «esfuerzo» estima los segundos humanos (2.5 s por clic, 5 s por campo, 3 s por pausa a leer y 200 palabras/min en textos largos).

## local/01-sin-cuenta.spec.ts

| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |
|---|---|---|---:|---:|---:|---|
| local | abrir la app por primera vez y rodar en modo demo: ≤ 5 clics | pasa | 3 | 0 | 11 s |  |
| local | la guía de Inicio describe lo que sí hay en pantalla | FALLA | 0 | 0 | 0 s | Error: expect(locator).toBeVisible() failed |
| local | después de la demo, volver a «Antes de empezar» no graba una sesión falsa | FALLA | 2 | 0 | 5 s | Error: expect(locator).toBeDisabled() failed |
| local | chat sin cuenta: los botones contestan y la pregunta libre explica por qué no hay IA (no «sin conexión») | FALLA | 3 | 1 | 13 s | Error: expect(locator).not.toContainText(expected) failed |
| local | Piñón sin cuenta y sin plan no receta «descansar»: propone empezar | FALLA | 2 | 0 | 5 s | Error: expect(received).not.toMatch(expected) |

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
| local | Celular (iPhone 13) › Piñón: el chat se abre en 1 toque, cabe en la pantalla y no tapa la barra de abajo | FALLA | 0 | 0 | 0 s | Error: Piñón encima de la barra de pestañas |

## nube/01-primer-ingreso.spec.ts

| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |
|---|---|---|---:|---:|---:|---|
| nube | Entrar a la app › login con correo y contraseña: 4 interacciones y se ve tu nombre | pasa | 2 | 2 | 15 s |  |
| nube | Entrar a la app › Enter en la contraseña inicia sesión (no obliga a buscar el botón) | FALLA | 1 | 2 | 13 s | Error: expect(locator).toBeVisible() failed |
| nube | Entrar a la app › contraseña equivocada: el error está en español y dice qué hacer | FALLA | 2 | 2 | 15 s | Error: textos en inglés |
| nube | Entrar a la app › campos vacíos: avisa sin llamar al servidor | pasa | 2 | 0 | 5 s |  |
| nube | Entrar a la app › un link profundo sin sesión muestra el login y, al entrar, vuelve a esa pantalla | pasa | 2 | 2 | 15 s |  |
| nube | Bienvenida › la primera pantalla saluda por nombre, dice qué falta y la guía de Piñón no promete un botón que no existe | FALLA | 2 | 2 | 15 s | Error: la guía menciona «Empezar a rodar» y el botón no existe |
| nube | Bienvenida › las guías se pueden apagar en 1 clic y no vuelven | pasa | 3 | 2 | 18 s |  |
| nube | Cuestionario inicial › Ana (novata, sin FTP): lo completa y queda claro qué sigue | FALLA | 25 | 9 | 265 s | Error: expect(page).toHaveURL(expected) failed |
| nube | Cuestionario inicial › Beto (experimentado): lo completa y queda claro qué sigue | FALLA | 23 | 11 | 270 s | Error: expect(page).toHaveURL(expected) failed |
| nube | Cuestionario inicial › meta dura: el cuestionario cuesta ≤ 90 s de esfuerzo | deuda | 25 | 9 | 265 s |  |
| nube | Cuestionario inicial › si falta un dato, lo señala en el campo (no solo un texto al pie) | FALLA | 6 | 2 | 28 s | Error: expect(locator).toBeVisible() failed |
| nube | Cuestionario inicial › «Saltar por ahora» no te deja atorada: la app sigue usable y el aviso sigue ahí | pasa | 5 | 2 | 26 s |  |

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
| nube | Botones rápidos: al instante, con datos, sin gastar IA › nueva · «¿Qué toca hoy?» sin nada agendado ofrece un siguiente paso | FALLA | 2 | 0 | 5 s | Error: expect(locator).toBeVisible() failed |
| nube | Botones rápidos: al instante, con datos, sin gastar IA › el botón de cansancio habla en neutro (no da por hecho el género) | FALLA | 1 | 0 | 3 s | Error: expect(received).toEqual(expected) // deep equality |
| nube | Preguntas abiertas (IA) › pregunta libre: indicador de «escribiendo», 1 llamada con contexto, respuesta visible | pasa | 2 | 1 | 10 s |  |
| nube | Preguntas abiertas (IA) › la misma pregunta dos veces no vuelve a gastar IA (caché) | pasa | 3 | 2 | 18 s |  |
| nube | Preguntas abiertas (IA) › pedir un cambio de plan: lo contesta sin IA y manda a quien sí lo cambia | pasa | 2 | 1 | 10 s |  |
| nube | Preguntas abiertas (IA) › doble clic en Enviar manda una sola pregunta | pasa | 1 | 1 | 8 s |  |
| nube | Preguntas abiertas (IA) › el límite de 200 caracteres se ve antes de chocar con él | pasa | 1 | 0 | 3 s |  |
| nube | Cuando la IA falla, la persona no se queda atorada › cuenta sin acceso (403): mensaje en español, botones siguen funcionando | pasa | 4 | 2 | 20 s |  |
| nube | Cuando la IA falla, la persona no se queda atorada › límite diario (429): mensaje en español, botones siguen funcionando | pasa | 4 | 2 | 20 s |  |
| nube | Cuando la IA falla, la persona no se queda atorada › error del servidor (500): mensaje en español, botones siguen funcionando | pasa | 4 | 2 | 20 s |  |
| nube | Cuando la IA falla, la persona no se queda atorada › IA lenta (8 s): se ve que está pensando y llega la respuesta | pasa | 2 | 1 | 10 s |  |
| nube | Cuando la IA falla, la persona no se queda atorada › IA colgada: a los 25 s Piñón avisa y deja seguir (no se queda «escribiendo» para siempre) | FALLA | 2 | 1 | 10 s | Error: expect(locator).toBeHidden() failed |
| nube | Ir y volver › el chat sigue abierto al pasar a Plan y la conversación se conserva al cerrarlo y abrirlo | pasa | 5 | 0 | 13 s |  |
| nube | Ir y volver › Esc cierra el chat y regresa el foco al botón de Piñón | pasa | 1 | 0 | 3 s |  |

## nube/03-coach-ia.spec.ts

| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |
|---|---|---|---:|---:|---:|---|
| nube | Crear mi plan › perfil completo: de Inicio a plan creado en ≤ 8 interacciones | FALLA | 7 | 1 | 23 s | Error: expect(locator).toContainText(expected) failed |
| nube | Crear mi plan › los días disponibles se distinguen (martes ≠ miércoles) | FALLA | 1 | 0 | 3 s | Error: etiquetas: L M M J V S D |
| nube | Crear mi plan › mientras piensa no muestra siglas técnicas (CTL/ATL/TSB) | FALLA | 3 | 1 | 13 s | Error: expect(received).toEqual(expected) // deep equality |
| nube | Crear mi plan › perfil incompleto: el cuestionario se abre en medio y al guardar sigue directo a «Crear tu plan» | pasa | 22 | 7 | 244 s |  |
| nube | Crear mi plan › cuenta sin acceso al coach: se avisa ANTES de pedirle el cuestionario | deuda | 0 | 0 | 0 s |  |
| nube | Crear mi plan › cuenta sin acceso: mide el esfuerzo tirado hasta enterarse | pasa | 24 | 8 | 254 s | UX-08: Tras 32 interacciones (~254 s) la persona se entera de que su cuenta no tiene coach. |
| nube | Crear mi plan › servidor caído (502): mensaje en español y se puede reintentar sin re-escribir | pasa | 4 | 1 | 15 s |  |
| nube | Crear mi plan › error sin cuerpo (500): mensaje en español y se puede reintentar sin re-escribir | FALLA | 3 | 1 | 13 s | Error: error en inglés |
| nube | Crear mi plan › doble clic en «Crear plan» manda una sola petición (no gasta 2 de 3 del mes) | pasa | 2 | 1 | 10 s |  |
| nube | Con plan activo › Plan muestra la meta y acciones claras; Inicio dice qué toca hoy | pasa | 1 | 0 | 3 s |  |

## nube/04-volver-a-rodar.spec.ts

| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |
|---|---|---|---:|---:|---:|---|
| nube | Beto vuelve con entreno hoy: Inicio → conectar rodillo en 1 clic | pasa | 1 | 0 | 3 s |  |
| nube | Beto vuelve tras 6 días sin rodar: Piñón lo recibe sin regañar | pasa | 0 | 0 | 0 s |  |

