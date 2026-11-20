# Progreso

Memoria de trabajo entre sesiones. Prioridad: bugs que rompen > exactitud
física > funciones faltantes > rendimiento > pulido.

## Estado actual

- Versión: 0.22.0 (publicada el 2026-11-20; ejecutables compilándose. La 0.21.0 salió con instalador de 3.7 MB, portable de 7.1 MB y latest.json firmado; la 0.5.0 quedó sin ejecutables)
- Repo: https://github.com/Eliam4510/volta-fisica
- Lenguaje de diseño, iconos, guía y pantallas de Inicio, Mecánica,
  Electrostática, Termodinámica y Gravitación: hechos (ver `docs/04_lenguaje_de_diseno.md`).
- Circuitos (pantalla «Transitorios», 56 pruebas) integrado y enlazado.
- Laboratorio de Mecánica integrado.
- Óptica integrado (geométrica, interferencia y difracción, películas e
  interferómetros; 54 pruebas, 15 escenas MEXT; espejo parabólico hecho). Falta:
  polarización, polígono y capas en la paleta, Michelson con luz blanca.
- Electrostática ampliada e integrada (2 espacios, 95 pruebas, 18 MEXT).
  Falta: solucionador de Poisson (blindaje de un conductor en un campo
  uniforme), sonda de potencial y voltímetro de dos puntas; el flujo de
  Gauss es aproximado cuando la superficie corta una distribución.
- Magnetismo e inducción integrado (3 espacios, 47 pruebas, 13 MEXT).
  Falta: editar vértices de regiones libres, Hall en tiempo físico, vista
  3D de espiras y solenoides, bobina en modo motor.
- Termodinámica ampliada e integrada (4 espacios, 154 pruebas, 29 de 30
  MEXT; 2025 T7 solo tiene el tema). Paletas y arrastrar estados en Ciclos
  hechos. Falta: gas molecular en 3D, resorte del montaje (falla), unidades
  en los campos (ver docs/05_auditoria_producto.md).
- Física moderna integrada (2 espacios, 44 pruebas, 4 MEXT). Falta la zona
  gris (Bohr, rayos X), carga espacial y energía de los neutrones de fisión.
- Los nueve módulos están disponibles: 155 escenas MEXT en total. Circuitos 10 de 10; Ondas 21 de 21 (cubeta 2D integrada).
- Los conteos de las tarjetas de Inicio son a mano: actualizarlos al añadir
  espacios o escenas MEXT.
- Ondas y sonido integrado (Medio 1D, Doppler y acústica, cubeta 2D; el ventilador de 2012 ya existe). Falta el pistón móvil y la fuente que se mueve en la cubeta.
- Escenas MEXT del Laboratorio integradas: 24 escenas MEXT con prueba cada
  una. Sin representar: 2016 P3 (fricción entre dos cuerpos móviles),
  2006 1-(1) (fuerza que depende de la posición), 2025 T2 (sin enunciado),
  estática (M9, necesita cuerpo rígido), fluidos (M10), movimiento relativo
  (M11) y cinemática pura (M1, gráficas v-t prescritas).

## Pendiente (ordenado)

**La lista de trabajo vigente es `docs/05_auditoria_producto.md`** (auditoría
del 2026-11-19): producto e interfaz (A1 bloqueantes primero), simulador por
módulo (B) y requisitos de producto (C). Lo de abajo es el historial.

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
- [x] Laboratorio: panel de variables, instrumentos (regla, fotopuerta).
- [x] Discos que giran: rodadura, deslizamiento con giro, par de la fricción (v0.12.0, DECISIONES 18).
- [x] Bloques que vuelcan: rectángulo con giro y contactos por vértice (v0.13.0).
- [x] Fuerza aplicada en un punto del cuerpo (`Fpunto`; Laboratorio «Aplicada en», ejemplo «Empujar un bloque»).
- [x] Caras y esquinas de los bloques (superficies que giran con su portador; DECISIONES 19): apilar cajas, discos contra bloques. Falta: la esquina fija de un escalón contra la cara de un bloque; vértice contra vértice no cuenta.
- [x] Fricción entre discos que giran (pares con {pegado, sentido}; eventos «rueda» y «resbala»).

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
| Hecho | El perfil de aceleración solo se definía en las escenas | Editor de tramos en el inspector, con validación del orden |
| Hecho | El Laboratorio no tenía instrumentos ni panel de variables | Regla, fotopuerta y variables ligadas a propiedades (también se crean con clic derecho en un campo) |
| Exactitud | La prensa hidráulica no tiene peso del líquido (sin ρgh): vale para Pascal, no para vasos comunicantes con desnivel | Columna de líquido con peso cuando haga falta (Fluidos M10) |
| Contenido | Mecánica 38 de 44 MEXT; las 6 restantes no tienen enunciado o necesitan sistemas de referencia que se mueven | — |

## Autocrítica 6 (2026-11-19, con los nueve módulos y 155 escenas MEXT)

Comparado con la visión del producto (cada módulo, una caja de arena
completa) y con PhET, Universe Sandbox y Algodoo:

| Prioridad | Hallazgo | Tarea |
|---|---|---|
| Hecho (v0.11.0) | Varias pantallas dependían de sus escenas: en Gravitación no se pueden añadir cuerpos ni impulsos (el espacio «Sistema solar» y «Maniobras» de la especificación no existen); en Termodinámica las paletas de objetos siguen como `data-pendiente` | Gravitación: espacios «Sistema solar» (N cuerpos, Kepler, datos reales) y «Maniobras» (impulsos Δv, Hohmann); Termodinámica: paletas para montar escenas propias |
| Hecho en parte (v0.12.0) | Mecánica sigue sin rotación (sin rodadura, sin vuelco) | Discos que giran y ruedan, hechos; faltan bloques que vuelcan (polígonos) y la fricción entre discos |
| Función | Instrumentos desiguales: el Laboratorio y Magnetismo los tienen; Gravitación y Termodinámica no | Instrumentos de cada espacio según su especificación |
| Contenido | 155 escenas MEXT; lo que falta no tiene enunciado en el banco o pide modelos fuera de alcance | — |
| Pulido | Títulos largos cortados a 1280 px en varias barras superiores | Revisar a 1280×800 todas las pantallas |

## Autocrítica 7 (2026-11-19, tras discos que giran y bloques que vuelcan)

Comparado con Box2D v3 y PhysX (polígonos con contactos por recorte de
aristas, fricción en todos los pares, fuerzas en cualquier punto) y con lo
que pide la estática del temario (M9: volcar o deslizar al empujar):

| Prioridad | Hallazgo | Tarea |
|---|---|---|
| Hecho (v0.12.0, v0.13.0) | No había rotación | Discos que ruedan y bloques que vuelcan, validados contra soluciones exactas |
| Función | La fuerza aplicada actúa siempre en el centro: no se puede empujar un bloque a una altura h y ver si vuelca o desliza (problema clásico de M9) | Punto de aplicación en el marco del cuerpo; par F × r en el giro y su energía (W de una fuerza que gira con el cuerpo no es conservativa: va a W) |
| Función | Los bloques no chocan entre sí ni con discos; no se pueden apilar cajas | Vértice contra arista de otro bloque (fila con entradas de los dos cuerpos y sus giros), disco contra aristas |
| Exactitud | Solo los vértices del bloque tocan las superficies: la esquina de un escalón atraviesa la cara de un bloque; un bloque de plano sobre un arco solo toca por vértices | Extremos de los segmentos contra las aristas de los bloques |
| Función | Los pares de discos siguen sin fricción (no hay engranajes de fricción ni un disco que rueda sobre otro) | Deslizamiento del punto de contacto del par con los dos giros |
| Pulido | Las normales y fricciones de un bloque se dibujan en el centro, no en sus vértices; no hay asa para girar un bloque con el ratón | Origen de cada vector en su punto de contacto; asa de giro |

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
5. El flujo `release.yml` compila y adjunta instalador y portátil, y con el
   secreto `TAURI_SIGNING_PRIVATE_KEY` firma el instalador y adjunta
   `latest.json` (actualización automática; DECISIONES 21). Comprobar que
   `latest.json` está entre los archivos de la release.
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
- 2026-11-19 — v0.8.0 publicada (instalador 2 370 753 B, portátil 4 777 472 B). Después: regla y fotopuerta, editor de perfiles y panel de variables en el Laboratorio.
- 2026-11-19 — Magnetismo, Electrostática, Termodinámica y Física moderna integrados; v0.9.0 publicada (859 pruebas). Siguiente: Ondas (cubeta 2D, 5 MEXT pendientes), Circuitos (3 de 10 MEXT), Óptica (polarización, espejo parabólico), cuerpo rígido con rotación.
- 2026-11-19 — Ejecutables de la v0.9.0 comprobados. Agentes en curso: Ondas (cubeta 2D: ondas2d.js, ondas-cubeta*, 2012 P5 en ondas-doppler) y Circuitos (7 escenas MEXT). Al integrar la cubeta: espacio `cubeta` en MODULOS de espacio.js y ESPACIOS de Inicio; conteos de Ondas y Circuitos.
- 2026-11-19 — Circuitos (10 MEXT) y cubeta de ondas 2D (Ondas 21 MEXT) integrados; v0.10.0 (934 pruebas). Pendientes por módulo: ver las notas de cada uno arriba y las autocríticas.
- 2026-11-19 — Termodinámica como caja de arena (paletas e instrumentos) y Gravitación con «Sistema solar» y «Maniobras» (motor de N cuerpos); v0.11.0 (992 pruebas).
- 2026-11-19 — Discos que giran en el motor y el Laboratorio (rodadura, bola de bolos, cuenco; ejemplos con fotopuertas); sentido de la fricción cinética fijo por tramo; v0.12.0 (1003 pruebas). Siguiente: bloques que vuelcan.
- 2026-11-19 — Bloques rígidos que vuelcan (motor y Laboratorio); adherencia conjunta de los apoyos; v0.13.0 (1013 pruebas). Autocrítica 7. Siguiente: fuerza aplicada en un punto del cuerpo.
- 2026-11-19 — Fuerza aplicada en un punto del cuerpo (vuelca o desliza al empujar); 1019 pruebas. Siguiente: contactos con las aristas de los bloques (diseño arriba).
- 2026-11-19 — Caras y esquinas de los bloques (apilar, discos contra bloques); ejemplo de cajas apiladas; 1024 pruebas; v0.14.0.
- 2026-11-19 — Fricción entre discos; arreglo del sentido de la fricción de los vértices y caso de Painlevé; 1028 pruebas.
- 2026-11-19 — Óptica: espejo parabólico (motor, pantalla y ejemplo); 1031 pruebas; v0.15.0.
- 2026-11-19 — Actualizaciones desde GitHub (plugin updater, latest.json firmado en cada release, aviso en Inicio); clave privada fuera del proyecto y como secreto del repositorio; 1042 pruebas.
- 2026-11-19 — Auditoría con cuatro agentes (producto, simulador, referencias, nombre): docs/05_auditoria_producto.md. Pendiente de decidir el nombre definitivo (Volta era nombre en clave).
- 2026-11-19 — Auditoría A1 (bloqueantes) resuelta: documento por pantalla con aviso de cambios, Guardar/Guardar como, .volta asociada en Windows con instancia única y arrastrar y soltar, Inicio con buscador, Nueva escena, Ajustes y archivos recientes, sin herramientas de desarrollo ni controles muertos; ventana que recuerda su estado. 1051 pruebas. Siguiente: A2 (idioma inglés, preferencias de unidades y formato numérico, accesibilidad) y B (gráficas, análisis).
- 2026-11-20 — Comentarios del autor usándola: Configuración como pantalla con actualizaciones dentro, acentos y matices, teclado de símbolos, arreglo de los campos con unidad, gráficas interactivas, separador decimal, accesibilidad; v0.17.0 (1062 pruebas). Siguiente: Sistema solar geocéntrico/heliocéntrico/Ptolomeo, más opciones en los laboratorios, inglés.
- 2026-11-20 — Sistema solar con centro de la vista (inercial, Sol, Tierra, seleccionado), capa Ptolomeo (epiciclo() en el motor) y ejemplo geocéntrico; Laboratorio con fuerza senoidal o en pulso (S.tAhora fijado en cada etapa y evento, pulsos cortan tramos, trabajo en W), ejemplo de resonancia y selector de gravedad; v0.18.0 (1070 pruebas). Siguiente: más opciones de laboratorio (motor y par aplicado, fuerza F(x), polígonos), ejemplos clásicos que faltan, inglés.
- 2026-11-20 — Ejemplos «Osciladores acoplados» y «Escalera que resbala» (2/3 de la altura, comprobado). Rizo probado y no publicado: un arco interior de 270° a 629.9° más el suelo da la vuelta bien (v ≥ √(5gR)), pero al salir por el final del arco y volver a entrar por su inicio salen 4 o 5 choques sin pérdida en el mismo instante; falta que el motor trate la unión de dos superficies tangentes sin evento (o un arco cerrado de 360° con entrada desde fuera).
- 2026-11-20 — Interfaz en inglés (DECISIONES 23): componentes/idioma.js + idioma-en.js en el head de las 25 pantallas; traduce el DOM con un observador, atributos, ayudas y lienzos (fillText). Cubierto: chrome común, Inicio, Configuración (selector de idioma), diálogos, actualizaciones, estado inicial de todas las pantallas y el Laboratorio de Mecánica. Falta por espacio: inspectores al seleccionar, notas de escenarios, describirEvento (frases compuestas: necesitan t() con huecos en el código), avisos con valores. Método: cargar cada pantalla en inglés y leer Volta.idiomaFaltantes() (se puede con iframes desde Inicio). v0.19.0 (1082 pruebas).
- 2026-11-20 — Inglés en todos los espacios (diccionario por bloques en idioma-en.js, ~3 700 entradas; extraídas con un script que lista los literales de cada archivo que faltan en el diccionario). describirEventoEn arma los eventos del Laboratorio en inglés. Recorrido de las 25 pantallas en inglés: solo quedan unidades y símbolos. Pendiente: textos que solo salen al interactuar en espacios poco usados (revisar con Volta.idiomaFaltantes() al usar cada uno) y las notas largas de escenarios MEXT que se generan con plantillas. v0.20.0 (1083 pruebas).
- 2026-11-20 — Circuitos AC: tipo 'fuente-ca' en el motor (rama V con función del tiempo r.fn), respuestaFrecuencia (MNA complejo con gmin 1e-12) y barridoFrecuencia; pantalla con inspector de fasores, gráfica 'bode' (x = log10 f con o.x.formato en grafica.js), icono o-fuente-ca (inventario 243) y ejemplos rlc-ca y filtro-rc. Siguiente en Circuitos: diodo y LED, transformador, osciloscopio con dos canales en alterna, impedancia vista por la fuente, potencia reactiva. v0.21.0 (1090 pruebas).
- 2026-11-20 — Diodo y LED (curvaDiodo: Shockley con Is desde Vd a la corriente de referencia, pnjlim en el Newton de resolverPaso, recta por encima de 100 A; respuestaFrecuencia rechaza diodos). Pantalla: iconos o-diodo y o-led (inventario 245), LED con color (COLORES_LED, luz con opticaColor de dominios/optica.js) y ejemplos rectificador y led. Siguiente: transformador (inductancias acopladas: compañero trapezoidal 2×2 con Γ = L⁻¹, energía con M·i₁·i₂, fasores con la matriz de admitancias del bipuerto; ojo con cortarInductores e impulso), zener. v0.22.0 (1097 pruebas).
