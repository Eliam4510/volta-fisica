# Registro de cambios

Todos los cambios importantes de Volta se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- Motor de Mecánica: superficies que van sobre un cuerpo (`sobre`) y se
  trasladan con él, con reacción y fricción sobre ese cuerpo, y cuerpos
  cinemáticos (`cinematica`), conductores de masa infinita a velocidad
  constante (una mano, un ascensor, una paleta). `energiaMecanica` devuelve
  su trabajo `W` y el balance E + Qc + Qi = E0 + W cierra a 10⁻⁹. Pruebas:
  bloque sobre una tabla libre (MEXT 2016 P3), mano que sube un peso con
  resorte (MEXT 2006 1-(1)), ascensor y paleta.
- Laboratorio de Mecánica: una superficie puede ir sobre una partícula y
  moverse con ella («Va sobre» en el inspector), y una partícula puede tener
  movimiento impuesto (velocidad constante pase lo que pase). El panel de
  energía muestra el trabajo del movimiento impuesto. Escenas MEXT nuevas:
  2016 P3 (objeto sobre un bloque que se lanza) y 2006 1-(1) (subir con la
  mano un peso colgado de un resorte), con sus pruebas.

- Gravitación: seis escenas MEXT nuevas en «Órbitas» (2027 1-(2) fuerza a
  una altura, 2015 1-(2) masa de un planeta por su luna, 2014 1-(2) escape
  lanzando en horizontal, 2013 1-(2) tercera ley de Kepler alrededor del
  Sol, 2010 1-G periodo de una órbita circular y 2009 1-(2) satélite
  geoestacionario frente a la Luna), cada una con las lecturas que
  contestan el examen y una prueba que obtiene la respuesta de la
  simulación. Las órbitas largas ajustan las velocidades de reproducción.

### Corregido

- Montones de discos con apoyos redundantes (una fila de pared a pared, un
  empaquetado hexagonal): la eliminación gaussiana daba reacciones
  arbitrarias y enormes, soltaba apoyos cargados y el montón traqueteaba con
  choques cada pocos microsegundos hasta agotar el cálculo. Ahora un
  empaquetado en reposo no se mueve ni genera choques, y un disco que cae
  encima termina en reposo en menos de medio segundo de cálculo.
- Un disco que caía en un hueco justo de su diámetro quedaba flotando
  milímetros por encima de su sitio (contacto persistente decidido por la
  velocidad normal, diminuta en una geometría casi tangente).
- Con un umbral de contacto alto (0.03 o 0.1 m/s), un montón de diez discos
  ya no agota el presupuesto de cálculo.
- Péndulo con clavo: el sentido de giro al enganchar dependía del signo de un
  producto que en ese instante es cero, y a veces la cuerda se enganchaba y
  soltaba sin fin. Ahora sale de la velocidad, y el evento opuesto se
  silencia una pausa breve.
- Las notas de los escenarios del Laboratorio perdían «>», comillas y «&» al
  normalizarse («tan θ > μs» quedaba «tan θ μs»); ahora se conservan y se
  muestran escapadas.

### Cambiado

- Mecánica: la energía disipada se contabiliza entera. La continua
  (fricción, arrastre, amortiguadores y el resto de la estabilización) se
  integra con el movimiento como una componente más del estado, y la de los
  instantes incluye ahora la potencial que cambia la proyección de
  posiciones: E + disipada se conserva a 10⁻¹⁰. `energiaMecanica` devuelve
  `Qc` y `Qi`, y el Laboratorio separa «Disipada en choques» y «Disipada por
  rozamiento» (también en el CSV).
- Motor de Mecánica: el conjunto de contactos activos se elige como un
  problema de complementariedad (λ ≥ 0, aceleración ≥ 0) y los restos de
  acercamiento de un instante se quitan con impulsos inelásticos
  simultáneos; las posiciones se proyectan para quitar solapes al empezar
  cada tramo. La tabla de eventos ya no anota choques de ruido de 10⁻¹⁶ J.

## [0.6.0] - 2026-11-19

Módulo de Óptica con tres espacios de trabajo y 14 problemas MEXT.

### Añadido

- Módulo Óptica con tres espacios de trabajo:
  - «Óptica geométrica»: trazado exacto de rayos contra segmentos y arcos
    en medios de forma libre (lámina, prisma, círculo, semicírculo,
    polígono, lente gruesa, recipiente con líquido), con índice fijo o de
    Cauchy. Snell, reflexión total, reparto de Fresnel (R + T = 1),
    espejos planos y esféricos, lente ideal, divisor de haz, pantalla y
    ojo. La luz blanca se separa en la primera interfaz dispersiva. Las
    imágenes salen de la fórmula y también del cruce de los rayos
    trazados, con aumento y carácter real o virtual. 18 escenas, 8 MEXT.
  - «Interferencia y difracción»: suma de fasores de Huygens con las
    distancias exactas y la forma cerrada de Fraunhofer; rendija simple,
    doble, N rendijas y red; medio entre rendijas y pantalla; franjas con
    su color real, punto P con los caminos r₁ y r₂, regla y tabla de
    máximos y mínimos. 9 escenas, 4 MEXT.
  - «Películas e interferómetros»: reflectancia de Airy (el cambio de fase
    de π sale de Fresnel), cuña, anillos de Newton y Michelson con espejo
    móvil o lámina girada y contador de franjas. 9 escenas, 3 MEXT.
- Color de cada longitud de onda con las funciones CIE 1931 llevadas a
  sRGB y ajustadas en OKLab para mantener el contraste con el fondo.
- 51 pruebas del motor de Óptica, incluidas las respuestas de 14
  problemas MEXT.

### Cambiado

- Inicio muestra los conteos reales de espacios de trabajo y escenas MEXT
  de cada módulo; los módulos en preparación ya no muestran cifras.
- Abrir un archivo de Óptica desde un espacio distinto lleva a la pantalla
  de su espacio en lugar de rechazarlo.

### Corregido

- Los atajos de teclado y la línea de tiempo ya no lanzan errores con
  eventos que no vienen de un elemento.

## [0.5.1] - 2026-11-19

### Corregido

- La compilación de Windows de la 0.5.0 se detuvo porque una prueba de
  choques tardó más que el límite de Vitest en esa máquina: el límite pasa
  a 30 s. Esta versión trae los ejecutables con el contenido de la 0.5.0.

## [0.5.0] - 2026-11-19

Ondas y sonido (cuerdas, tubos y Doppler con audio), 19 escenas MEXT más en
el Laboratorio de Mecánica y un motor de Mecánica más robusto.

### Añadido

- Módulo Ondas y sonido con dos espacios de trabajo:
  - «Medio 1D»: cuerdas y tubos por diferencias finitas (condición CFL
    comprobada), uniones entre medios con reflexión y transmisión, cinco
    tipos de extremo, amortiguamiento, fuentes, sondas, regla, nodos y
    antinodos, diagrama espacio-tiempo, espectro y curva de respuesta.
    16 escenas, 8 de ellas MEXT (ondas viajeras y estacionarias).
  - «Doppler y acústica»: frentes de onda con viento, paredes móviles por
    fuente imagen, frecuencia recibida, pulsaciones y el botón «Escuchar»,
    que sintetiza lo que oye cada observador. 12 escenas, 8 MEXT.
  - Motor puro con 66 pruebas analíticas (rapidez medida, coeficientes de
    reflexión, modos, energía, orden 2, fórmulas de Doppler y respuestas
    MEXT).

- Laboratorio de Mecánica: 18 escenas MEXT nuevas de dinámica, energía,
  choques, movimiento circular y oscilaciones (2006 P3; 2007 1-(1);
  2008 P3; 2009 1-(1); 2010 1-D y 1-E; 2012 1-(1) y P3; 2014 1-(1);
  2016 1-(4) y 1-(5); 2017 1-(3); 2018 1-(2); 2019 1-(2); 2020 1-(1),
  1-(2) y P3; 2023 1-(2)), cada una con una prueba que compara la
  simulación con la respuesta del examen.
- Cuerda elástica (de goma): un resorte que solo tira y no empuja cuando
  está floja, con eventos al tensarse y al aflojarse; en el Laboratorio se
  elige en el inspector del resorte. Con ella, la escena MEXT 2010 1-F
  (la pesa sube 45 cm). El Laboratorio tiene 24 escenas MEXT.

- Laboratorio de Mecánica: fuerza constante aplicada a una partícula
  (módulo y dirección), con su vector en el lienzo y su energía potencial
  U_F = −F·r en las lecturas, las gráficas y el CSV, para que su trabajo no
  se cuente como energía disipada.
- Laboratorio de Mecánica: duplicar la selección (Ctrl+D) para partículas,
  superficies y clavos; una partícula apoyada sigue apoyada en la copia.
- Laboratorio de Mecánica: gráficas configurables. Cada una elige en su
  cabecera qué muestra (x, y, componentes de la velocidad y de la
  aceleración, rapidez, módulo de la aceleración) o la
  trayectoria y contra x; la elección se recuerda en el equipo.

## [0.4.0] - 2026-11-19

El Laboratorio de Mecánica: una caja de arena donde se construye y se
simula cualquier situación mecánica, sobre el motor general con eventos
exactos.

### Añadido

- Laboratorio de Mecánica: la caja de arena donde se construye cualquier
  situación con partículas y discos, suelos, paredes, planos, arcos,
  cuerdas, resortes, varillas, poleas y clavos, sobre el motor general.
  Se edita en t = 0 con ajuste a la cuadrícula, flecha de velocidad con
  trayectoria prevista y campos con unidades; muestra fuerzas en vivo
  (normal, fricción, tensión, peso, elástica), estroboscopio, eventos y
  energías. Escenarios: cuatro tutoriales, cinco ejemplos (Atwood, choque
  de discos, péndulo de Newton, péndulo doble, bola en un cuenco) y MEXT
  2017 P3, 2014 P3, 2009 P3, 2015 P3 y 2027 P2.
- Menús de navegación en las migas de todas las pantallas: ir a otro
  módulo, a otro espacio de trabajo del mismo módulo o a Inicio.
- Inicio abre las escenas del Laboratorio en su espacio y enlaza las
  escenas de ejemplo que ya tienen pantalla.
- Favicon con el icono de Volta en todas las pantallas.

### Cambiado

- Mecánica tiene un presupuesto de cálculo (pasos del integrador y una red
  de seguridad de 5 s de reloj): una escena patológica devuelve lo simulado
  con un aviso en lugar de bloquear la pantalla durante decenas de segundos.
- Mecánica es más rápida: el tope fijo de paso solo se aplica cuando hay
  clavos (la máquina de Atwood se calcula unas cinco veces más rápido) y la
  dinámica se resuelve una sola vez por paso para la derivada y los eventos.

### Corregido

- Una partícula puntual que llegaba justo al extremo de un segmento (el pie
  de una pared que arranca en el suelo) lo atravesaba; y una que pasaba por
  detrás de dos bordes en el mismo instante agotaba los eventos.
- La paleta de objetos de Cinemática y proyectiles no hacía nada: ahora
  lleva al Laboratorio, donde se construyen las escenas libres, y los
  instrumentos dicen que llegan en una próxima versión.
- Las paletas de Termodinámica y Gravitación tampoco hacían nada: ahora
  explican qué falta y dónde llegará (`data-pendiente`, común a todas).
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

[Sin publicar]: https://github.com/Eliam4510/volta-fisica/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/Eliam4510/volta-fisica/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Eliam4510/volta-fisica/releases/tag/v0.1.0
