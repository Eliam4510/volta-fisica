# Progreso

Memoria de trabajo entre sesiones. Prioridad: bugs que rompen > exactitud
física > funciones faltantes > rendimiento > pulido.

## Estado actual

- Versión: 0.7.0 (publicada el 2026-11-19 con sus dos ejecutables; la 0.5.0 quedó sin ejecutables)
- Repo: https://github.com/Eliam4510/volta-fisica
- Lenguaje de diseño, iconos, guía y pantallas de Inicio, Mecánica,
  Electrostática, Termodinámica y Gravitación: hechos (ver `docs/04_lenguaje_de_diseno.md`).
- Circuitos (pantalla «Transitorios», 56 pruebas) integrado y enlazado.
- Laboratorio de Mecánica integrado.
- Óptica integrado (geométrica, interferencia y difracción, películas e
  interferómetros; 51 pruebas, 15 escenas MEXT). Falta: espejo parabólico,
  polarización, polígono y capas en la paleta, Michelson con luz blanca.
- Agentes en curso (2026-11-19 05:20), cada uno con sus archivos:
  - Magnetismo e inducción (`motores/magnetismo.js`,
    `pruebas/magnetismo.test.js`, `lienzo/dominios/magnetismo.js`,
    `prototipos/magnetismo*.html|js`; espacios `campos`, `particulas`,
    `induccion`).
  - Termodinámica: escenas MEXT y espacios nuevos (`motores/gas.js` y
    motores nuevos, `prototipos/termodinamica*.html|js`).
  - Electrostática: escenas MEXT y quizá «Conductores y dieléctricos»
    (`motores/electrostatica.js`, `prototipos/electrostatica*.html|js`).
  Al integrar cada uno: revisar suite, tipos y capturas; MODULOS en
  `componentes/espacio.js`; PANTALLAS y ESPACIOS en Inicio; conteos reales
  de la tarjeta; README; CHANGELOG.
- Los conteos de las tarjetas de Inicio son a mano: actualizarlos al añadir
  espacios o escenas MEXT.
- Ondas y sonido integrado (Medio 1D y Doppler y acústica). Falta la cubeta 2D, el pistón móvil y la escena MEXT 2012 del ventilador.
- Escenas MEXT del Laboratorio integradas: 24 escenas MEXT con prueba cada
  una. Sin representar: 2016 P3 (fricción entre dos cuerpos móviles),
  2006 1-(1) (fuerza que depende de la posición), 2025 T2 (sin enunciado),
  estática (M9, necesita cuerpo rígido), fluidos (M10), movimiento relativo
  (M11) y cinemática pura (M1, gráficas v-t prescritas).

## Pendiente (ordenado)

### Fase 0 (hecha)
- [x] Fuentes locales (OFL) en lugar de Google Fonts.
- [x] Andamiaje Tauri 2 + icono de la aplicación (compila en local: 1.75 MiB).
- [x] Vitest: 47 pruebas (formato, motor de proyectiles, integridad, versión).
- [x] CI: pruebas en cada push; compilación Windows; ejecutables en cada release.
- [x] README, CHANGELOG, LICENSE; repo público; release v0.1.0.

### Plataforma
- [x] `sistema/nucleo/formato.js` con pruebas.
- [x] Integradores en `sistema/nucleo/integradores.js` (DOPRI5, RK4, Verlet, Brent); falta Boris (Magnetismo).
- [x] Pruebas de exactitud: caída libre, tiro, rebotes, oscilador armónico, deriva a 100 s.
- [x] Guardar, abrir y autoguardar escenas (`.volta`) — Mecánica, Termodinámica, Electrostática, Gravitación e Inicio.
- [x] Exportar CSV y PNG — Mecánica, Termodinámica, Electrostática, Gravitación.
- [x] Deshacer y rehacer — Mecánica.
- [x] `nucleo/unidades.js`: campos con unidades y expresiones, análisis dimensional (Mecánica, Electrostática, Gravitación).
- [x] Diálogos nativos de Windows para guardar, exportar y abrir.
- [x] `npm run tipos` (TypeScript sobre núcleo y motores).
- [x] `npm run tipos` en CI.

### Mecánica
- [x] Motor de proyectiles extraído (`sistema/motores/proyectiles.js`) con pruebas
  contra 2019 P3, 2019 1-(2), lanzamiento oblicuo y balance de energía.
- [x] Motor general (`motores/mecanica.js`): contactos, cuerdas, varillas, poleas, resortes, fricción, clavos, choques; 15 pruebas analíticas.
- [x] Laboratorio de Mecánica (`mecanica-laboratorio.html`): caja de arena sobre el motor general, 14 escenarios, 19 pruebas.
- [x] Laboratorio: fuerza aplicada constante (con U_F en el balance).
- [x] Laboratorio: duplicar (Ctrl+D).
- [ ] Laboratorio: panel de variables, instrumentos (regla, fotopuerta), cuerpos rígidos.

### Otros módulos
- [x] Motor de Termodinámica extraído (`motores/gas.js`, 27 pruebas; corrigió un error del balance en el evento de dejar los topes).
- [x] Motor de Electrostática + `nucleo/integradores.js` (59 pruebas).
- [x] Gravitación: motor (40 pruebas) y pantalla «Órbitas» con cinco escenas.
- [x] Circuitos: motor nodal con transitorios (56 pruebas) y pantalla «Transitorios» con cinco escenarios.
- [x] Ondas y sonido: motor (66 pruebas), «Medio 1D» y «Doppler y acústica».
- [ ] Ondas: cubeta 2D (WebGL2), pistón que se mueve durante la simulación.
- [x] Óptica: motor (51 pruebas) y tres espacios.
- [ ] Magnetismo e inducción (agente en curso), Física moderna.

## Autocrítica 1 (2026-11-19 01:05)

Comparado con Box2D v3 (Soft Step, subpasos, CCD híbrido, sueño por islas),
MuJoCo (integradores Euler/implicitfast/RK4, contacto blando convexo) y la
literatura de sistemas híbridos (detección de eventos, Zeno):

| Prioridad | Hallazgo | Tarea |
|---|---|---|
| Hecho | Con e ≈ 1 el motor agotaba eventos y la partícula quedaba congelada (Zeno) | Regla post-Zeno con prueba (v0.2.0) |
| Hecho | Deshacer y rehacer de Mecánica no hacían nada | Historial (v0.2.0) |
| Hecho | La paleta de objetos de Mecánica no colocaba nada | Lleva al Laboratorio; instrumentos pendientes |
| Hecho | Mecánica solo resolvía una partícula con fórmulas | Motor general con DOPRI5 + eventos |
| Hecho | Péndulo con integral elíptica, choques 2D | Pruebas en `pruebas/mecanica.test.js` |
| Hecho | Conservación del momento | Pruebas de choques 1D y 2D |
| Función | Sin modo multitud: no hay fase amplia de colisiones (rejilla uniforme o barrido y poda) ni fase estrecha (círculo-segmento, SAT) | Diseñar el modo multitud con paso fijo y subpasos (estilo Soft Step) |
| Hecho | Campos numéricos sin unidades ni expresiones | `nucleo/unidades.js` (Mecánica); falta llevarlo a los demás módulos |
| Función | Exportar CSV y guardar escenas solo en Mecánica | Llevarlo a Electrostática, Termodinámica y Gravitación |
| Rendimiento | Sin pruebas de rendimiento | `vitest bench` de los motores |
| Hecho | Guardado con descarga del navegador | Diálogos nativos (tauri-plugin-dialog y fs) |

## Autocrítica 2 (2026-11-19, tras los ciclos de Electrostática y choques)

Comparado con Box2D v3 (Soft Step, contactos especulativos, árbol de AABB,
islas que duermen), Bullet y PhysX (cuerpos rígidos con rotación, LCP por
Gauss–Seidel proyectado, CCD) y MuJoCo (contacto blando convexo con
regularización):

| Prioridad | Hallazgo | Tarea |
|---|---|---|
| Hecho | Efecto túnel con partículas rápidas; choques simultáneos perdidos; el radio no contaba contra superficies; una partícula apoyada atravesaba paredes | Paso acotado por rapidez, impulsos secuenciales, varios apoyos por partícula (pruebas en `mecanica.test.js`) |
| Exactitud | La estabilización de Baumgarte deja ≈ 2·10⁻⁶·E0 de deriva de energía en un montón de discos (era 2·10⁻³ antes de soltar los apoyos que se separan) | Post-estabilización (proyectar posiciones y velocidades sobre las restricciones activas al iniciar cada tramo; Cline y Pai, 2003) |
| Exactitud | Las restricciones unilaterales se resuelven como igualdades. Con filas repetidas (varilla y cuerda iguales) el pivote nulo las descarta bien (prueba en `mecanica.test.js`); con sistemas casi singulares el reparto de reacciones podría ser arbitrario | Si aparece un caso real: regularizar (A + εI, como el CFM de ODE y MuJoCo) o resolver un LCP (Gauss–Seidel proyectado) |
| Rendimiento | Un montón inelástico de 10 discos genera ≈ 5000 eventos en 5 s; los eventos de pares son O(n²) por paso | Fase amplia (rejilla uniforme) para candidatos a choque; reposo agrupado (islas que duermen); modo multitud de paso fijo |
| Función | Los discos no giran: no hay rodadura ni fricción entre discos | Rotación con momento de inercia y fricción en el contacto disco-disco |
| Hecho | Gravitación no guardaba escenas `.volta`; Electrostática y Gravitación no aceptaban unidades en los campos | `archivos.js` y `unidades.js` en ambas pantallas |
| Hecho | No había pruebas de rendimiento | `npm run banco` (`pruebas/rendimiento/`). Referencia 2026-11-19, Ryzen de escritorio: proyectil 0.9 µs; péndulo con clavo 2 s 7.4 ms; Atwood 1 s 4.5 ms; 12 discos 5 s 24 ms; 24 discos con gravedad 5 s 104 ms; gas 5 s 2.3 ms; cargas 6.5 s 1.0 ms; satélite 2 órbitas 3.6 ms |
| Hecho | Mecánica daba muchos pasos por el tope fijo duración/400 | El tope solo se aplica con clavos (Atwood 1 s: de 4.5 ms a 0.8 ms); caché de `dinamica` compartida por f y los eventos. Pendiente: eventos del clavo continuos para quitarlo también ahí |
| Hecho | Un apoyo que se perdía en un instante por otra causa (unión plano-suelo, impulso que separa) no quedaba registrado | Diferencia de restricciones activas antes y después de cada instante; prueba de la unión plano-suelo con tres pasos distintos |
| Pulido | La etiqueta del eje vertical queda bajo la barra de capas (`trazo.ejes`); los subíndices de v_c y v_e se confunden a 10 px; falta favicon | Corregir en las piezas compartidas cuando no haya agentes usándolas |

## Autocrítica 3 (2026-11-19, tras integrar el Laboratorio)

Comparado con cajas de arena de física (Algodoo, PhET «Forces and Motion» y
«Collision Lab», el banco de pruebas de Box2D) y con Logger Pro para el
análisis de datos:

| Prioridad | Hallazgo | Tarea |
|---|---|---|
| Función | El Laboratorio solo tiene partículas y discos que no giran: no hay bloques que vuelquen ni rodadura (Algodoo, Box2D) | Motor de cuerpo rígido 2D (disco y rectángulo con rotación, fricción en el contacto y rodadura sin deslizar), validado contra I·α = τ y rodadura en un plano |
| Hecho | Las gráficas del Laboratorio eran fijas | Magnitud elegible por gráfica (x, y, vx, vy, \|v\|) y trayectoria y contra x; faltan aceleración y elegir partícula por gráfica |
| Función | Sin instrumentos en el Laboratorio (regla, cronómetro, fotopuerta, transportador), que PhET sí tiene | Instrumentos con su lectura en el lienzo |
| Función | Sin panel de variables en el Laboratorio: no se puede ligar una magnitud a una variable ni barrerla con un deslizador | Variables ligadas como en Electrostática |
| Rendimiento | Montones de discos inelásticos: miles de eventos | Reposo agrupado (islas que duermen) |
| Hecho (2026-11-19, ver DECISIONES 14) | Los contactos se resuelven como igualdades: en una pila con varios apoyos, alguna fuerza de contacto sale negativa, el par se suelta y vuelve a chocar sin fin (con `umbral` = 0.03 m/s, 10 discos agotan el cálculo). Ya hay presupuesto de pasos y de reloj para que no bloquee | Resolver los contactos como un LCP (conjunto activo o Gauss–Seidel proyectado) para que λ ≥ 0 y la aceleración relativa ≥ 0 se cumplan a la vez. Probado (2026-11-19) soltar solo el apoyo más negativo por vuelta en `revisarDespegues`: empeora (más apoyos activos hacen oscilar los eventos λ → 0 dentro de los tramos y el montón por defecto no termina). Hace falta el LCP dentro de `dinamica` con eventos de cambio del conjunto activo, no solo en los instantes de evento |
| Hecho en parte | Deriva de Baumgarte ≈ 2·10⁻⁶·E0 en montones | Post-estabilización de los solapes al iniciar cada tramo (no de las cuerdas: cruzaba la frontera del clavo). Queda sin anotar la energía que disipa Baumgarte al cerrar el hueco de un contacto persistente (≈ 3·10⁻⁵·E0 con umbral 0.03; el Laboratorio la muestra igual porque calcula la disipada como E0 − E) |
| Hecho | Fuerza aplicada constante sin balance de energía | U_F = −F·r en `energiaMecanica` |
| Hecho | Navegación entre módulos y espacios inexistente | Menús en las migas (`espacio.js`) |

## Autocrítica 4 (2026-11-19 05:45, tras el LCP de contactos y las escenas de Gravitación)

Comparado con Box2D v3 (Soft Step con relajación, islas que duermen,
fricción y rodadura de cuerpos rígidos), Bullet y PhysX (cuerpos rígidos con
conos de fricción, solver por bloques), MuJoCo (contacto convexo regularizado
con energía y trabajo de las restricciones contabilizados) y, para el
contenido, PhET y el temario MEXT:

| Prioridad | Hallazgo | Tarea |
|---|---|---|
| Hecho | Apoyos redundantes daban reacciones arbitrarias y montones que no terminaban | LCP en los instantes, regularización con refinamiento, impulsos simultáneos (DECISIONES 14) |
| Hecho en parte | Cuerpos que llevan a otros encima (superficies `sobre` un cuerpo, movimiento impuesto; MEXT 2016 P3 y 2006 1-(1)). Siguen sin girar los discos ni haber bloques que vuelquen (M9 estática) | Cuerpo rígido 2D (disco y rectángulo con rotación, fricción de Coulomb en el contacto con cono y adherencia, rodadura). Es lo que más escenas MEXT de Mecánica desbloquea |
| Exactitud | La energía que disipa la estabilización (y la fricción, el arrastre y los amortiguadores) no se anota: solo se ve como E0 − E | Integrar la potencia de las fuerzas no conservativas y de las restricciones como una componente más del estado, para que E + disipada sea constante a la tolerancia del integrador |
| Contenido | Escenas MEXT por módulo muy desiguales: Termodinámica 1 de 30 y Electrostática 1 de 18 | Agentes en curso para ambos módulos |
| Rendimiento | Un montón de 12 discos con un golpe tarda ≈ 0.3 s; 100 discos no son viables con eventos | Modo multitud de paso fijo (Soft Step) aparte, sin tocar el motor de eventos |
| Hecho | Las marcas de los ejes de las gráficas se cortaban a la izquierda con valores grandes (r en Mm alrededor del Sol); v_c y v_e se confundían a 10 px | Margen según la marca más ancha (`grafica.js`), Gm alrededor del Sol, subíndices de las lecturas a 0.76 em |

## Autocrítica 5 (2026-11-19, tras superficies móviles, perfiles y prensa)

Comparado con Box2D v3 y PhysX (cuerpos rígidos con rotación, rodadura,
fricción en el contacto entre cuerpos), MuJoCo (energía y trabajo de las
restricciones contabilizados, actuadores con trayectoria impuesta) y PhET
(«Forces and Motion», «Under Pressure», instrumentos en pantalla):

| Prioridad | Hallazgo | Tarea |
|---|---|---|
| Hecho | Energía: solo se contaban los choques | Qc, Qi y W en el estado; E + Qc + Qi = E0 + W a 10⁻¹⁰ (como el registro de energía de MuJoCo) |
| Hecho | No había actuadores ni cuerpos que llevaran a otros | Superficies `sobre` un cuerpo, cinemáticos con perfil de aceleración por tramos (los «position actuators» de MuJoCo, en versión cinemática) |
| Función | Sigue sin haber rotación: los discos no ruedan, la fricción disco-disco no existe y los cuerpos rígidos se arman con triángulos de varillas (sin momento de inercia propio) | Cuerpo rígido 2D con orientación y velocidad angular; rodadura sin deslizar; fricción en el contacto par |
| Función | El perfil de aceleración y la superficie llevada por un cuerpo solo se definen bien en las escenas: el inspector muestra el perfil pero no lo edita | Editor de tramos (tabla t / ax / ay) en el inspector |
| Hecho en parte | El Laboratorio no tenía instrumentos; sigue sin panel de variables (los demás módulos sí) | Regla y fotopuerta hechas; falta el panel de variables y un cronómetro |
| Exactitud | La prensa hidráulica no tiene peso del líquido (sin ρgh): vale para Pascal, no para vasos comunicantes con desnivel | Columna de líquido con peso cuando haga falta (Fluidos M10) |
| Contenido | Mecánica 38 de 44 MEXT; las 6 restantes no tienen enunciado o necesitan sistemas de referencia que se mueven | — |

## Problemas conocidos

- Pendientes del lenguaje de diseño: `docs/04_lenguaje_de_diseno.md`, sección 11.

## Bitácora

- 2026-11-19 00:45 — Inicio del turno autónomo. Repo git propio creado.
- 2026-11-19 00:57 — v0.1.0 publicada; CI de pruebas y release en marcha.
- 2026-11-19 01:12 — v0.2.0 publicada (exportar, escenas, deshacer, Zeno).

## Cómo publicar una versión

1. `python <scratchpad>/version.py X.Y.Z` o editar a mano la versión en
   package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml y
   src-tauri/Cargo.lock (la prueba `pruebas/version.test.js` exige que
   coincidan y que el CHANGELOG tenga la entrada).
2. Mover lo de «Sin publicar» a `## [X.Y.Z] - fecha` en CHANGELOG.md.
3. `npx vitest run`, commit, `git tag -a vX.Y.Z -m "Volta X.Y.Z"`, push del tag.
4. `node herramientas/notas-release.mjs X.Y.Z > notas.md` y
   `gh release create vX.Y.Z --title "Volta X.Y.Z" --notes-file notas.md`.
5. El flujo `release.yml` compila y adjunta instalador y portátil.
6. Comprobar que terminó: `gh run watch <id> --exit-status` y
   `gh release view vX.Y.Z --json assets`. Si falla, no se puede mover la
   etiqueta (sería un push forzado): se corrige y se publica X.Y.(Z+1), y se
   anota en las notas de la versión fallida dónde están los ejecutables
   (pasó con la 0.5.0: una prueba superó el límite de 5 s en Windows).
- 2026-11-19 01:20 — Unidades y expresiones, diálogos nativos, motor de gas; CI separado en pruebas y compilación.
- 2026-11-19 01:50 — Integradores, Electrostática y motor general de Mecánica con pruebas (229). Agentes: gravitación, circuitos, caja de arena de Mecánica.
- 2026-11-19 03:40 — Electrostática con escenas .volta saneadas y exportación con BOM. Motor de Mecánica endurecido: sin efecto túnel, choques simultáneos, contactos entre discos, varios apoyos por partícula, resultado parcial al límite de eventos (301 pruebas). CHANGELOG [Sin publicar] relleno.
  - Pendiente inmediato: revisar y hacer commit de Gravitación (agente terminó: 5 archivos sin seguimiento, 40 pruebas en verde); esperar a los agentes de Circuitos y del Laboratorio de Mecánica; enlazar las tres pantallas desde Inicio; publicar v0.3.0.
  - Conocido: la estabilización de Baumgarte deja ≈ 2·10⁻⁶·E0 de deriva en un montón de discos; mejora posible: proyección de posiciones al iniciar cada tramo. El montón inelástico genera muchos eventos (≈ 5000 en 5 s): falta un modo de reposo agrupado.
- 2026-11-19 04:40 — Gravitación y Circuitos integrados y enlazados desde Inicio; Electrostática y Gravitación con unidades y escenas; banco de rendimiento; etiquetas de ejes fuera de las barras flotantes; autocrítica 2. v0.3.0 publicada (326 pruebas).
- 2026-11-19 05:30 — Laboratorio de Mecánica integrado (caja de arena), navegación común en las migas, ángulos sin unidad en grados, eventos de apoyos perdidos, tope de paso solo con clavos. v0.4.0 publicada (332 pruebas). Agente de Ondas y sonido en curso.
- 2026-11-19 06:10 — Laboratorio: fuerza aplicada con U_F, duplicar, gráficas configurables (con aceleración y trayectoria). Paletas que no hacían nada ahora llevan al Laboratorio o explican qué falta. Inicio con estados «Disponible»/«En preparación». Autocrítica 3. 336 pruebas. Agente de Ondas en curso.
- 2026-11-19 06:40 — Presupuesto de cálculo en Mecánica (pasos y reloj), experimento de conjunto activo descartado, campos muertos corregidos (cilindro, x de salida), GIF del Laboratorio en el README. Lanzado el agente de escenas MEXT del Laboratorio.
- 2026-11-19 07:20 — 19 escenas MEXT nuevas en el Laboratorio (agente + 2010 1-F), cuerda elástica en el motor, extremos de segmento cerrados y silencio acumulado (errores encontrados por el agente). 439 pruebas.
- 2026-11-19 07:50 — Ondas y sonido integrado. v0.5.0 publicada (439 pruebas).
- 2026-11-19 04:55 — Óptica integrado (menús, Inicio con conteos reales, abrir escenas de otro espacio lleva a su pantalla). v0.6.0 publicada (499 pruebas). Lanzado el agente de Magnetismo e inducción.
- 2026-11-19 05:15 — Contactos como LCP: regularización con refinamiento, conjunto activo por pivoteo de Murty, impulsos inelásticos simultáneos, post-estabilización de solapes, contacto persistente solo con rapidez relativa lenta. Empaquetado hexagonal en reposo sin eventos (antes agotaba el cálculo en 0.2 ms simulados). 504 pruebas.
- 2026-11-19 05:20 — Lanzados los agentes de Termodinámica y Electrostática (escenas MEXT: hoy 1 de 30 y 1 de 18). Yo: escenas MEXT de Gravitación.
- 2026-11-19 05:45 — Seis escenas MEXT de Gravitación (8 de 8) con lecturas y pruebas. Autocrítica 4. 554 pruebas.
- 2026-11-19 06:40 — Energía disipada continua en el estado (Qc, Qi; balance a 10⁻¹⁰), clavo y notas corregidos. Superficies móviles (`sobre`) y cuerpos cinemáticos con su trabajo W en el motor, con pruebas (2016 P3, 2006 1-(1)). Sesión cortada por límite de uso.
  - PENDIENTE para la próxima sesión: (1) llevar superficies móviles y cuerpos cinemáticos al Laboratorio (objeto «Tabla/carro» y «Mano/ascensor») y crear las escenas MEXT 2016 P3 y 2006 1-(1); (2) los agentes de Magnetismo, Termodinámica y Electrostática se detuvieron sin terminar: sus archivos sin seguimiento (`motores/magnetismo.js`, `prototipos/magnetismo*`, `pruebas/magnetismo.test.js`, y los cambios en `gas.js`, `termodinamica*`, `electrostatica*`) están a medias; revisar con `git status`, correr suite y tipos, completar o descartar, e integrar (MODULOS, Inicio con conteos reales, README, CHANGELOG); (3) publicar v0.7.0 con lo de [Sin publicar] y comprobar ejecutables.
- 2026-11-19 (reanudado) — Superficies móviles y movimiento impuesto en el Laboratorio; escenas MEXT 2016 P3 y 2006 1-(1) (Mecánica: 27 MEXT). Agentes relanzados para terminar Magnetismo, Termodinámica y Electrostática a partir de lo que dejaron en disco.
- 2026-11-19 — v0.7.0 publicada (instalador 2 360 428 B, portátil 4 768 256 B). Gráficas con margen adaptable y Gm alrededor del Sol; subíndices de lecturas más grandes. Seis escenas MEXT de cinemática y proyectiles en el Laboratorio (Mecánica: 33 MEXT).
  - Mecánica MEXT sin escena y por qué: 2025 T5 y 2025 T1 (solo el tema en el banco); 2013 1-(1) (movimiento relativo: falta un sistema de referencia que se mueve); 2013 P3 y 2007 P3 (estática; no están en el banco con esa referencia). 2010 1-B se hizo con un triángulo rígido de varillas; 2025 T2 (sin enunciado).
- 2026-11-19 — Movimiento impuesto por tramos (perfil) en el motor y el Laboratorio; ejemplo del ascensor y MEXT 2017, 2019 y 2023 1-(1) (Mecánica: 36 MEXT).
- 2026-11-19 — Prensa hidráulica en el motor y el Laboratorio (MEXT 2010 1-A); escena de estática 2010 1-B con un triángulo rígido; recientes reales en Inicio (Mecánica: 38 MEXT).
