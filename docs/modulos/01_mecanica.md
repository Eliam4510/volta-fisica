# Módulo Mecánica

## 1. Alcance

Movimiento de partículas y cuerpos rígidos en un plano vertical u horizontal:
cinemática, fuerzas, energía, trayectorias sobre superficies, cuerdas y
resortes, choques, oscilaciones, equilibrio de cuerpos rígidos e
hidrostática. Es el módulo más pesado del temario (30 %) y el que construye el
motor de cuerpos que usan Electrostática, Magnetismo y Gravitación.

Referencias revisadas: Working Model 2D (simulación de mecanismos con
articulaciones, ranuras, cuerdas, poleas, resortes y medidores), Algodoo
(caja de arena 2D), PhET (Projectile Motion, Energy Skate Park, Masses and
Springs) y KDE Step.

## 2. Motor

### Dos modos de cálculo

| Modo | Para qué | Cómo |
|---|---|---|
| **Preciso** (por defecto) | Escenas con pocos cuerpos donde importa el instante exacto de cada cambio | Ecuaciones de movimiento con multiplicadores de Lagrange para las restricciones, integración Dormand–Prince adaptativa con salida densa y detección de eventos |
| **Multitud** | Cientos de cuerpos que chocan (pilas de bloques, bolas en una caja) | Paso fijo con impulsos y solucionador iterativo de contactos, como los motores de juegos |

El modo preciso es lo que separa Volta de una caja de arena tipo juego: en un
motor de juego, la bola que resbala por una esfera se despega "más o menos"
cuando la penetración y el rebote lo permiten; en Volta se despega en el
ángulo exacto en que la normal se anula.

### Restricciones y eventos

- **Bilaterales** (siempre activas): varilla rígida, pasador, riel o ranura,
  fijación.
- **Unilaterales** (pueden activarse y desactivarse):
  - contacto con una superficie: activo mientras la normal sea positiva;
  - cuerda: activa mientras la tensión sea positiva;
  - cuerda elástica: solo jala, nunca empuja.
- **Eventos que vigila el motor:**
  - la normal se anula y el cuerpo se despega;
  - la cuerda se afloja, o se vuelve a tensar con un tirón (impulso);
  - llega un contacto nuevo, que es un choque con coeficiente de
    restitución;
  - la velocidad relativa se anula y la fricción pasa de cinética a estática;
  - la fuerza necesaria supera μs·N y el cuerpo empieza a deslizar.
- Cada evento se localiza con precisión de máquina sobre la salida densa del
  integrador (método de Brent). Así funciona también Simbody, que usa el signo
  de la fuerza normal para decidir cuándo se desactiva un contacto.
- **Rebotes infinitos:** con e < 1 hay infinitos rebotes en tiempo finito;
  por debajo de un umbral el cuerpo pasa a reposo y queda registrado.

### Fuerzas

- Gravedad uniforme (magnitud y dirección editables).
- Resortes lineales (k, longitud natural); cuerda elástica (solo tensión).
- Amortiguadores (c).
- Fricción de Coulomb (μs, μk) por par de superficies.
- Resistencia del aire lineal o cuadrática (opcional, apagada por defecto).
- Empuje y arrastre dentro de regiones de fluido.
- Fuerzas aplicadas: constantes, función del tiempo o función del estado.
- Motores (velocidad o par) y propulsores.
- Fuerzas de otros módulos cuando la escena las activa: eléctrica, magnética.

## 3. Espacios de trabajo

| Espacio | Enfoque | Herramientas destacadas |
|---|---|---|
| Cinemática y proyectiles | Movimiento prescrito y tiro | Lanzador, gráficas x-t, v-t, a-t, alcance y altura máxima marcados |
| Dinámica y fuerzas | Bloques, planos, poleas, fricción | Diagrama de cuerpo libre automático, dinamómetros |
| Energía y trayectorias | Pistas, superficies curvas, péndulos | Barras de energía, normal y tensión en vivo |
| Choques | 1D y 2D, restitución | Vectores de momento antes y después, centro de masa |
| Oscilaciones | Resortes, péndulos, sistemas acoplados | Espacio de fases, medidor de periodo |
| Estática | Cuerpos rígidos en equilibrio | Momentos de cada fuerza, prueba de factibilidad |
| Fluidos | Presión, Pascal, flotación | Manómetro, prensa hidráulica |

## 4. Objetos

### Cuerpos

| Objeto | Parámetros |
|---|---|
| Partícula | masa, posición, velocidad, carga (opcional), tamaño visual |
| Bloque | masa, ancho, alto, ángulo, velocidad, ω |
| Disco o esfera | masa, radio, momento de inercia (sólido, aro o valor), velocidad, ω |
| Barra uniforme | masa, longitud, ángulo |
| Polígono o placa | vértices, masa o densidad |
| Cuerpo con movimiento prescrito | x(t), v(t) o a(t) por tramos, o dibujando la gráfica v-t |

### Superficies (estáticas o móviles)

| Objeto | Parámetros |
|---|---|
| Suelo y pared | posición, μs, μk, e |
| Plano inclinado | ángulo, longitud, posición, μs, μk, e |
| Arco | centro, radio, ángulo inicial y final, cara interior o exterior (esfera, hemisferio, cuenco) |
| Curva y = f(x) | expresión y dominio (parábola, cicloide) |
| Trazo libre | curva suave editable por puntos de control |
| Pista | igual que las superficies, pero el cuerpo no puede despegarse (cuenta en un alambre, montaña rusa con rieles) |

### Conectores

| Objeto | Parámetros |
|---|---|
| Cuerda ideal | longitud (inextensible, sin masa, solo tensión) |
| Cuerda elástica | longitud natural, k (solo tensión) |
| Resorte | k, longitud natural (en serie o en paralelo) |
| Amortiguador | c |
| Varilla rígida | longitud |
| Polea | radio, fija o móvil, masa opcional |
| Clavo o tope | posición; la cuerda se engancha al pasar (péndulo con clavo) |
| Prensa hidráulica | áreas de los dos émbolos; liga sus desplazamientos |

### Articulaciones y actuadores

| Objeto | Parámetros |
|---|---|
| Pasador | punto de giro |
| Fijación | une dos cuerpos rígidamente |
| Riel o ranura | dirección o curva por la que se desliza un punto |
| Fuerza aplicada | magnitud, dirección, punto de aplicación, ley en el tiempo |
| Motor | velocidad angular o par |
| Impulso | J y el instante en que se aplica |
| Lanzador | v0, ángulo, altura de salida |

### Campos y regiones

| Objeto | Parámetros |
|---|---|
| Gravedad | g y dirección (global) |
| Región de fluido | densidad, viscosidad, nivel de superficie |
| Viento o corriente | velocidad del medio (arrastre y movimiento relativo) |
| Campo de fuerza propio | F(x, y, t) escrita como expresión |
| Sistema de referencia móvil | velocidad o cuerpo al que sigue; la vista y las trayectorias se dibujan desde ese sistema |

## 5. Instrumentos

- Fotopuerta: registra los instantes de paso.
- Dinamómetro en cuerdas y resortes.
- Velocímetro y acelerómetro pegados a un cuerpo.
- Medidor de normal y de fricción en cada contacto.
- Balanza.
- Medidor de periodo, que detecta oscilaciones automáticamente.
- Medidor de alcance y de altura máxima para proyectiles.

## 6. Visualizaciones

- Vectores de velocidad, aceleración, momento y de cada fuerza por separado.
- Diagrama de cuerpo libre automático en un panel lateral.
- Trazas, imágenes estroboscópicas y fantasmas.
- Barras de energía (cinética, potencial gravitatoria, potencial elástica,
  calor por fricción, trabajo externo).
- Centro de masa del sistema.
- Momentos de fuerza con su brazo dibujado (estática).
- Espacio de fases (x contra v).

## 7. Cantidades medibles

Por cuerpo: x, y, vx, vy, |v|, ax, ay, θ, ω, α, K, U, p, L. Por contacto: N,
fricción, estado (pegado o deslizando). Por conector: tensión, elongación,
energía almacenada. Del sistema: energía total, momento total, posición del
centro de masa, trabajo de cada fuerza, calor por fricción. De los eventos:
instante y estado en cada choque, despegue o cambio de régimen.

## 8. Escenarios incluidos

### Tutoriales
1. Caída libre: colocar una partícula y reproducir.
2. Tiro oblicuo con el lanzador y gráficas.
3. Bloque en un plano inclinado con fricción.
4. Máquina de Atwood (cuerda y polea).
5. Péndulo simple y medidor de periodo.
6. Resorte horizontal y espacio de fases.
7. Choque elástico e inelástico en 1D.
8. Pista con energía (montaña rusa).

### Ejemplos
Péndulo cónico; bloques apilados con fricción; resortes en serie y en
paralelo; péndulo doble; bola que rebota con e < 1; carrito en una pista
circular vertical; escalera apoyada en una pared; flotación de bloques de
distinta densidad; cruce de un río en un sistema de referencia móvil.

### MEXT
| Tema | Escenarios |
|---|---|
| Cinemática (M1) | 2027 1-(1); 2025 T1; 2023 1-(1); 2019 1-(1); 2017 1-(1); 2016 1-(1) |
| Proyectiles (M2) | 2025 T5; 2019 P3; 2018 1-(1); 2015 1-(1); 2010 1-C; 2008 1-(1) |
| Dinámica (M3) | 2020 1-(1); 2016 1-(4); 2016 P3; 2012 1-(1) |
| Energía y trayectorias (M4) | 2017 P3; 2014 P3; 2012 P3; 2010 1-E; 2009 P3; 2006 1-(1); 2006 P3 |
| Choques (M5) | 2027 P2; 2023 1-(2); 2020 1-(2); 2019 1-(2); 2014 1-(1); 2007 1-(1) |
| Circular (M6) | 2025 T2; 2018 1-(2); 2009 1-(1) |
| Oscilaciones (M7) | 2020 P3; 2017 1-(3); 2016 1-(5); 2015 P3; 2010 1-D; 2010 1-F; 2008 P3 |
| Estática (M9) | 2013 P3; 2010 1-B; 2007 P3 |
| Fluidos (M10) | 2010 1-A |
| Movimiento relativo (M11) | 2013 1-(1) |

## 9. Decisiones y límites

- El plano de trabajo es 2D. La rotación de cuerpos rígidos está incluida
  aunque el examen casi no la use, porque la estática y el rodamiento la
  necesitan.
- La rodadura sin deslizamiento y la fricción por rodadura entran como
  opción del contacto.
- No hay cuerpos deformables ni fluidos dinámicos (salpicaduras). El fluido
  es una región con empuje y arrastre.
- Pendiente de diseño detallado: cómo se ve y se edita el diagrama de cuerpo
  libre, y cómo se dibuja la gráfica v-t del movimiento prescrito.
