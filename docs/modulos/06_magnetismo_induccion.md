# Módulo Magnetismo e inducción

## 1. Alcance

Campos magnéticos de corrientes e imanes; fuerza sobre corrientes y sobre
cargas en movimiento (Lorentz); dispositivos con campos E y B (selector de
velocidades, espectrómetro, ciclotrón, efecto Hall); inducción
electromagnética con acoplamiento mecánico (barras en rieles, espiras que
entran o caen en un campo, generadores).

Referencias revisadas: el simulador de magnetostática 3D y los de motor y
generador de Falstad; PhET Faraday's Law y Faraday's Electromagnetic Lab; y el
laboratorio EM web anterior, que ya integraba la fuerza de Lorentz.

## 2. Motores

1. **Magnetostática:**
   - Biot–Savart numérico para segmentos, espiras y bobinas;
   - fórmulas exactas para hilos infinitos y solenoides ideales;
   - imanes como dipolos o como bloques magnetizados.
2. **Regiones de campo ideal:** zonas con B (o E) uniforme y borde nítido,
   tal como las plantea el examen ("a la derecha de la línea XY hay un campo
   uniforme"). El campo puede variar con el tiempo, B(t).
3. **Cargas en E y B:**
   - integrador de **Boris**, que conserva la energía cinética en un campo
     magnético puro donde RK4 la pierde poco a poco;
   - fuentes de iones y pantallas detectoras.
4. **Inducción acoplada:**
   - el flujo por cada circuito cerrado se calcula como el área de la espira
     que queda dentro de la región de campo (intersección de polígonos), o
     integrando B sobre la superficie cuando el campo no es uniforme (espira
     junto a un hilo);
   - la fem es −dΦ/dt; con R (y L opcional) da la corriente;
   - la corriente produce la fuerza I L × B sobre cada tramo, que entra al
     motor de cuerpos común junto con la gravedad y las fuerzas aplicadas;
   - todo se integra como un único sistema de ecuaciones, así que la
     velocidad terminal y la disipación salen solas.

## 3. Espacios de trabajo

| Espacio | Enfoque |
|---|---|
| Campos magnéticos | Hilos, espiras, solenoides, imanes, brújulas; fuerza entre corrientes |
| Partículas en E y B | Órbitas circulares, selector, espectrómetro, ciclotrón, efecto Hall |
| Inducción | Barras en rieles, espiras móviles, campos variables, generador |

## 4. Objetos

| Objeto | Parámetros |
|---|---|
| Hilo infinito | I, sentido (entrante o saliente del plano, o contenido en él) |
| Segmento con corriente | extremos, I |
| Espira con corriente | forma (circular o rectangular), I, N vueltas |
| Solenoide | longitud, radio, vueltas por metro, I (vista 3D) |
| Imán de barra | momento magnético, tamaño |
| Región de campo B | forma libre, magnitud, sentido (entrante, saliente o en el plano), B(t) opcional |
| Región de campo E | forma libre, magnitud, dirección |
| Partícula cargada | q, m, posición, velocidad |
| Fuente de iones | q, m, rapidez o voltaje de aceleración, dirección, ritmo de emisión, mezcla de especies |
| Placas aceleradoras | ΔV, separación |
| Pantalla detectora | marca donde llegan las partículas (placa fotográfica) |
| Rieles conductores | separación, inclinación, resistencia entre ellos |
| Barra conductora | masa, longitud, resistencia, fricción |
| Espira rígida móvil | forma, N, R, L opcional, masa; movida por fuerzas o con velocidad impuesta |
| Bobina giratoria | área, N, ω impuesta o motor, carga conectada (generador) |
| Lámina Hall | dimensiones, I, densidad de portadores n, signo del portador |
| Brújula | se orienta con el campo local |

## 5. Instrumentos

- Sonda de B (vector y magnitud) y brújulas.
- Medidor de flujo sobre una espira o superficie.
- Voltímetro y amperímetro en circuitos inducidos.
- Fuerza magnética sobre cada tramo de corriente.
- Radio y periodo medidos de una órbita; posición de impacto en la pantalla.
- Voltaje de Hall.

## 6. Visualizaciones

- Campo perpendicular al plano con la cuadrícula de símbolos ⊙ y ⊗; campo en
  el plano con vectores y líneas.
- Vista 3D para espiras, solenoides, bobinas giratorias y la lámina Hall.
- Área de la espira dentro del campo sombreada, con el flujo en vivo.
- Flecha de la corriente inducida y su sentido según Lenz.
- Fuerzas magnéticas sobre los tramos.
- Trayectorias de partículas con la componente de la fuerza de Lorentz.
- Gráficas sincronizadas de Φ(t), fem(t), I(t) y v(t).
- Registro de energía: trabajo mecánico convertido en calor Joule.

## 7. Cantidades medibles

B en sondas; flujo; fem; corriente inducida; fuerza magnética; posición,
velocidad y energía de barras, espiras y partículas; radio y periodo de
órbitas; voltaje de Hall; potencia disipada.

## 8. Escenarios incluidos

### Tutoriales
1. Campo de un hilo y brújulas.
2. Partícula cargada en un campo uniforme: órbita circular.
3. Barra que se mueve sobre rieles en un campo.
4. Espira que entra en una región de campo.

### Ejemplos
Dos hilos paralelos que se atraen o repelen; campo de un solenoide; selector
de velocidades; espectrómetro de masas con dos especies; ciclotrón; deriva
E×B (cicloide); generador conectado a una bombilla; barra que cae por rieles
inclinados hasta su velocidad terminal; espira que se aleja de un hilo.

### MEXT
| Tema | Escenarios |
|---|---|
| Campo de corrientes (E5) | 2019 1-(3) |
| Partículas en B y E×B (E6) | 2025 T6; 2016 P2; 2010 4-D; 2009 P2 |
| Efecto Hall (E7) | 2014 P2 |
| Inducción (E8) | 2027 1-(4); 2025 T3; 2018 P2; 2015 P2; 2012 P2; 2010 4-E; 2010 4-F |

## 9. Decisiones y límites

- Régimen cuasiestático: sin ondas electromagnéticas ni radiación.
- La autoinducción de las espiras es opcional (apagada por defecto, como en
  el examen).
- El efecto Hall tiene dos vistas: microscópica (portadores que derivan y se
  acumulan en los bordes hasta el equilibrio) y macroscópica (fórmula).
