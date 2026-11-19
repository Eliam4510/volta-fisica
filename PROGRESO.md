# Progreso

Memoria de trabajo entre sesiones. Prioridad: bugs que rompen > exactitud
física > funciones faltantes > rendimiento > pulido.

## Estado actual

- Versión: 0.2.0 (publicada el 2026-11-19)
- Repo: https://github.com/Eliam4510/volta-fisica
- Lenguaje de diseño, iconos, guía y prototipos de Inicio, Mecánica,
  Electrostática y Termodinámica: hechos (ver `docs/04_lenguaje_de_diseno.md`).

## Pendiente (ordenado)

### Fase 0 (hecha)
- [x] Fuentes locales (OFL) en lugar de Google Fonts.
- [x] Andamiaje Tauri 2 + icono de la aplicación (compila en local: 1.75 MiB).
- [x] Vitest: 47 pruebas (formato, motor de proyectiles, integridad, versión).
- [x] CI: pruebas en cada push; compilación Windows; ejecutables en cada release.
- [x] README, CHANGELOG, LICENSE; repo público; release v0.1.0.

### Plataforma
- [x] `sistema/nucleo/formato.js` con pruebas.
- [ ] Extraer a `sistema/nucleo/`: integradores (DOPRI5, Verlet, Boris) y Brent.
- [ ] Pruebas de exactitud: caída libre, tiro, rebotes, oscilador armónico.
- [x] Guardar, abrir y autoguardar escenas (`.volta`) — Mecánica e Inicio.
- [x] Exportar CSV y PNG — Mecánica.
- [x] Deshacer y rehacer — Mecánica.
- [x] `nucleo/unidades.js`: campos con unidades y expresiones, análisis dimensional (Mecánica).
- [x] Diálogos nativos de Windows para guardar, exportar y abrir.
- [x] `npm run tipos` (TypeScript sobre núcleo y motores).
- [ ] Añadir `npm run tipos` a CI cuando Electrostática pase la revisión de tipos.

### Mecánica
- [x] Motor de proyectiles extraído (`sistema/motores/proyectiles.js`) con pruebas
  contra 2019 P3, 2019 1-(2), lanzamiento oblicuo y balance de energía.
- [ ] Motor numérico general (Dormand–Prince + eventos) para superficies
  arbitrarias, varias partículas, resortes y cuerdas.

### Otros módulos
- [x] Motor de Termodinámica extraído (`motores/gas.js`, 27 pruebas; corrigió un error del balance en el evento de dejar los topes).
- [ ] Motor de Electrostática + `nucleo/integradores.js` (agente en curso).
- [ ] Gravitación (agente en curso). Circuitos (agente en curso).
- [ ] Gravitación, Circuitos, Ondas, Óptica, Magnetismo, Moderna.

## Autocrítica 1 (2026-11-19 01:05)

Comparado con Box2D v3 (Soft Step, subpasos, CCD híbrido, sueño por islas),
MuJoCo (integradores Euler/implicitfast/RK4, contacto blando convexo) y la
literatura de sistemas híbridos (detección de eventos, Zeno):

| Prioridad | Hallazgo | Tarea |
|---|---|---|
| Hecho | Con e ≈ 1 el motor agotaba eventos y la partícula quedaba congelada (Zeno) | Regla post-Zeno con prueba (v0.2.0) |
| Hecho | Deshacer y rehacer de Mecánica no hacían nada | Historial (v0.2.0) |
| Bug | La paleta de objetos de Mecánica no coloca nada; el campo Masa no afecta la simulación | Masa editable con unidades; paleta cuando exista el motor general |
| Exactitud | Mecánica solo resuelve una partícula con superficies fijas por fórmulas | Motor general con DOPRI5 + eventos (`nucleo/integradores.js`): resortes, cuerdas, fricción, varias partículas |
| Exactitud | Falta validar péndulo simple (periodo exacto con integral elíptica), choques 2D elásticos (momento y energía) | Pruebas cuando exista el motor general |
| Exactitud | Conservación del momento lineal sin pruebas | Pruebas de choques entre cuerpos |
| Función | Sin modo multitud: no hay fase amplia de colisiones (rejilla uniforme o barrido y poda) ni fase estrecha (círculo-segmento, SAT) | Diseñar el modo multitud con paso fijo y subpasos (estilo Soft Step) |
| Hecho | Campos numéricos sin unidades ni expresiones | `nucleo/unidades.js` (Mecánica); falta llevarlo a los demás módulos |
| Función | Exportar CSV y guardar escenas solo en Mecánica | Llevarlo a Electrostática, Termodinámica y Gravitación |
| Rendimiento | Sin pruebas de rendimiento | `vitest bench` de los motores |
| Hecho | Guardado con descarga del navegador | Diálogos nativos (tauri-plugin-dialog y fs) |

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
