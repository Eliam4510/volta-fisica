# Volta — Análisis del temario de Física MEXT

Documento base para decidir qué debe simular Volta. Todo lo que sigue sale de
leer completo el banco `Fisica.csv` y de clasificar cada reactivo a mano
(clasificación reproducible en `analisis/clasificar.py`, resultado en
`analisis/clasificacion.csv`).

## 1. Fuente y alcance

| Dato | Valor |
|---|---|
| Reactivos | 368 |
| Exámenes | 17: 2006–2010, 2012–2020, 2023, 2025, 2027 |
| Años ausentes en el banco | 2011, 2021, 2022, 2024, 2026 |
| Reactivos con figura | 288 (78 %), que citan 124 figuras distintas |
| Reconstruidos de memoria | 2027 completo (22), parte de 2023 (P1-(5) y P4) |
| Solo tema, sin enunciado | 2025 (8 temas) |

Consecuencia práctica: casi cuatro de cada cinco reactivos dependen de una
figura. El simulador tiene que poder reproducir la situación de la figura, no
solo los números del enunciado.

## 2. Estructura del examen

Desde 2006 el examen tiene una forma muy estable: un problema de preguntas
sueltas y cuatro problemas largos, cada uno de un área.

| Año | P2 | P3 | P4 | P5 |
|---|---|---|---|---|
| 2027 | Choque 2D | Cargas puntuales | Expansión libre / mezcla | Young |
| 2023 | Red de capacitores | Satélite | Isoterma vs. adiabática | Young en un medio |
| 2020 | Cargas puntuales | Choque + resorte | Globo aerostático | Doppler + pulsaciones |
| 2019 | RC y LC | Tiro hacia una pendiente | Émbolo con masa | Película delgada |
| 2018 | Espira entrando a B | Gravitación | Ciclo P-V | Onda sonora de presión |
| 2017 | Capacitor con dieléctrico | Bola que deja un hemisferio | Ciclo P-V | Dos parlantes |
| 2016 | Partícula en B | Bloques apilados con fricción | Mezcla de gases | Reflexión total |
| 2015 | Barra en rieles inclinados | Choque + MAS vertical | Émbolo, calor | Tubo resonante |
| 2014 | Efecto Hall | Péndulo con clavo | Ciclo P-V | Doppler con pared |
| 2013 | Red de capacitores | Placa sobre dos planos | Mezcla O2/N2, gamma | Doppler (ambulancia) |
| 2012 | Espira cayendo en B | Curva parabólica + vuelo | Composición del aire | Doppler (ventilador) |
| 2009 | Espectrómetro de masas | Cuerda que se afloja | Cp, Cv | Doppler con viento |
| 2008 | Dipolo, escape | Oscilación en pared curva | Mezcla, v_rms | Ondas de agua estacionarias |
| 2007 | Conductor insertado en capacitor | Barra dentro de hemisferio | Velocidad del sonido en gases | Doppler con viento 2D |
| 2006 | RC con interruptores | Objeto que deja una esfera | Cp con calentador | Doppler en ondas de agua |

Patrón: P2 y P3 son electromagnetismo y mecánica (en 2027 se invirtieron), P4
es siempre termodinámica y P5 alterna entre ondas y óptica. En los tres
exámenes más recientes con enunciado (2019, 2023, 2027) el P5 fue de óptica
ondulatoria.

Esto sugiere directamente la organización de la suite: cinco módulos que
coinciden con los cinco bloques del examen.

## 3. Peso por área

| Área | Reactivos | % del banco | % en 2016–2027 |
|---|---:|---:|---:|
| Mecánica | 110 | 29.9 | 30 |
| Electromagnetismo | 100 | 27.2 | 27 |
| Termodinámica | 79 | 21.5 | 21 |
| Ondas | 49 | 13.3 | 10 |
| Óptica | 26 | 7.1 | 12 |
| Física moderna | 4 | 1.1 | 0 |

La física moderna (fotoeléctrico y física nuclear) no aparece desde 2012.

## 4. Subtemas ordenados por peso

"Exámenes" cuenta en cuántos de los 17 aparece el subtema.

| Código | Subtema | Reactivos | Exámenes | Qué tiene que hacer el simulador |
|---|---|---:|---:|---|
| M4 | Energía y trayectorias restringidas | 28 | 6 | Partícula sobre esfera, hemisferio, curva o cuerda; detectar el instante en que la normal o la tensión se anulan y pasar a vuelo libre |
| E3 | Capacitores | 26 | 9 | Placas con dieléctrico o conductor insertado, redes con interruptores, carga conservada en nodos aislados, balance de energía (batería, campo, calor Joule) |
| T2 | Procesos y primera ley | 25 | 12 | Émbolos con masa, atmósfera, cilindro inclinado o volteado, recipientes divididos; Q, W y ΔU por tramo |
| W3 | Efecto Doppler | 25 | 9 | Fuente y observador móviles, viento, reflexión en pared móvil, geometría 2D, pulsaciones; idealmente con audio |
| E1 | Electrostática | 22 | 10 | Campo y potencial de cargas puntuales, energía potencial U(y), trabajo, trayectorias, velocidad de escape |
| T5 | Teoría cinética, Cp, Cv, gamma | 21 | 5 | Mezclas de gases, grados de libertad, v_rms por especie, velocidad del sonido en gases |
| M7 | Oscilaciones | 19 | 6 | Resortes en serie y paralelo, masa colgante, choque que inicia un MAS, cuerda elástica que solo jala |
| E8 | Inducción | 18 | 6 | Barra en rieles, espira entrando o cayendo en B, espira alejándose de un hilo, generador rotatorio, velocidad terminal |
| M8 | Gravitación | 15 | 8 | Órbitas circulares, geoestacionaria, escape, Kepler |
| T3 | Ciclos P-V | 15 | 4 | Calor por tramo, trabajo neto, eficiencia |
| E6 | Partículas en B y E×B | 12 | 4 | Órbita circular, selector de velocidades, espectrómetro de masas |
| M9 | Estática del cuerpo rígido | 11 | 3 | Barra o placa apoyada en superficies lisas: ¿existe el equilibrio para estos ángulos? |
| W2 | Ondas estacionarias | 10 | 4 | Cuerdas, tubos con pistón (resonancias sucesivas), canales de agua |
| T4 | Expansión libre y mezcla | 10 | 3 | Recipientes conectados por válvula, equilibrio final |
| O1 | Refracción y reflexión total | 10 | 7 | Snell, profundidad aparente, láminas, gota de agua, guía de luz |
| E4 | Circuitos DC y RC | 9 | 5 | Puentes, voltímetro, bombilla no lineal (recta de carga), transitorios RC |
| M5 | Momento y choques | 9 | 6 | Choques 1D y 2D, restitución, rebotes sucesivos, impulso |
| O2 | Doble rendija de Young | 9 | 3 | Separación de franjas, en vacío y en un medio |
| M2 | Tiro horizontal y oblicuo | 9 | 6 | Incluido el impacto contra una pendiente |
| M3 | Dinámica con fricción | 8 | 3 | Tensiones, plano inclinado, bloques apilados con deslizamiento relativo |
| W1 | Ondas viajeras | 7 | 4 | y(x,t) desde una instantánea, ondas longitudinales, reflexión en extremo fijo |
| T1 | Gas ideal y densidad | 6 | 3 | Densidad del aire, globo aerostático (con flotación) |
| M1 | Cinemática y gráficas v-t | 6 | 6 | Área bajo la curva, posición final |
| W4 | Interferencia de dos fuentes | 5 | 2 | Parlantes en fase, mínimos y máximos sobre una línea |
| O3 | Película delgada | 5 | 2 | Cambio de fase en la reflexión, incidencia oblicua |
| E9 | Circuitos LC | 5 | 1 | Oscilación de corriente tras cambiar el interruptor |
| E7 | Efecto Hall | 5 | 1 | Deriva de portadores, voltaje Hall, densidad n |
| M6 | Movimiento circular | 3 | 3 | Fuerza centrípeta, resorte que gira |
| Q2 | Física nuclear | 3 | 3 | Decaimientos alfa y beta, fisión, retroceso |
| E2 | Conductores y Gauss | 2 | 2 | Cascarón conductor, hilo infinito |
| T6 | Calorimetría | 2 | 1 | Equilibrio térmico, conversión de energía |
| W5 | Refracción de ondas | 2 | 1 | Olas en aguas someras, sonido en una inversión térmica |
| M10 | Fluidos | 1 | 1 | Prensa hidráulica |
| M11 | Movimiento relativo | 1 | 1 | Cruce de un río |
| O4 | Michelson | 1 | 1 | Medir un índice de refracción contando franjas |
| O5 | Prisma y red de difracción | 1 | 1 | Orden de colores en cada caso |
| E5 | Campo de corrientes | 1 | 1 | Dos hilos paralelos |
| Q1 | Efecto fotoeléctrico | 1 | 1 | Función trabajo |

## 5. Hallazgos que condicionan el diseño

1. **Los problemas largos cambian de régimen a mitad del camino.** La bola
   resbala por la esfera y luego vuela; la cuerda se afloja y la bola cae en
   parábola hasta que la cuerda vuelve a tensarse; el proyectil choca con el
   bloque y luego oscilan juntos. Un integrador ordinario no basta: hace falta
   un motor de fases con eventos que detecte con precisión el instante exacto
   del cambio (normal igual a cero, tensión igual a cero, contacto con el
   suelo). Esto afecta a M4, M5, M7, M2 y M3, que suman 73 reactivos.

2. **El balance de energía es transversal.** Trabajo de la batería contra
   energía almacenada contra calor Joule (capacitores), trabajo de la gravedad
   convertido en calor (inducción), Q, W y ΔU (termodinámica), energía perdida
   en choques. Volta necesita un "libro mayor de energía" común a todos los
   módulos, que muestre a dónde va cada joule.

3. **Las respuestas son simbólicas y de opción múltiple.** Todos los exámenes
   con enunciado oficial (2006–2023) son de opción múltiple; desde 2014 casi
   siempre se elige entre seis fórmulas (a)–(f). Un simulador numérico puede
   decidir cuál es la correcta: evalúa las seis fórmulas con los parámetros de
   la escena y las compara con lo que midió. Esta es la conexión más fuerte
   entre la suite y el banco.

4. **Varias respuestas son gráficas.** "Elige la gráfica de I_L(t)", "elige la
   onda en t = 2 s", "elige U(y)". El simulador debe poder graficar cualquier
   cantidad contra el tiempo o contra la posición.

5. **El Doppler domina el área de ondas** (25 de 49 reactivos), con viento,
   reflexión en una pared móvil y geometría en dos dimensiones. Un modelo
   cinemático exacto de frentes de onda, más audio sintetizado de lo que oye el
   observador, cubre todos los casos del banco.

6. **La termodinámica aparece en todos los exámenes.** El módulo de gas con
   émbolos, recipientes y válvulas tiene prioridad alta aunque el área pese
   menos que mecánica.

7. **La óptica ondulatoria va en aumento** como P5 reciente: Young, película
   delgada y Michelson.

8. **La física moderna es marginal** (4 reactivos, ninguno desde 2012). Va al
   final de la hoja de ruta.

## 6. Zona gris: temas que no aparecen en el banco

El examen se basa en el nivel de bachillerato. Hay temas de ese nivel que no
aparecen en ninguno de los 17 exámenes del banco: lentes y espejos curvos,
corriente alterna (reactancia, impedancia), modelo atómico de Bohr, rayos X,
dualidad onda-partícula y semiconductores. No son prioridad, pero conviene que
la arquitectura no los impida: el trazador de rayos admite lentes sin cambios
y el solucionador de circuitos admite corriente alterna.
