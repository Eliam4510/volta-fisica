# Módulo Óptica

## 1. Alcance

Óptica geométrica (reflexión, refracción, reflexión total, dispersión,
profundidad aparente, prismas, lentes y espejos) y óptica ondulatoria
(interferencia de Young, rendijas y redes, películas delgadas, anillos de
Newton, interferómetro de Michelson). Es el P5 de los tres exámenes más
recientes con enunciado.

Referencias revisadas: Ray Optics Simulation (simulador 2D de código abierto
con fuentes de rayo, haz y puntual, espejos planos, curvos y parabólicos,
vidrios de cualquier forma, lentes ideales, bloqueadores, regla,
transportador, dispersión cromática y la vista "lo que ve el observador"),
PhET Bending Light y Wave Interference, y la difracción de Fresnel de
Falstad.

## 2. Motores

1. **Trazado de rayos 2D:**
   - intersecciones analíticas con segmentos, arcos y curvas;
   - ley de Snell y reflexión total;
   - coeficientes de Fresnel: cada rayo reparte su intensidad entre el
     reflejado y el transmitido, y el brillo lo muestra;
   - dispersión con índices que dependen de la longitud de onda (fórmulas de
     Cauchy o Sellmeier, con materiales predefinidos: agua, vidrio crown,
     flint, diamante); la luz blanca se descompone en varias longitudes de
     onda con su color real;
   - **búsqueda de imágenes:** se prolongan los rayos que salen de un punto
     y se encuentra dónde convergen (imagen real) o de dónde parecen venir
     (imagen virtual).
2. **Óptica ondulatoria por fasores** (principio de Huygens–Fresnel):
   - suma de las contribuciones de cada fuente o rendija con su fase según
     el camino óptico;
   - patrón de intensidad en la pantalla, con el color real si la luz es
     blanca;
   - índice del medio entre las rendijas y la pantalla.
3. **Películas e interferómetros:**
   - reflexiones múltiples en capas, con el cambio de fase de π al reflejarse
     contra un medio de mayor índice;
   - color de una película según su grosor;
   - cuña de aire, anillos de Newton;
   - Michelson con espejo móvil y lámina insertable, con conteo de franjas.

## 3. Espacios de trabajo

| Espacio | Motor | Enfoque |
|---|---|---|
| Óptica geométrica | Rayos | Refracción, reflexión total, prismas, lentes, espejos, profundidad aparente |
| Interferencia y difracción | Fasores | Young, rendija simple, N rendijas, redes |
| Películas e interferómetros | Capas y fasores | Película delgada, anillos de Newton, Michelson |

## 4. Objetos

### Óptica geométrica

| Objeto | Parámetros |
|---|---|
| Rayo | dirección, longitud de onda o luz blanca, intensidad |
| Haz paralelo | ancho, número de rayos, dirección |
| Fuente puntual | abertura del abanico, número de rayos |
| Objeto luminoso | flecha o forma, para formar imágenes |
| Medio de forma libre | rectángulo, lámina, prisma, círculo (gota), semicírculo, polígono, arcos; n fijo o material dispersivo |
| Capas apiladas | n1, n2, n3… y sus grosores |
| Recipiente con líquido | nivel, índice del líquido |
| Espejo | plano, esférico cóncavo o convexo, parabólico |
| Lente ideal | distancia focal |
| Lente gruesa | radios de curvatura, grosor, material |
| Divisor de haz | fracción reflejada |
| Bloqueador o diafragma | tamaño |
| Pantalla | posición |
| Observador (ojo) | posición; muestra qué ve y dónde lo ve |

### Óptica ondulatoria

| Objeto | Parámetros |
|---|---|
| Fuente monocromática o blanca | longitud de onda, coherencia |
| Rendija simple, doble o N rendijas | ancho, separación, número |
| Red de difracción | líneas por milímetro |
| Pantalla | distancia L, tamaño |
| Medio | índice n entre rendijas y pantalla |
| Película delgada | índice, grosor (constante o en cuña), medio de arriba y de abajo |
| Lente sobre placa | radio de curvatura (anillos de Newton) |
| Interferómetro de Michelson | brazos, espejo móvil (velocidad), lámina insertable (n, grosor) |

## 5. Instrumentos

- Transportador que dibuja la normal en el punto de incidencia y mide los
  ángulos de incidencia y refracción.
- Regla y medidor de camino óptico.
- Ángulo crítico mostrado en cada interfaz.
- Medidor de intensidad.
- Medidor de separación entre franjas.
- **Diferencia de caminos:** dibuja los dos rayos de las rendijas a un punto
  de la pantalla y muestra Δ y Δ/λ.
- Diagrama de fasores en vivo para un punto de la pantalla.
- Contador de franjas (Michelson).

## 6. Visualizaciones

- Rayos con brillo según su intensidad y color según su longitud de onda.
- Prolongaciones de los rayos (líneas discontinuas) e imágenes encontradas.
- Gráfica de intensidad I(x) sobre la pantalla y franjas dibujadas con su
  color.
- Vista opcional de la luz como onda (con el motor de la cubeta) para ver el
  frente que atraviesa las rendijas.
- Colores de la película delgada y de los anillos de Newton.

## 7. Cantidades medibles

Ángulos de incidencia, reflexión y refracción; intensidad de cada rayo;
posición de imágenes y profundidad aparente; separación entre franjas;
intensidad en un punto; diferencia de caminos; número de franjas que pasan.

## 8. Escenarios incluidos

### Tutoriales
1. Refracción de un rayo al pasar del aire al agua.
2. Reflexión total en un semicírculo de vidrio.
3. Prisma con luz blanca.
4. Doble rendija de Young.
5. Película de jabón con luz blanca.

### Ejemplos
Profundidad aparente; fibra óptica; arcoíris en una gota; lente convergente
y divergente; espejo cóncavo; red de difracción contra prisma; anillos de
Newton; cuña de aire; Michelson con una lámina de vidrio.

### MEXT
| Tema | Escenarios |
|---|---|
| Refracción (O1) | 2023 1-(5); 2017 1-(5); 2016 P5; 2015 1-(5); 2014 1-(5); 2012 1-(4); 2009 1-(5) |
| Young (O2) | 2027 P5; 2023 P5; 2018 1-(4) |
| Película delgada (O3) | 2019 P5; 2013 1-(5) |
| Michelson (O4) | 2025 T8 |
| Prisma y red (O5) | 2010 3-C |

## 9. Decisiones y límites

- Óptica 2D (sección plana). Sin polarización en la primera versión; los
  coeficientes de Fresnel usan luz no polarizada.
- Las lentes y los espejos curvos no aparecen en el banco, pero entran porque
  el trazador los resuelve sin trabajo adicional.
