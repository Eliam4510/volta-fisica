# Registro de cambios

Todos los cambios importantes de Volta se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- Favicon con el icono de Volta en todas las pantallas.

### Cambiado

- Mecánica es más rápida: el tope fijo de paso solo se aplica cuando hay
  clavos (la máquina de Atwood se calcula unas cinco veces más rápido) y la
  dinámica se resuelve una sola vez por paso para la derivada y los eventos.

### Corregido

- Un apoyo que se perdía en el mismo instante que otro evento (una
  partícula que pasa del plano al suelo, un impulso que separa dos cuerpos)
  no quedaba registrado como evento.
- Las etiquetas de los ejes del lienzo ya no quedan debajo de las barras
  flotantes (capas, zoom).
- En los campos de ángulo (Mecánica, Gravitación), un número sin unidad se
  leía en radianes en lugar de en grados.

## [0.3.0] - 2026-11-19

Dos módulos nuevos (Gravitación y Circuitos), Electrostática y
Termodinámica al nivel de Mecánica, y un motor general de Mecánica con
choques robustos sobre el que se construirá la caja de arena.

### Añadido

- Campos con unidades y expresiones en Mecánica, Electrostática y Gravitación: se puede
  escribir `250 g`, `3 km/h`, `2*a`, `v0 cos 30°`, `30 cm` o `k q/a`; Volta
  convierte a SI y comprueba la dimensión (análisis dimensional) con mensajes
  que dicen qué se esperaba.
- Diálogos nativos de Windows para guardar, exportar y abrir en la
  aplicación de escritorio; en el navegador se usa la descarga.
- Integradores numéricos (`nucleo/integradores.js`): Dormand–Prince 5(4) con
  salida densa y localización de eventos por Brent, RK4, Verlet y
  Gauss–Legendre.
- Motor general de Mecánica (`motores/mecanica.js`): varias partículas,
  superficies rectas y circulares, cuerdas que se aflojan, varillas, poleas,
  resortes, clavos, fricción de Coulomb con adherencia, arrastre lineal y
  cuadrático, y choques entre partículas con restitución. Validado contra el
  péndulo exacto (integral elíptica), la máquina de Atwood y problemas MEXT.
- Choques robustos en el motor de Mecánica: el paso se acota según la
  rapidez (sin efecto túnel), los choques simultáneos se resuelven por
  impulsos secuenciales (péndulo de Newton exacto), los discos se apoyan
  unos en otros (pilas que se asientan), el radio cuenta contra las
  superficies y una partícula puede apoyarse en varias a la vez. Al llegar
  al límite de eventos se devuelve lo simulado con un aviso.
- Módulo Gravitación con la pantalla «Órbitas»: N cuerpos con Verlet y
  Yoshida de 4.º orden, solución de Kepler analítica, elementos orbitales,
  áreas barridas, sistema que gira con la Tierra y cinco escenas (cañón de
  Newton, órbita circular, elíptica, geoestacionaria MEXT 2023 y velocidad
  de escape MEXT 2018).
- Módulo Circuitos con la pantalla «Transitorios»: análisis nodal
  modificado, transitorio trapezoidal con paso adaptativo, interruptores de
  una y tres posiciones, conservación exacta de la carga en islas de
  capacitores, modos ideal y realista, bombilla no lineal y registro de
  energía por componente. Cinco escenarios: carga y descarga de un
  capacitor, bombilla y recta de carga, MEXT 2019 P2 (RC y LC), MEXT 2023 P2
  (red de capacitores) y MEXT 2027 1-(3) (puente de Wheatstone).
- Motor de Electrostática (`motores/electrostatica.js`): superposición de
  Coulomb, potencial, flujo de Gauss y partículas libres con eventos.
- Motor de gas de Termodinámica (`motores/gas.js`) con 27 pruebas analíticas
  y balance de energía cerrado.
- Termodinámica, Electrostática y Gravitación: guardar, abrir y autoguardar
  escenas `.volta`; exportar CSV con BOM e imagen PNG.
- Revisión de tipos con TypeScript sobre el núcleo y los motores
  (`npm run tipos`), también en la integración continua.
- Banco de rendimiento de los motores con las escenas de las pantallas
  (`npm run banco`).

### Corregido

- Los números que al redondear subían de orden perdían una cifra
  significativa (−0.99999999 se escribía −1.0000 en lugar de −1.000).

### Seguridad

- Las escenas que se abren desde un archivo se validan y se acotan antes de
  usarse; los nombres de objetos no pueden inyectar marcado en la interfaz.

### Cambiado

- La integración continua separa las pruebas (en cada envío) de la
  compilación de Windows.

## [0.2.0] - 2026-11-19

Mecánica pasa de prototipo a herramienta de trabajo: se guarda, se exporta y
se puede deshacer.

### Añadido

- Exportar datos a CSV (precisión completa, RFC 4180) e imagen del lienzo a
  PNG desde Mecánica.
- Escenas guardables en formato `.volta`: guardar (Ctrl+S), abrir (Ctrl+O),
  restablecer la escena original y autoguardado al cerrar.
- Inicio: «Abrir archivo» abre una escena de cualquier módulo en su pantalla;
  «Nueva escena» y pie con la versión.
- Deshacer y rehacer en Mecánica (Ctrl+Z, Ctrl+Y).
- Núcleo puro y probado: `formato.js`, `csv.js`, `escena.js`, `historial.js`.

### Corregido

- Con rebotes casi infinitos (por ejemplo e = 0.9) la partícula podía quedar
  congelada en el aire a mitad de la simulación: el motor ahora declara el
  reposo (regla post-Zeno) y conserva el balance de energía.

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

[Sin publicar]: https://github.com/Eliam4510/volta-fisica/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Eliam4510/volta-fisica/releases/tag/v0.1.0
