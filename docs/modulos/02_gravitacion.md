# Módulo Gravitación

## 1. Alcance

Movimiento bajo la gravitación universal a escala planetaria: satélites,
órbitas circulares y elípticas, velocidad de escape, órbita geoestacionaria,
leyes de Kepler, sistemas de varios cuerpos y maniobras orbitales. Usa el
mismo motor de cuerpos que Mecánica, con una fuerza 1/r² y escalas
astronómicas.

Referencias revisadas: REBOUND (código de N cuerpos de referencia, con los
integradores IAS15 y WHFast), Universe Sandbox y PhET Gravity and Orbits.

## 2. Motor

| Situación | Método |
|---|---|
| Dos cuerpos | Solución de Kepler analítica como referencia exacta |
| N cuerpos sin encuentros cercanos | Integrador simpléctico (Verlet de velocidad o Yoshida de 4.º orden): la energía no deriva |
| Encuentros cercanos o órbitas muy excéntricas | Integrador adaptativo de alto orden (del tipo IAS15 o Dormand–Prince 8) |
| Impacto con la superficie | Evento de colisión con el radio del planeta |

## 3. Espacios de trabajo

| Espacio | Enfoque |
|---|---|
| Órbitas | Un planeta y satélites; lanzar con distintas velocidades (el cañón de Newton) |
| Sistema solar | Varios cuerpos, leyes de Kepler, datos reales de planetas |
| Maniobras | Impulsos Δv programados: transferencia de Hohmann, escape, circularización |

## 4. Objetos

| Objeto | Parámetros |
|---|---|
| Cuerpo central | masa o g en la superficie, radio, periodo de rotación, fijo o libre |
| Satélite o partícula de prueba | masa (o sin masa), posición, velocidad, o altura y velocidad orbital |
| Cuerpo masivo | masa, radio, posición, velocidad |
| Nave | como el satélite, más impulsos Δv programados |
| Atmósfera | densidad en función de la altura, para arrastre (opcional) |
| Presets | Tierra, Luna, Sol, planetas, con datos reales |

## 5. Instrumentos y visualizaciones

- Elementos orbitales en vivo: semieje mayor, excentricidad, periodo,
  energía específica, momento angular.
- Áreas barridas en intervalos iguales (segunda ley de Kepler).
- Gráfica T² contra a³ de todos los cuerpos (tercera ley).
- Indicador de velocidad de escape y de velocidad circular en el punto
  actual.
- Órbita predicha (la cónica que seguiría sin perturbaciones).
- Sistema de referencia que gira con el planeta: la órbita geoestacionaria se
  ve quieta.
- Campo y potencial gravitatorio como mapa o curvas de nivel; gráfica g(h).
- Escalas lineal y logarítmica de distancias; marcadores del tamaño real.

## 6. Cantidades medibles

r, altura, |v|, energía cinética, potencial y total, momento angular,
periodo medido, elementos orbitales, fuerza gravitatoria, relación F/F0.

## 7. Escenarios incluidos

### Tutoriales
1. Satélite en órbita circular.
2. El cañón de Newton: la misma altura con cinco velocidades.
3. Velocidad de escape.
4. Órbita geoestacionaria en el sistema que gira.

### Ejemplos
Tierra y Luna; planetas interiores con datos reales; transferencia de
Hohmann; órbita elíptica con áreas barridas; problema de tres cuerpos.

### MEXT
2027 1-(2); 2023 P3; 2018 P3; 2015 1-(2); 2014 1-(2); 2013 1-(2); 2010 1-G;
2009 1-(2).

## 8. Decisiones y límites

- Física newtoniana; sin relatividad.
- Las órbitas se dibujan en un plano; una vista 3D es opcional para
  sistemas con inclinación.
