# Progreso

Memoria de trabajo entre sesiones. Prioridad: bugs que rompen > exactitud
física > funciones faltantes > rendimiento > pulido.

## Estado actual

- Versión: 0.1.0 (en preparación)
- Lenguaje de diseño, iconos, guía y prototipos de Inicio, Mecánica,
  Electrostática y Termodinámica: hechos (ver `docs/04_lenguaje_de_diseno.md`).

## Pendiente (ordenado)

### Fase 0
- [ ] Fuentes locales (OFL) en lugar de Google Fonts.
- [ ] Andamiaje Tauri 2 + icono de la aplicación.
- [ ] Vitest y primeras pruebas.
- [ ] CI: pruebas en cada push; compilación Windows adjunta a cada release.
- [ ] README, CHANGELOG, LICENSE; repo público; release v0.1.0.

### Plataforma
- [ ] Extraer a `sistema/nucleo/`: formato, prefijos, integradores, Brent.
- [ ] Pruebas de exactitud: caída libre, tiro, rebotes, oscilador armónico.
- [ ] Guardar y abrir escenas (`.volta`) desde la aplicación.
- [ ] Exportar datos a CSV de verdad (hoy el botón no hace nada).

### Mecánica
- [ ] Extraer el motor del prototipo a `sistema/motores/mecanica.js` con pruebas.
- [ ] Motor numérico general (Dormand–Prince + eventos) para superficies
  arbitrarias, varias partículas, resortes y cuerdas.

### Otros módulos
- [ ] Extraer motores de Electrostática y Termodinámica con pruebas.
- [ ] Gravitación, Circuitos, Ondas, Óptica, Magnetismo, Moderna.

## Problemas conocidos

- Los botones de exportar, deshacer y paleta de objetos de algunos
  prototipos todavía no hacen nada.
- Pendientes del lenguaje de diseño: `docs/04_lenguaje_de_diseno.md`, sección 11.

## Bitácora

- 2026-11-19 00:45 — Inicio del turno autónomo. Repo git propio creado.
