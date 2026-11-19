# Módulo Circuitos

## 1. Alcance

Circuitos de corriente continua y sus transitorios: resistencias, baterías,
bombillas, capacitores, inductores, interruptores e instrumentos de medida.
Incluye redistribución de carga entre capacitores, puentes, recta de carga
de elementos no lineales y oscilaciones LC y RLC. La corriente alterna queda
preparada para una fase posterior (está en la zona gris del temario).

Referencias revisadas: el simulador de circuitos analógicos de Falstad
(corriente animada, color por potencial, osciloscopios), PhET Circuit
Construction Kit y el motor de Hakaru CES, cuyo diseño y batería de pruebas se
reaprovechan.

## 2. Motor

- **Análisis nodal modificado (MNA)**, el método de SPICE.
- **Punto de operación** en estado estacionario y **análisis transitorio** con
  regla trapezoidal o BDF2, paso adaptativo y detección de eventos.
- **Newton–Raphson** para elementos no lineales (bombilla con curva I-V
  editable; diodo en una fase posterior).
- **Interruptores como eventos:** el instante de conmutación es exacto.
- **Conservación de la carga en islas:** cuando un grupo de capacitores queda
  aislado (sin camino resistivo a una fuente), la formulación por cargas
  impide que la carga se "fugue". Esto es esencial para los problemas de
  redes de capacitores con interruptores.
- **Dos modos de conexión ideal:**
  - *Ideal:* al cerrar un interruptor entre capacitores la carga se
    redistribuye al instante; el motor calcula la energía perdida y la
    registra.
  - *Realista:* los cables tienen una resistencia pequeña y se ve el
    transitorio.
- **Registro de energía:** trabajo de cada batería, energía en capacitores e
  inductores, calor en cada resistencia. Debe cuadrar en todo momento.

## 3. Espacios de trabajo

| Espacio | Enfoque |
|---|---|
| Corriente continua | Estado estacionario, mediciones, puentes |
| Transitorios | Carga y descarga, interruptores secuenciados, LC y RLC |

## 4. Objetos

| Componente | Parámetros |
|---|---|
| Batería | fem, resistencia interna |
| Fuente de corriente | I |
| Resistencia | R |
| Reóstato o potenciómetro | resistencia total, posición del cursor (animable) |
| Bombilla | curva I-V (tabla o expresión); brillo según la potencia |
| Capacitor | C, carga inicial |
| Capacitor geométrico | área, separación, εr; la separación o el dieléctrico pueden cambiar en el tiempo (enlace con Electrostática) |
| Inductor | L, corriente inicial |
| Interruptor | de una vía o de varias posiciones (a, b, c), acción manual o programada |
| Tierra | referencia de potencial |
| Voltímetro | ideal o con resistencia interna |
| Amperímetro | ideal o con resistencia interna |
| Galvanómetro | detecta corriente nula (puente equilibrado) |
| Calentador | resistencia que entrega calor a un gas (enlace con Termodinámica) |
| Fuente alterna, transformador, diodo | fase posterior |

## 5. Edición

- Esquema sobre cuadrícula con ajuste; los cables se dibujan de punto a punto
  y se doblan en ángulo recto.
- Rotar y reflejar componentes, etiquetas con nombre y valor.
- Símbolos en estilo IEC (rectángulo) o ANSI (zigzag), a elegir.
- Los interruptores se accionan con un clic durante la simulación o desde
  acciones programadas ("en t = 3 s, pasar S de a a c").
- Botón "llevar al estado estacionario".

## 6. Instrumentos y visualizaciones

- Voltímetro, amperímetro, osciloscopio de varios canales y medidor de
  carga en cada capacitor.
- **Corriente animada:** puntos que recorren los cables con velocidad
  proporcional a la corriente.
- **Color por potencial** en cables y nodos, y vista en 3D del potencial como
  "alturas" del circuito.
- Signos de carga en las placas de los capacitores, en número proporcional a
  la carga.
- Brillo de las bombillas y calor en las resistencias.
- Recta de carga sobre la curva I-V de un elemento no lineal.
- Tabla de nodos y ramas con V, I y P.

## 7. Cantidades medibles

V de cada nodo, ΔV e I de cada componente, carga en capacitores, corriente
en inductores, potencia, energía almacenada y disipada acumuladas, trabajo de
cada batería.

## 8. Escenarios incluidos

### Tutoriales
1. Ley de Ohm con voltímetro y amperímetro.
2. Resistencias en serie y en paralelo.
3. Carga y descarga de un capacitor.
4. Interruptor de tres posiciones.

### Ejemplos
Divisor de voltaje; puente de Wheatstone; resistencia interna de una batería;
dos capacitores que comparten carga (y la energía que se pierde); oscilador
LC; RLC amortiguado; bombilla no lineal con recta de carga; red de
capacitores con interruptores secuenciados.

### MEXT
| Tema | Escenarios |
|---|---|
| Redes de capacitores (E3) | 2023 P2; 2014 1-(4); 2013 P2; 2007 P2 (junto con Electrostática) |
| Corriente continua y RC (E4) | 2027 1-(3); 2012 1-(2); 2010 4-C; 2007 1-(2); 2006 P2 |
| LC (E9) | 2019 P2 |

## 9. Decisiones y límites

- Circuitos de parámetros concentrados: sin propagación en cables.
- La resistencia de los cables es cero en modo ideal; en modo realista, un
  valor configurable.
