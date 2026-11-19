# Progreso

Memoria de trabajo entre sesiones. Prioridad: bugs que rompen > exactitud
física > funciones faltantes > rendimiento > pulido.

## Estado actual

- Versión: 0.1.0 (publicada el 2026-11-19)
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
- [ ] Guardar y abrir escenas (`.volta`) desde la aplicación.
- [ ] Exportar datos a CSV de verdad (hoy el botón no hace nada).

### Mecánica
- [x] Motor de proyectiles extraído (`sistema/motores/proyectiles.js`) con pruebas
  contra 2019 P3, 2019 1-(2), lanzamiento oblicuo y balance de energía.
- [ ] Motor numérico general (Dormand–Prince + eventos) para superficies
  arbitrarias, varias partículas, resortes y cuerdas.

### Otros módulos
- [ ] Extraer motores de Electrostática y Termodinámica con pruebas.
- [ ] Gravitación, Circuitos, Ondas, Óptica, Magnetismo, Moderna.

## Autocrítica 1 (2026-11-19 01:05)

Comparado con Box2D v3 (Soft Step, subpasos, CCD híbrido, sueño por islas),
MuJoCo (integradores Euler/implicitfast/RK4, contacto blando convexo) y la
literatura de sistemas híbridos (detección de eventos, Zeno):

| Prioridad | Hallazgo | Tarea |
|---|---|---|
| Bug | Con e ≈ 1 el motor de proyectiles agota 200 eventos y la partícula queda congelada en el aire (Zeno) | Estado final de reposo explícito al agotar eventos, con prueba |
| Bug | Deshacer, rehacer y la paleta de objetos de Mecánica no hacen nada | Historial de deshacer sobre la escena |
| Exactitud | Mecánica solo resuelve una partícula con superficies fijas por fórmulas | Motor general con DOPRI5 + eventos (`nucleo/integradores.js`): resortes, cuerdas, fricción, varias partículas |
| Exactitud | Falta validar péndulo simple (periodo exacto con integral elíptica), choques 2D elásticos (momento y energía) | Pruebas cuando exista el motor general |
| Exactitud | Conservación del momento lineal sin pruebas | Pruebas de choques entre cuerpos |
| Función | Sin modo multitud: no hay fase amplia de colisiones (rejilla uniforme o barrido y poda) ni fase estrecha (círculo-segmento, SAT) | Diseñar el modo multitud con paso fijo y subpasos (estilo Soft Step) |
| Función | Campos numéricos sin unidades ni expresiones (`72 km/h`, `2*h`) | `nucleo/unidades.js` con análisis dimensional |
| Función | Exportar CSV y guardar escenas solo en Mecánica | Llevarlo a Electrostática, Termodinámica y Gravitación |
| Rendimiento | Sin pruebas de rendimiento | `vitest bench` de los motores |
| Pulido | Guardado con descarga del navegador (va a Descargas) | Diálogo nativo con tauri-plugin-dialog |

## Problemas conocidos

- Los botones de exportar, deshacer y paleta de objetos de algunos
  prototipos todavía no hacen nada.
- Pendientes del lenguaje de diseño: `docs/04_lenguaje_de_diseno.md`, sección 11.

## Bitácora

- 2026-11-19 00:45 — Inicio del turno autónomo. Repo git propio creado.
- 2026-11-19 00:57 — v0.1.0 publicada; CI de pruebas y release en marcha.
