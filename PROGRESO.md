# Progreso

Memoria de trabajo entre sesiones. Prioridad: bugs que rompen > exactitud
física > funciones faltantes > rendimiento > pulido.

## Estado actual

- Versión: 0.2.0 publicada; 0.3.0 en preparación (CHANGELOG [Sin publicar] al día)
- Repo: https://github.com/Eliam4510/volta-fisica
- Lenguaje de diseño, iconos, guía y pantallas de Inicio, Mecánica,
  Electrostática, Termodinámica y Gravitación: hechos (ver `docs/04_lenguaje_de_diseno.md`).
- Agentes en curso: Circuitos (pantalla y motor) y Laboratorio de Mecánica
  (caja de arena). Sus archivos están sin seguimiento hasta revisarlos.

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
- [ ] Caja de arena de Mecánica (`mecanica-laboratorio.html`) sobre el motor general (agente en curso).

### Otros módulos
- [x] Motor de Termodinámica extraído (`motores/gas.js`, 27 pruebas; corrigió un error del balance en el evento de dejar los topes).
- [x] Motor de Electrostática + `nucleo/integradores.js` (59 pruebas).
- [x] Gravitación: motor (40 pruebas) y pantalla «Órbitas» con cinco escenas.
- [ ] Circuitos (agente en curso).
- [ ] Ondas, Óptica, Magnetismo, Moderna.

## Autocrítica 1 (2026-11-19 01:05)

Comparado con Box2D v3 (Soft Step, subpasos, CCD híbrido, sueño por islas),
MuJoCo (integradores Euler/implicitfast/RK4, contacto blando convexo) y la
literatura de sistemas híbridos (detección de eventos, Zeno):

| Prioridad | Hallazgo | Tarea |
|---|---|---|
| Hecho | Con e ≈ 1 el motor agotaba eventos y la partícula quedaba congelada (Zeno) | Regla post-Zeno con prueba (v0.2.0) |
| Hecho | Deshacer y rehacer de Mecánica no hacían nada | Historial (v0.2.0) |
| Bug | La paleta de objetos de Mecánica no coloca nada; el campo Masa no afecta la simulación | Masa editable con unidades; paleta cuando exista el motor general |
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
| Exactitud | Las restricciones unilaterales se resuelven como igualdades: con apoyos redundantes (un disco en una esquina) J·M⁻¹·Jᵀ es singular y `resolver` reparte las reacciones de forma arbitraria | Regularizar (A + εI, como el CFM de ODE y MuJoCo) o resolver un LCP (Gauss–Seidel proyectado) |
| Rendimiento | Un montón inelástico de 10 discos genera ≈ 5000 eventos en 5 s; los eventos de pares son O(n²) por paso | Fase amplia (rejilla uniforme) para candidatos a choque; reposo agrupado (islas que duermen); modo multitud de paso fijo |
| Función | Los discos no giran: no hay rodadura ni fricción entre discos | Rotación con momento de inercia y fricción en el contacto disco-disco |
| Hecho | Gravitación no guardaba escenas `.volta`; Electrostática y Gravitación no aceptaban unidades en los campos | `archivos.js` y `unidades.js` en ambas pantallas |
| Hecho | No había pruebas de rendimiento | `npm run banco` (`pruebas/rendimiento/`). Referencia 2026-11-19, Ryzen de escritorio: proyectil 0.9 µs; péndulo con clavo 2 s 7.4 ms; Atwood 1 s 4.5 ms; 12 discos 5 s 24 ms; 24 discos con gravedad 5 s 104 ms; gas 5 s 2.3 ms; cargas 6.5 s 1.0 ms; satélite 2 órbitas 3.6 ms |
| Rendimiento | Mecánica da muchos pasos (péndulo 2 s: 6.6 ms) por el tope de paso duración/400, que protege los eventos no monótonos del clavo. La caché de `dinamica` compartida por f y los eventos ya ahorra un 10–15 % | Eventos del clavo continuos (como el impacto) para poder quitar el tope fijo |
| Pulido | La etiqueta del eje vertical queda bajo la barra de capas (`trazo.ejes`); los subíndices de v_c y v_e se confunden a 10 px; falta favicon | Corregir en las piezas compartidas cuando no haya agentes usándolas |

## Problemas conocidos

- Los botones de exportar, deshacer y paleta de objetos de algunos
  prototipos todavía no hacen nada.
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
- 2026-11-19 01:20 — Unidades y expresiones, diálogos nativos, motor de gas; CI separado en pruebas y compilación.
- 2026-11-19 01:50 — Integradores, Electrostática y motor general de Mecánica con pruebas (229). Agentes: gravitación, circuitos, caja de arena de Mecánica.
- 2026-11-19 03:40 — Electrostática con escenas .volta saneadas y exportación con BOM. Motor de Mecánica endurecido: sin efecto túnel, choques simultáneos, contactos entre discos, varios apoyos por partícula, resultado parcial al límite de eventos (301 pruebas). CHANGELOG [Sin publicar] relleno.
  - Pendiente inmediato: revisar y hacer commit de Gravitación (agente terminó: 5 archivos sin seguimiento, 40 pruebas en verde); esperar a los agentes de Circuitos y del Laboratorio de Mecánica; enlazar las tres pantallas desde Inicio; publicar v0.3.0.
  - Conocido: la estabilización de Baumgarte deja ≈ 2·10⁻⁶·E0 de deriva en un montón de discos; mejora posible: proyección de posiciones al iniciar cada tramo. El montón inelástico genera muchos eventos (≈ 5000 en 5 s): falta un modo de reposo agrupado.
