# Módulo Ondas y sonido

## 1. Alcance

Ondas mecánicas en cuerdas, columnas de aire y superficies de agua: ondas
viajeras transversales y longitudinales, reflexión y transmisión,
superposición, ondas estacionarias y resonancia, interferencia, difracción,
refracción, efecto Doppler y pulsaciones. Con audio: lo que se simula también
se puede escuchar.

Referencias revisadas: la cubeta de ondas de Falstad (interferencia,
difracción, refracción, resonancia, fuentes en fase y Doppler, con excitación
manual), sus simuladores de interferencia acústica y de osciladores
acoplados, y PhET Wave Interference (detectores, pantalla de intensidad
promediada en el tiempo, rendijas) y Waves on a String (pulsos, extremo fijo
y libre).

## 2. Motores

1. **Medio 1D:**
   - ecuación de onda por diferencias finitas (leapfrog con condición CFL);
   - la tensión, la densidad o la velocidad pueden variar a lo largo del
     medio, así que una cuerda unida a otra más gruesa refleja y transmite;
   - bordes fijo, libre, abierto, cerrado o absorbente;
   - amortiguamiento ajustable;
   - longitud variable durante la simulación (pistón que se mueve en un tubo).
2. **Superposición analítica:** ondas senoidales exactas y(x, t) con
   reflexión por el método de la imagen. Sirve para instantáneas exactas y
   para comparar con el medio discretizado.
3. **Cubeta de ondas 2D:**
   - diferencias finitas en la GPU (sombreadores WebGL2 con texturas que se
     alternan);
   - velocidad variable por zona: aguas someras, lentes, gradiente de
     temperatura del aire;
   - paredes reflectantes o absorbentes, rendijas, bordes absorbentes;
   - fuentes móviles.
4. **Doppler y acústica:**
   - modelo cinemático exacto: cada frente nace en la posición de la fuente
     y viaja con el aire, que se mueve con el viento;
   - la frecuencia recibida se obtiene resolviendo el tiempo de emisión; la
     reflexión en una pared móvil usa una fuente imagen;
   - funciona con cualquier geometría 2D, por ejemplo una ambulancia que pasa
     a cierta distancia del observador;
   - **síntesis de audio** de lo que oye cada observador (retraso y amplitud
     correctos), así que las pulsaciones se escuchan.

## 3. Espacios de trabajo

| Espacio | Motor | Enfoque |
|---|---|---|
| Medio 1D | Medio 1D y analítico | Cuerdas, resortes largos, tubos; ondas viajeras y estacionarias |
| Cubeta de ondas | Cubeta 2D | Interferencia, difracción, refracción, ondas de agua |
| Doppler y acústica | Cinemático con audio | Fuentes y observadores móviles, viento, paredes, pulsaciones |

## 4. Objetos

### Medio 1D

| Objeto | Parámetros |
|---|---|
| Cuerda | longitud, tensión, densidad lineal (por tramos), amortiguamiento |
| Columna de aire (tubo) | longitud, extremos abierto o cerrado, gas y temperatura (velocidad del sonido) |
| Pistón móvil | posición, velocidad (para buscar resonancias) |
| Oscilador | frecuencia, amplitud, fase, punto de aplicación |
| Generador de pulsos | forma, ancho, amplitud |
| Unión entre medios | cambio de densidad o de velocidad |
| Onda analítica | amplitud, longitud de onda, frecuencia, sentido |

### Cubeta 2D

| Objeto | Parámetros |
|---|---|
| Fuente puntual | frecuencia, amplitud, fase, velocidad (fuente móvil) |
| Fuente lineal | onda plana, dirección |
| Arreglo de fuentes | número, separación, desfase |
| Pared o barrera | forma, reflectante o absorbente |
| Rendija o rendijas | ancho, separación, número |
| Zona de distinta velocidad | forma, velocidad relativa (profundidad del agua o temperatura) |
| Detector | punto o línea; registra amplitud e intensidad promediada |

### Doppler y acústica

| Objeto | Parámetros |
|---|---|
| Fuente sonora | frecuencia, potencia, posición, velocidad o trayectoria |
| Observador | posición, velocidad o trayectoria |
| Pared reflectante | posición, velocidad |
| Viento | velocidad y dirección del aire |
| Medio | gas y temperatura; la velocidad del sonido sale de √(γRT/M) (enlace con Termodinámica) |

## 5. Instrumentos

- Regla y cronómetro.
- Frecuencímetro en cada observador o punto.
- Micrófono: señal en el tiempo en un punto, con osciloscopio.
- Analizador de espectro (transformada de Fourier) de la señal.
- Medidor de intensidad y detector de línea con el patrón promediado.
- Marcadores automáticos de nodos y vientres.
- Barrido de frecuencia con curva de respuesta para encontrar resonancias.

## 6. Visualizaciones

- Medio 1D: desplazamiento transversal; vista longitudinal con partículas
  que se desplazan a lo largo del medio, y debajo la densidad o la presión.
  Los nodos de desplazamiento y de presión se ven intercambiados.
- Instantánea y(x) y registro y(t) en un punto, juntos y sincronizados.
- Componentes incidente y reflejada por separado y su suma.
- Cubeta: altura instantánea, intensidad promediada, superficie en 3D,
  frentes de onda resaltados.
- Doppler: frentes de onda como circunferencias arrastradas por el viento,
  líneas de la fuente al observador en el instante de emisión, gráfica de la
  frecuencia recibida.

## 7. Cantidades medibles

Desplazamiento, velocidad y aceleración del medio en un punto; presión y
densidad; longitud de onda, frecuencia, periodo y velocidad medidos;
posición de nodos y vientres; intensidad; frecuencia recibida; frecuencia de
pulsación.

## 8. Escenarios incluidos

### Tutoriales
1. Un pulso en una cuerda y su reflexión en extremo fijo y libre.
2. Onda senoidal: instantánea y registro en un punto.
3. Onda estacionaria en una cuerda.
4. Dos fuentes en la cubeta.
5. Fuente que se mueve: Doppler visto y escuchado.

### Ejemplos
Cuerda unida a otra más densa; tubo abierto y tubo cerrado; resonancia con
pistón móvil; difracción en una rendija; refracción en aguas someras; onda
plana en un arreglo de fuentes; pulsaciones entre dos diapasones; observador
que se mueve; reflexión en una pared que se acerca; sonido en una inversión
térmica.

### MEXT
| Tema | Escenarios |
|---|---|
| Ondas viajeras (W1) | 2020 1-(4); 2019 1-(4); 2018 P5; 2006 1-(3) |
| Ondas estacionarias (W2) | 2027 1-(5); 2019 1-(5); 2015 P5; 2008 P5 |
| Doppler (W3) | 2020 P5; 2018 1-(5); 2014 P5; 2013 P5; 2012 P5; 2009 P5; 2008 1-(4); 2007 P5; 2006 P5 |
| Interferencia (W4) | 2017 P5; 2007 1-(4) |
| Refracción de ondas (W5) | 2010 3-A; 2010 3-B |

## 9. Decisiones y límites

- Ondas lineales (amplitud pequeña); sin choques sónicos ni ondas no
  lineales.
- La fuente se mueve por debajo de la velocidad del sonido; por encima, el
  modelo cinemático dibuja el cono, pero no se sintetiza el estampido.
- La luz como onda se trata en Óptica; la cubeta puede mostrarla como ayuda
  visual.
