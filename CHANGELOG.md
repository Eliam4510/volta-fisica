# Registro de cambios

Todos los cambios importantes de Volta se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [0.1.0] - 2026-11-19

Primera versión pública: el lenguaje de diseño y los primeros prototipos
interactivos, empaquetados como aplicación de Windows.

### Añadido

- Aplicación de escritorio para Windows con Tauri 2 (instalador NSIS y
  ejecutable portátil).
- Lenguaje de diseño completo: contrato (`docs/04_lenguaje_de_diseno.md`),
  tokens con fuente única, componentes, gramática del lienzo, 242 iconos,
  marca y guía viva.
- Pantalla de Inicio con los nueve módulos y la biblioteca de escenas.
- Mecánica (cinemática y proyectiles): salto hacia una pendiente con choques
  de restitución, trayectoria prevista en vivo al arrastrar la velocidad,
  línea de tiempo con eventos, gráficas, energía, eventos y tabla.
- Electrostática (cargas y campos): líneas de campo, equipotenciales, mapa de
  potencial, sonda y una carga libre integrada con Dormand–Prince 5(4).
- Termodinámica (laboratorio de gases): cilindro con émbolo, pesa,
  calentador, paredes adiabáticas o conductoras, diagrama P-V y registro de
  energía.
- Motor de proyectiles puro (`sistema/motores/proyectiles.js`) con solución
  exacta por tramos.
- Pruebas automáticas: exactitud física contra soluciones analíticas,
  conservación y balance de energía, determinismo, formato ISO 80000 e
  integridad del proyecto.
- Integración continua: pruebas en cada push, compilación para Windows y
  ejecutables adjuntos a cada release.
- Fuentes incluidas (IBM Plex Sans, IBM Plex Mono, STIX Two Text): funciona
  sin internet.

### Problemas conocidos

- Algunos botones (exportar datos, deshacer en Mecánica, colocar objetos de la
  paleta) todavía no hacen nada.
- Los módulos Gravitación, Circuitos, Magnetismo, Ondas, Óptica y Física
  moderna aún no tienen pantalla.

[Sin publicar]: https://github.com/Eliam4510/volta-fisica/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Eliam4510/volta-fisica/releases/tag/v0.1.0
