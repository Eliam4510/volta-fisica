# Plan de Volta

Simulador de física para Windows, organizado en módulos, orientado al
temario de Física MEXT. Documentos de fondo: `docs/01_analisis_temario.md`,
`docs/02_arquitectura.md`, `docs/03_vision_y_plataforma.md`,
`docs/04_lenguaje_de_diseno.md` y `docs/modulos/*.md`.

## Arquitectura (v0.x)

```
Volta/
├── src-tauri/        aplicación de Windows (Tauri 2, Rust): ventana, archivos, diálogos
├── sistema/          interfaz servida por Tauri (sin empaquetador)
│   ├── tokens/       tokens.json → tokens.css (fuente única de diseño)
│   ├── fuentes/      Plex Sans, Plex Mono, STIX Two (OFL), fuentes.css
│   ├── componentes/  componentes.css, espacio.js, linea-tiempo.js
│   ├── lienzo/       trazo.js (gramática), grafica.js, dominios/<modulo>.js
│   ├── iconos/       fuente → svg, sprite.js, catálogo
│   ├── nucleo/       física pura, sin DOM (integradores, eventos, unidades, formato)
│   ├── motores/      motor de cada módulo, puro y probado
│   └── prototipos/   pantallas: inicio, mecánica, electrostática, …, guía
├── pruebas/          pruebas de Vitest (exactitud física, conservación, regresión MEXT)
└── docs/             análisis, arquitectura, lenguaje de diseño, módulos
```

Capas:

1. **Núcleo** (`sistema/nucleo/`): formato ISO 80000 y prefijos SI;
   unidades y expresiones; integradores (RK4, Dormand–Prince 5(4) con salida
   densa, Verlet, Boris); localización de eventos (Brent); historial.
2. **Motores** (`sistema/motores/`): uno por tipo de simulación. Sin DOM.
   Reciben una escena, devuelven estado en cualquier instante y eventos.
3. **Lienzo** (`sistema/lienzo/`): gramática visual común más símbolos de cada
   dominio.
4. **Pantallas** (`sistema/prototipos/`): espacio de trabajo de cada módulo
   con la plantilla común.
5. **Aplicación** (`src-tauri/`): ventana, guardar y abrir escenas, exportar.

## Módulos y dependencias

| # | Módulo | Depende de | Motor |
|---|---|---|---|
| 0 | Plataforma (núcleo, lienzo, componentes, escenas, archivos) | — | — |
| 1 | Mecánica | 0 | cuerpos con restricciones y eventos |
| 2 | Gravitación | 0, motor de cuerpos | N cuerpos simpléctico |
| 3 | Termodinámica | 0 | gas por volúmenes de control; dinámica molecular |
| 4 | Electrostática | 0, motor de cuerpos | superposición, Poisson, cargas libres |
| 5 | Circuitos | 0 | análisis nodal modificado |
| 6 | Magnetismo e inducción | 0, 1, 5 | Biot–Savart, Boris, inducción acoplada |
| 7 | Ondas y sonido | 0 | diferencias finitas 1D/2D, Doppler con audio |
| 8 | Óptica | 0 | trazado de rayos, fasores |
| 9 | Física moderna | 0 | fotoeléctrico, núcleo |

## Orden de implementación

1. v0.1.0 — Arranque: los prototipos actuales empaquetados como aplicación,
   CI, release con `.exe`.
2. v0.2.x — Plataforma: núcleo puro con pruebas (formato, integradores,
   eventos), fuentes locales, escenas guardables, exportar CSV.
3. v0.3.x — Mecánica: motor general de partículas con superficies y eventos
   (sustituye al cálculo analítico del prototipo), validado contra
   soluciones exactas; escenas tutoriales, ejemplos y MEXT.
4. v0.4.x — Gravitación (sobre el motor de cuerpos).
5. v0.5.x — Electrostática y Termodinámica: motores extraídos a módulos puros
   con pruebas.
6. v0.6.x — Circuitos.
7. v0.7.x — Ondas y sonido.
8. v0.8.x — Óptica.
9. v0.9.x — Magnetismo e inducción, Física moderna.
10. v1.0.0 — Todos los módulos con sus escenas MEXT y verificación interna.

Criterio de cada módulo: motor puro con pruebas contra soluciones analíticas
y de conservación; pantalla con la plantilla común; tutoriales, ejemplos y
escenas MEXT; capturas revisadas en claro y oscuro.
