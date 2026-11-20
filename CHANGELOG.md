# Registro de cambios

Todos los cambios importantes de Volta se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [0.25.0] - 2026-11-20

Transistor bipolar en Circuitos.

### Añadido

- Transistor bipolar NPN y PNP (modelo de Ebers–Moll) con ganancia β y
  V_BE ajustables. El inspector lee I_C, I_B, I_E, V_CE, V_BE, la β
  medida y la zona de trabajo (corte, activa o saturación); las gráficas
  pueden mostrar la corriente de base («Q·b»).
- Ejemplos «Transistor como interruptor» (una corriente de base pequeña
  enciende un LED) y «Curva característica del transistor» (barrido de
  I_C contra V_CC con la meseta en β·I_B).

### Corregido

- Newton usa la tolerancia de SPICE (1 µV) en diodos y transistores: con
  una base casi al aire el redondeo no dejaba converger.

## [0.24.0] - 2026-11-20

Diodo Zener y amplificador operacional en Circuitos.

### Añadido

- Diodo Zener: conduce en directa como un diodo y, en inversa, entra en
  ruptura al llegar a Vz y mantiene ese voltaje.
- Amplificador operacional (entradas − y +, salida respecto de tierra):
  ganancia en lazo abierto A y saturación ±Vsat. Funciona en el tiempo
  (con su trabajo en el registro de energía) y en alterna (ganancia A en
  los fasores y el Bode). El inspector dice si trabaja en lineal o
  saturado.
- Ejemplos «Regulador con diodo Zener» (con el barrido de la salida
  contra E) y «Amplificador inversor» (tierra virtual, ganancia
  −R_f/R₁ y recorte al saturar).

## [0.23.0] - 2026-11-20

Transformador en Circuitos.

### Añadido

- Transformador de cuatro bornes: dos bobinas acopladas con inductancia
  del primario, relación de vueltas N₂/N₁ y acoplamiento k. Funciona en
  el tiempo (con la energía mutua M·I₁·I₂ en el registro de energía) y en
  alterna (fasores y Bode).
- El inspector lee voltaje y corriente del primario y del secundario; las
  gráficas pueden mostrar la corriente del secundario («Tr·s»).
- Ejemplo «Transformador reductor» (100 V a 10 V, con n y R en
  deslizadores): la potencia que entra por el primario sale casi entera
  por el secundario.

## [0.22.0] - 2026-11-20

Diodos y LED en Circuitos.

### Añadido

- Diodo con la ecuación de Shockley: conduce desde unos 0.7 V y en
  inversa solo deja pasar su corriente de saturación (nA). Se ajusta con
  el voltaje directo y el factor de idealidad.
- LED de cinco colores (rojo, amarillo, verde, azul y blanco) con su
  voltaje directo típico; en el esquema brilla con su color según la
  corriente.
- Ejemplos «LED con su resistencia» y «Rectificador de media onda con
  filtro» (el capacitor se conecta con un interruptor).
- Las corrientes muy pequeñas se leen en nA.

### Notas

- Con diodos el circuito deja de ser lineal: el inspector ya no muestra
  fasores y la respuesta se ve en la simulación en el tiempo.

## [0.21.0] - 2026-11-20

Corriente alterna en Circuitos.

### Añadido

- Fuente alterna V₀·sen(2πft + φ) con resistencia interna, en la paleta y
  en los escenarios: el transitorio se simula como siempre y el balance
  de energía sigue cerrando.
- Análisis en frecuencia con fasores (admitancias G, jωC y 1/jωL): al
  seleccionar un componente, el inspector da la amplitud de su voltaje y
  su corriente, el desfase, la impedancia |Z| y la potencia media.
- Diagramas de Bode (amplitud y fase contra la frecuencia en escala
  logarítmica) como gráficas de la escena.
- Ejemplos «Resonancia en un RLC serie» y «Filtro RC pasabajas», con la
  frecuencia en un deslizador.
- Las gráficas aceptan un formato propio para el eje horizontal.

## [0.20.0] - 2026-11-20

Volta completo en inglés.

### Añadido

- Inglés en todos los espacios: inspectores, avisos, validaciones,
  herramientas, comandos, gráficas, lecturas, notas y títulos de los
  escenarios de Mecánica, Gravitación, Termodinámica, Electrostática,
  Circuitos, Magnetismo, Ondas, Óptica y Física moderna (unas 3 700
  entradas en el diccionario).
- Los eventos del Laboratorio se escriben en inglés con los nombres
  traducidos («The ball hits the floor»).

### Corregido

- Con la ventana estrecha, el botón de la escena derramaba su contenido
  sobre el nombre del espacio; ahora se recorta por la derecha.
- «Adiabáticas» en las paredes del cilindro se traducía como «Adiabats».


## [0.19.0] - 2026-11-20

Volta en inglés, y ejemplos clásicos nuevos en el Laboratorio.

### Añadido

- Idioma de la interfaz en Configuración → Apariencia: Español, English o
  como Windows. En inglés se traducen los menús, los paneles, los
  diálogos, los avisos, las ayudas y los textos de los lienzos.
- Traducidos por completo: la barra y los menús comunes, Inicio,
  Configuración, los diálogos de guardar y abrir, las actualizaciones, el
  estado inicial de las 25 pantallas y el Laboratorio de Mecánica
  (inspector, herramientas, avisos y escenarios). Lo que aún falta en los
  demás espacios (inspectores al seleccionar, notas de los escenarios,
  descripción de los eventos) sigue en español y se irá completando.
- Laboratorio de Mecánica: ejemplos «Osciladores acoplados» (pulsaciones
  con el acoplamiento kc en un deslizador) y «Escalera que resbala» (deja
  la pared cuando su centro baja a 2/3 de su altura inicial).

### Corregido

- El nombre del módulo y del espacio ya no se monta encima del nombre de
  la escena cuando la ventana es estrecha.
- Ondas · Doppler fallaba si la ventana cambiaba de tamaño antes de la
  primera simulación.

## [0.18.0] - 2026-11-20

Geocentrismo, heliocentrismo y Ptolomeo en el Sistema solar; fuerzas que
cambian con el tiempo en el Laboratorio de Mecánica.

### Añadido

- Sistema solar: «Centro» de la vista elegible (inercial, Sol, Tierra o el
  cuerpo seleccionado, tecla G). Con la Tierra quieta, las trazas muestran
  los bucles retrógrados de Marte y Venus; con el Sol, las órbitas de
  Copérnico.
- Capa «Ptolomeo» (tecla E): deferente y epiciclo de cada planeta, la misma
  geometría que el modelo heliocéntrico sumada en otro orden.
- Ejemplo «Cielo geocéntrico: bucles de Marte y Ptolomeo».
- Laboratorio de Mecánica: la fuerza aplicada puede ser constante,
  senoidal (F·sen(2πft + φ)) o un pulso entre t₀ y t₁; su trabajo aparece
  como trabajo de la fuerza aplicada en Energía. La frecuencia, la fase y
  los instantes del pulso pueden ser variables.
- Ejemplo «Resonancia forzada» con la frecuencia en un deslizador y la
  gráfica x(t).
- Selector de gravedad en la escena: Tierra, Luna, Marte, Júpiter o sin
  gravedad.

## [0.17.0] - 2026-11-20

Configuración como pantalla propia, más colores, gráficas que se exploran
con el ratón y campos que aceptan cualquier forma de escribir un número.

### Añadido

- Configuración es una pantalla (engranaje en todas las barras, Ctrl+,)
  con Apariencia, Números, Escritura de valores, Actualizaciones, Archivos
  y Acerca de. Buscar e instalar actualizaciones está ahí.
- Seis colores de acento (tinta, azul, verde, violeta, ámbar, rojo) y tres
  matices de las superficies (neutro, cálido, frío), en claro y oscuro.
- Teclado de símbolos y unidades al escribir en un campo de valor: ×10ⁿ,
  ^, ², ³, √, π, paréntesis y las unidades de la misma magnitud.
- Gráficas interactivas en todas las pantallas: rueda para acercar o
  alejar, arrastrar para desplazar, doble clic para verlo todo y lectura
  de los valores de cada serie bajo el cursor.
- Separador decimal elegible (punto o coma) para escribir, leer y
  exportar CSV.
- Accesibilidad: nombre de los botones de icono, ayudas con el teclado,
  lienzos descritos y avisos anunciados al lector de pantalla.

### Corregido

- Un campo con unidad rechazaba una expresión sin unidad («2×10^30» en la
  masa del Sol: «este campo espera una masa»); ahora se lee en la unidad
  del campo en todas las pantallas.

## [0.16.0] - 2026-11-19

Primera versión que se comporta como una aplicación de Windows: archivos de
verdad con aviso de cambios sin guardar, escenas .volta que se abren desde
el Explorador, Inicio con buscador, Nueva escena y Ajustes, y
actualizaciones automáticas desde GitHub. Las versiones anteriores no se
actualizan solas: esta hay que instalarla a mano una vez.

### Añadido

- Actualizaciones desde GitHub: Volta instalado busca versiones nuevas al
  abrir Inicio (cada 6 horas como mucho) y con «Buscar actualizaciones»; el
  aviso muestra las novedades y «Instalar y reiniciar» descarga el
  instalador firmado, comprueba la firma, lo instala y reinicia. «Ahora no»
  no vuelve a anunciar esa versión. La portátil abre la página de descarga.
  Cada release adjunta `latest.json` y el instalador firmado.
- Documentos de verdad en las 23 pantallas: Guardar escribe en el archivo
  de la escena (la primera vez pregunta dónde) y Guardar como (Ctrl Mayús
  S) elige otro; el título de la ventana dice el archivo y marca los
  cambios sin guardar, igual que el punto junto al nombre de la escena.
  Antes de perder cambios (otra escena del catálogo, abrir un archivo,
  cerrar la ventana, abrir desde Inicio una escena de esa pantalla) Volta
  pregunta si guardarlos. Abrir y Guardar están a la vista en todas las
  barras.
- Los archivos .volta se abren con Volta desde Windows: doble clic en el
  Explorador, arrastrarlos a la ventana o abrirlos con Volta ya abierta
  (una sola instancia). Cualquier archivo va a la pantalla de su módulo y
  espacio, también con Ctrl O desde otro módulo.
- Inicio: buscador de módulos, espacios, escenas, archivos y acciones
  (Ctrl K); «Nueva escena» elige módulo y espacio (vacía donde se puede);
  «Archivos recientes» con rutas reales; Ajustes (tema claro, oscuro o el
  de Windows, también en la barra de título; tamaño de la interfaz de 90 a
  150 %; buscar actualizaciones al abrir).
- La ventana recuerda su tamaño y posición, arranca maximizada y cabe en
  pantallas de 1366 × 768.

### Cambiado

- La aplicación ya no se comporta como un navegador: sin menú contextual de
  Edge, sin recargar con F5 ni ir atrás con Alt+←, sin seleccionar el texto
  de la interfaz.
- El ejecutable solo lleva la aplicación: la guía del lenguaje de diseño,
  el catálogo de iconos y los generadores quedan fuera (y sus botones,
  fuera de Inicio).

### Quitado

- Controles que no hacían nada o solo avisaban de algo futuro: paletas de
  Cinemática y Órbitas (ahora llevan al Laboratorio, a Sistema solar o a
  Maniobras), atmósfera, sonda de potencial y voltímetro, resorte del
  laboratorio de gases, «Añadir variable» y «Añadir objeto» sin efecto, y
  la escena inventada de la Biblioteca.

### Corregido

- Se perdía trabajo sin aviso: al elegir otra escena o abrir un archivo se
  sobrescribía el autoguardado, y una pantalla abierta desde la Biblioteca
  no autoguardaba en toda la sesión. «Nueva escena» de Inicio borraba el
  trabajo de Mecánica.

## [0.15.0] - 2026-11-19

Fricción entre discos que giran y espejo parabólico en Óptica.

### Añadido

- Óptica: espejo parabólico (radio de curvatura R en el vértice, f = R/2):
  todos los rayos paralelos al eje pasan exactamente por el foco. Ejemplo
  «Espejo parabólico y aberración esférica», para compararlo con el
  esférico de la misma apertura.
- Mecánica: fricción entre dos discos apoyados uno en otro si alguno gira
  (con la fricción entre cuerpos de la escena): se frenan y se hacen girar
  hasta rodar uno sobre otro, con el momento lineal y el angular
  conservados. El Laboratorio muestra la normal y la fricción del par en el
  punto de contacto.

### Corregido

- El sentido de la fricción de un vértice de bloque al empezar cada tramo
  se calculaba con la velocidad del centro, no con la del vértice.
- Cuando ningún sentido de deslizamiento es coherente y la adherencia pide
  un poco más que μs·N (paradoja de Painlevé, un bloque que vuelca sobre su
  arista), el apoyo queda pegado en el límite del cono en vez de repetir el
  evento sin fin.

## [0.14.0] - 2026-11-19

Empujar un bloque en cualquier punto y apilar cajas: los bloques chocan
entre sí y con los discos.

### Añadido

- Mecánica: fuerza aplicada en un punto de un cuerpo que gira: hace par y
  su energía entra en el balance. Ejemplo «Empujar un bloque: ¿vuelca o
  desliza?», con la altura del empuje como variable.
- Mecánica: los bloques tienen caras y esquinas: se apilan, otro bloque se
  apoya o choca en ellas y los discos chocan con sus caras y esquinas (con
  giro, Coriolis y centrípeta en cada fila). Fricción entre cuerpos en la
  escena. Ejemplo «Cajas apiladas y una bola que las golpea».
- Laboratorio: las normales y fricciones de un bloque salen de sus vértices
  y la fuerza aplicada, de su punto.

## [0.13.0] - 2026-11-19

Bloques rígidos en Mecánica: rectángulos que giran, se apoyan por sus
vértices y vuelcan.

### Añadido

- Motor de Mecánica: bloque rígido (ancho × alto, I = m(a² + h²)/12) que se
  apoya en las superficies por sus cuatro vértices. Cada apoyo es una fila
  más del mismo sistema, con su entrada de giro, así que el problema de
  complementariedad decide qué vértices empujan: el bloque se queda, desliza
  o vuelca sobre una arista según la fricción y la geometría (tan θ > a/h).
  Validado contra el vuelco sobre una arista (el vértice no se mueve y
  ½I_pω² = mgΔh), el deslizamiento sin giro y caídas con el balance de
  energía cerrado. 6 pruebas nuevas.
- Laboratorio: herramienta Bloque con tamaño, orientación y velocidad
  angular; se apoya de plano en un segmento, se dibuja girado (también en el
  estroboscopio), su estado dice si está de plano o sobre una arista y los
  vectores de normal y fricción salen de las reacciones en sus vértices.
  Ejemplo: dos bloques en un plano de 25°, uno se queda y otro vuelca.

### Corregido

- La adherencia al arrancar y al dejar de deslizar se decide para todos los
  apoyos quietos a la vez: uno a uno, el primer apoyo cargaba con toda la
  fricción y un cuerpo con dos apoyos arrancaba deslizando.
- Al invertirse el deslizamiento se elige el sentido coherente con la
  fricción cinética (antes el evento podía repetirse sin fin).
- Un choque repetido en el mismo instante (impulsos secuenciales entre dos
  apoyos de un mismo cuerpo) se anota una sola vez.

## [0.12.0] - 2026-11-19

Los discos de Mecánica giran: ruedan sin deslizar, deslizan girando y la
fricción hace par en el punto de contacto.

### Añadido

- Motor de Mecánica: un disco con inercia (I = k·m·r²; ½ disco, ⅖ esfera,
  1 aro) tiene ángulo y velocidad angular. La adherencia en el apoyo es la
  rodadura sin deslizar y la fricción cinética frena y hace girar a la vez;
  el balance de energía incluye ½Iω². Validado contra la rodadura por un
  plano (a = g·sen θ/(1 + k)), el umbral μs = tan θ·k/(1 + k), la bola de
  bolos (rueda a 5/7 de v₀ en t = 2v₀/(7μg)), el efecto hacia atrás (se
  conserva el momento angular respecto del suelo) y la rodadura dentro de un
  cuenco (periodo exacto con largo (R − r)(1 + k)). 11 pruebas nuevas.
- Laboratorio: giro en el inspector (No, Disco, Esfera, Aro) y velocidad
  angular inicial; el disco dibuja un radio que gira; lecturas de ω y de la
  energía de rotación; ω elegible en las gráficas; los vectores de fricción
  y normal de un disco que rueda salen de I·α. Ejemplos nuevos: carrera de
  aro, disco y esfera con fotopuertas, y bola que desliza y acaba rodando.

### Corregido

- El sentido de la fricción cinética queda fijo en cada tramo: el instante
  en que un cuerpo deja de deslizar se localizaba hasta 10⁻⁸ s tarde porque
  el paso que contenía el cero mezclaba los dos sentidos.

## [0.11.0] - 2026-11-19

Gravitación con sus tres espacios (Sistema solar y Maniobras, sobre un
motor de N cuerpos) y Termodinámica como caja de arena: montar escenas
propias e instrumentos en sus cuatro espacios.

### Añadido

- Gravitación: espacios nuevos «Sistema solar» (cuerpos colocados
  libremente que se atraen entre sí, planetas con datos reales J2000,
  escala lineal o logarítmica, T² contra a³ de todos, áreas barridas,
  centro de masa, tres cuerpos de Burrau y la figura en ocho) y
  «Maniobras» (nave con un programa de impulsos en instantes o en el
  periapsis o el apoapsis, órbita predicha tras cada impulso, Δv total y
  Hohmann a un clic). Motor de N cuerpos con Yoshida 4 y Bulirsch–Stoer
  adaptativo en los encuentros cercanos, fusiones y aterrizajes. 32
  pruebas nuevas.

- Termodinámica es una caja de arena en sus cuatro espacios: las paletas
  colocan, arrastran y quitan objetos (cilindro con pesa, calentador y
  baño; filas de recipientes con válvulas, tabiques o émbolos; globo;
  columna de líquido; caja molecular con bombas de varias especies,
  tabique con orificio y émbolo; cuerpos de ocho materiales, calorímetro,
  calentador y baño), con inspector con unidades, deshacer y guardado.
  Instrumentos con lectura: termómetro, manómetro, regla, cronómetro,
  histograma con Maxwell–Boltzmann y molécula marcada. En Ciclos, los
  estados se arrastran en el diagrama P-V según lo que deja libre cada
  tramo. Lo que el motor no sabe simular junto se impide con un mensaje.
  20 pruebas nuevas.

## [0.10.0] - 2026-11-19

Cubeta de ondas 2D y Circuitos con sus 10 escenas MEXT: 155 escenas MEXT
en total.

### Añadido

- Ondas y sonido: espacio nuevo «Cubeta de ondas», con la ecuación de onda
  2D en malla (condición CFL, bordes abiertos con capa amortiguadora y Mur)
  y el modelo analítico de fuentes puntuales. Fuentes puntuales, lineales y
  arreglos, barreras y rendijas, zonas de distinta rapidez (la refracción
  sale sola), líneas nodales y antinodales con su |Δ|, punto de prueba con
  r₁, r₂ y Δ/λ, y vistas de onda, frentes e intensidad. Escenas MEXT 2017
  P5, 2007 1-(4), 2010 3-A y 2010 3-B; 2012 P5 en «Doppler y acústica».
  Ondas tiene ya sus 21 escenas MEXT. 38 pruebas nuevas.

- Circuitos: las 10 escenas MEXT del tema (nuevas: 2014 1-(4), 2013 P2,
  2012 1-(2), 2010 4-C, 2007 1-(2), la parte de circuito de 2007 P2 y 2006
  P2), cada una con un grupo «Examen» que muestra la medida, la fórmula del
  enunciado y la opción. Capacitor cuya capacidad cambia en el tiempo (una
  placa que entra o sale), con el trabajo de la fuerza en el balance de
  energía. Tutorial «Ley de Ohm con voltímetro y amperímetro» y ejemplo
  «Dos capacitores que comparten carga». 34 pruebas nuevas.

### Corregido

- Ondas: abrir una escena de otro espacio del módulo desde «Medio 1D» o
  «Doppler y acústica» la cargaba en la pantalla equivocada; ahora se abre
  en la suya.

- Circuitos: un evento «Conexión inicial» espurio en t = 0 con todo
  descargado; corrientes falsas de 10⁻⁹ A en un capacitor descargado entre
  dos nodos al mismo potencial; el menú decía «Ejemploes»; error con el
  lienzo sin tamaño; el voltímetro aparecía como «0 A».

## [0.9.0] - 2026-11-19

Los nueve módulos disponibles: Magnetismo e inducción y Física moderna
nuevos, Termodinámica con cuatro espacios y Electrostática con dos, y 143
escenas MEXT en total. Panel de variables en el Laboratorio de Mecánica.

### Añadido

- Módulo Magnetismo e inducción con tres espacios de trabajo:
  - «Campos magnéticos»: hilos, segmentos, espiras, solenoides e imanes por
    Biot–Savart, con líneas, ⊙/⊗, brújulas, sonda de B, fuerza entre
    corrientes y perfiles del campo.
  - «Partículas en E y B»: integrador de Boris (|v| se conserva en mil
    vueltas), fuente de iones con varias especies, regiones de campo,
    placas, pantalla detectora, ciclotrón y efecto Hall; radio y periodo
    medidos contra mv/(|q|B) y 2πm/(|q|B).
  - «Inducción»: rieles con una o dos barras, espiras, hilos con corriente
    variable, campos B(t) y generador, con flujo por intersección exacta
    de polígonos, sentido de Lenz y registro de energía.
  - 47 pruebas y las 13 escenas MEXT del tema.
- Electrostática: menú de escenas (tutoriales, ejemplos y las 10 MEXT de
  cargas) en «Cargas y campos», con hilos, segmentos, anillos, láminas,
  esferas y campo uniforme, y el instrumento de Gauss. Espacio nuevo
  «Conductores y dieléctricos»: capacitores de placas, esféricos y
  coaxiales con dieléctricos y conductores, batería conectada o no, y las
  8 escenas MEXT de conductores y capacitores. 66 pruebas nuevas.
- Termodinámica: menú de escenas en el «Laboratorio de gases» (cilindro
  inclinado o que gira, recipientes con válvulas y mezcla, globos, burbujas)
  y tres espacios nuevos: «Ciclos y diagrama P-V» (el lienzo es el propio
  diagrama; dibujar ciclos con clics; Q, W y ΔU por tramo y rendimiento),
  «Gas molecular» (discos con choques por eventos; presión por impulso en
  las paredes, Maxwell–Boltzmann, efusión de Graham) y «Calor y
  calorimetría». Motores nuevos de ciclos, gas molecular, recipientes y
  calor; 29 de los 30 problemas MEXT del tema (2025 T7 solo tiene el tema
  en el banco). 127 pruebas nuevas.
- Módulo Física moderna con dos espacios: «Efecto fotoeléctrico» (fototubo
  con lámparas de λ o f, placa de metal, colector y fuente; curva I–V,
  K_max contra f y medida de h por la pendiente de V₀) y «Núcleo» (carta
  N–Z con cadenas y valle de estabilidad, muestra que decae con T½ medido,
  decaimiento puntual con retroceso). Constantes CODATA, masas AME2020 y
  periodos NUBASE; 44 pruebas y las 4 escenas MEXT del tema.
- Con los nueve módulos disponibles, Inicio ya no tiene ninguno «En
  preparación».

- Laboratorio: panel de variables, como en los demás módulos. Una variable
  es un deslizador que fija a la vez varias propiedades (la rapidez de dos
  pelotas, el μs de un plano); los campos ligados se ven como la variable.
  El plano inclinado y las escenas MEXT 2008 1-(1), 2015 1-(1), 2016 P3 y
  2018 1-(1) traen las suyas. Clic derecho en un campo numérico del
  inspector lo convierte en variable; en un campo ligado, lo desliga.

## [0.8.0] - 2026-11-19

Mecánica con 38 escenas MEXT: movimiento impuesto por tramos, prensa
hidráulica, estática con cuerpos de varillas e instrumentos (regla y
fotopuerta). Inicio muestra las escenas recientes reales.

### Añadido

- Laboratorio de Mecánica: seis escenas MEXT nuevas de cinemática y
  proyectiles, con pruebas de sus respuestas: 2008 1-(1) (alcance a 45° y a
  30°), 2010 1-C (altura en un instante del vuelo), 2015 1-(1) (alcance de un
  tiro oblicuo), 2016 1-(1) (coche que acelera desde el reposo), 2018 1-(1)
  (ángulo de llegada de un tiro horizontal) y 2027 1-(1) (lanzamiento
  vertical).
- Mecánica: movimiento impuesto con aceleración por tramos (un ascensor que
  arranca y frena, un móvil que sigue una gráfica v–t). En el Laboratorio,
  ejemplo «Ascensor que arranca y frena» (peso aparente) y escenas MEXT 2017
  1-(1), 2019 1-(1) y 2023 1-(1) con gráficas v–t reconstruidas.
- Laboratorio: escena MEXT 2010 1-B (palo con una caja en una cuesta), un
  cuerpo rígido hecho con un triángulo de varillas sostenido por dos apoyos
  verticales: F_A/F_B = (1 + tan θ)/(1 − tan θ).
- Laboratorio: prensa hidráulica (conector entre dos émbolos con razón de
  áreas n): el líquido conserva el volumen y la presión es la misma en los
  dos émbolos. Escena MEXT 2010 1-A. Mecánica tiene ya 38 escenas MEXT.
- Laboratorio: instrumentos «Regla» (distancia, Δx, Δy y ángulo entre dos
  puntos) y «Fotopuerta» (un haz que anota el instante exacto y la rapidez
  de cada paso de un cuerpo; un rombo marca cada paso en el lienzo). No
  afectan a la física.
- Laboratorio: el perfil de aceleración de un cuerpo con movimiento
  impuesto se edita en el inspector (tramos con su instante final y su
  aceleración; añadir y quitar tramos), con validación del orden.
- Motor de Mecánica: las velocidades iniciales incompatibles con una varilla
  o una prensa se proyectan como un impulso que conserva el momento.
- Laboratorio: las fuerzas que muestra el inspector incluyen la reacción
  sobre el cuerpo que lleva una superficie, y los cuerpos con movimiento
  impuesto ya no distorsionan el cálculo de las demás fuerzas.

### Corregido

- Electrostática: el potencial sobre un segmento cargado daba infinito; la
  carga encerrada por un cilindro de Gauss ignoraba la altura de esferas y
  segmentos respecto de las tapas.

- Inicio mostraba en «Continuar» cuatro escenas fijas de ejemplo («Hace 5
  min», «Ayer») que nadie había abierto. Ahora muestra lo último que se
  trabajó de verdad en cada pantalla de este equipo (lo registra el
  autoguardado) y, si no hay nada, lo dice.
- Las marcas del eje vertical de las gráficas se cortaban a la izquierda con
  valores grandes: el margen se ajusta ahora a la marca más ancha.
- Gravitación: alrededor del Sol, las distancias y áreas de las gráficas se
  dan en Gm y Gm² en vez de Mm y Mm².
- Los subíndices de las lecturas son algo más grandes: v_c y v_e ya no se
  confunden.

## [0.7.0] - 2026-11-19

Contactos de Mecánica como problema de complementariedad, energía disipada
contabilizada entera, superficies que se mueven y movimiento impuesto, y las
ocho escenas MEXT de Gravitación.

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

[Sin publicar]: https://github.com/Eliam4510/volta-fisica/compare/v0.11.0...HEAD
[0.11.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/Eliam4510/volta-fisica/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Eliam4510/volta-fisica/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Eliam4510/volta-fisica/releases/tag/v0.1.0
