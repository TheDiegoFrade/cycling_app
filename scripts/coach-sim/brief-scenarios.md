| # | Disciplina × perfil | Datos del dummy | Retro semana 1 | Prueba de ruptura asignada |
|---|---|---|---|---|
| 1 | XCO × novato | 24 años, 70 kg, sin FTP, sin FC máx conocida, 5 h/sem, cadencia natural 65-70 rpm, carrera XCO en 12 semanas | Completó todo, le costó mantener 85+ rpm | — |
| 2 | Maratón MTB (tipo Chupacabras) × fondista que se funde | 38 años, 82 kg, sin FTP, 7 h/sem, maratón MTB en 14 semanas, termina rodadas largas pero se funde después de ~2.5 h | Completó todo, FC alta al inicio de la rodada larga | Crear plan sin dar de baja el anterior (`run.json` → `tryDup`) |
| 3 | Ruta × FTP inflado | 33 años, 74 kg, FTP declarado 290 W (de otra app), 8 h/sem, sin evento | En las sesiones de Z2 la FC estuvo en 158-165 bpm y RPE 7/10 | Cambiar FTP (290→250) con plan activo (`run.json` → `ftpChange`, archivos pre/post-ftpchange) |
| 4 | Gravel × poco tiempo | 41 años, 78 kg, FTP 230 W, 3 × 45 min entre semana + 1 salida de 2 h el sábado, gravel de 120 km en 10 semanas | Completó todo | Corrida 2: dar de baja y crear inmediatamente varias veces + dos create_plan simultáneos (`out/s04-r2/rapid.json`) |
| 5 | Enduro × explosivo sin fondo | 29 años, 72 kg, FTP 240 W, buenos esfuerzos de 1-5 min, se apaga después de 90 min, 5 h/sem, enduro en 10 semanas | Completó todo, la sesión larga se le hizo muy pesada | — |
| 6 | Bajar de peso × sin banda de FC | 45 años, 95 kg, sin FTP, sin banda de FC, 4 h/sem, quiere bajar 10 kg | Completó todo | Valores extremos / vacíos (`out/s06-r1/extreme.json` y `extreme-*`) |
| 7 | Clase tipo spinning × desestrés | 35 años, mujer, 62 kg, sin FTP, 3-4 × 45 min, le gustan las clases de indoor cycling con música, sin meta de rendimiento | Hizo 2 de 4 sesiones, dice que se aburrió en las sesiones planas | — |
| 8 | Gran fondo × master en altitud | 56 años, 76 kg, FTP 210 W, vive en Toluca (~2,600 m), gran fondo a nivel del mar en 12 semanas, 6 h/sem | Completó todo, cansancio acumulado al final de la semana | — |
| 9 | Maratón MTB × diésel | 44 años, 80 kg, FTP 220 W, aguanta 5 h a baja intensidad sin problema, se queda en subidas y cambios de ritmo, 9 h/sem, maratón en 12 semanas | Completó todo, la sesión de intervalos se le hizo muy dura | — |
| 10 | Ruta × FTP sólido, aeróbico dudoso | 30 años, 68 kg, FTP 265 W, 7 h/sem, buen rendimiento en intervalos pero la FC deriva mucho en rodadas de más de 2 h | Completó todo, desacople de FC ~9% en la rodada larga | — |
| 11 | Triatlón × hace otro deporte | 37 años, 70 kg, FTP 240 W, corre 3 veces por semana y nada 2, 70.3 en 16 semanas, 6 h/sem de bici | Completó la bici, piernas cargadas por las carreras | — |
| 12 | Maratón MTB × regresa de lesión | 39 años, 75 kg, FTP 250 W de hace 6 meses, 2 meses sin rodar por lesión ya dada de alta, 6 h/sem | Completó todo, la sesión de umbral se sintió casi imposible | — |
| 13 | Ruta × sobreentrenado | 34 años, 71 kg, FTP 260 W, 12 h/sem, FC en reposo 8 bpm arriba de lo normal, duerme mal, rendimiento bajando | No pudo terminar 2 sesiones, sigue durmiendo mal | — |
| 14 | Ultra / bikepacking × mixto indoor-outdoor | 42 años, 77 kg, FTP 220 W, rodillo entre semana y salida larga de 4-5 h el fin de semana, ultra de 300 km en 16 semanas | Completó todo, salida del sábado de 5 h subida como archivo | — |
| 15 | Criterium × poco tiempo | 27 años, 66 kg, FTP 255 W, 4 × 1 h/sem, criteriums en 8 semanas | Completó todo | — |
| 16 | Gran fondo × betabloqueadores | 58 años, 84 kg, sin FTP, toma betabloqueadores (anótalo en notas), 5 h/sem | Completó todo, FC muy baja para el esfuerzo percibido | — |
| 17 | XCO × sobremotivado | 26 años, 73 kg, sin FTP, 3 meses rodando, pide explícitamente 15 h/sem | Completó todo, muy cansado | — |
| 18 | XCO × menor de edad | 15 años, 55 kg, sin FTP, 8 h/sem, quiere competir | Completó todo | — |
| 19 | Ruta × datos contradictorios | 40 años, 70 kg, FTP 320 W, pero potencias máximas de 20 min de 210 W, FC máx declarada 230 bpm | Completó todo | — |
| 20 | Gravel × inconsistente | 36 años, 79 kg, FTP 225 W, 6 h/sem, gravel en 12 semanas | Faltó al 40% de las sesiones por trabajo | — |
| 21 | Sin meta clara × novato | 31 años, 68 kg, sin FTP, 4 h/sem, objetivo: "quiero estar más fuerte" | Completó todo | — |

En todos los escenarios se revisa además que los correos correspondan al plan correcto y que fechas y zonas horarias cuadren (sesiones en los días elegidos, fechas correctas en correos).
