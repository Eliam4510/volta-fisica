# Módulo Electrostática

## 1. Alcance

Campos y potenciales de cargas en reposo; conductores y dieléctricos;
capacitores vistos como geometría (placas, láminas insertadas, energía,
fuerzas entre placas); movimiento de cargas libres en esos campos.

Referencias revisadas: PhET Charges and Fields (cargas, campo, voltaje,
equipotenciales, sensores) y Capacitor Lab (tamaño de placas, dieléctrico,
voltímetro); los simuladores de electrostática 2D y 3D de Falstad, que
demuestran la ley de Gauss; y FEMM (solucionador por elementos finitos con
modos plano y axisimétrico, conductores con voltaje fijo cuya carga se
calcula sola). También el laboratorio EM web que ya hicimos antes, del que se
reaprovecha el marching squares corregido.

## 2. Geometría de la escena

Es una decisión que cambia la física, así que se elige por escena (igual que
en FEMM):

| Modo | Qué representa | Cuándo usarlo |
|---|---|---|
| **3D con vista plana** (por defecto) | Cargas puntuales, esferas, anillos y segmentos en el espacio, vistos en un plano. Ley de Coulomb 1/r² | Casi todo el banco: cargas puntuales, dipolos, trayectorias |
| **Sección 2D** | Todo es infinitamente largo perpendicular al plano: placas, cilindros, conductores y dieléctricos de cualquier forma | Capacitores, conductores de forma libre, hilos |
| **Axisimétrico** (fase posterior) | Cuerpos de revolución: esferas conductoras, discos, anillos | Conductores esféricos, capacitores de placas circulares |

## 3. Motores

1. **Superposición analítica** para fuentes conocidas (cargas puntuales,
   hilos, segmentos, anillos, láminas). Es exacta y se recalcula al arrastrar.
2. **Solucionador de Poisson** cuando hay conductores o dieléctricos:
   - resuelve ∇·(ε∇V) = −ρ en una malla con multimalla;
   - los conductores pueden estar a potencial fijo (unidos a una batería o a
     tierra) o aislados con carga total fija; el potencial de los aislados se
     calcula por superposición de soluciones unitarias (matriz de
     capacitancias);
   - la carga inducida en cada conductor se obtiene integrando el campo a su
     alrededor, como en FEMM;
   - las fronteras abiertas usan condiciones asintóticas para simular el
     espacio infinito.
3. **Imágenes** para conductores esféricos y planos, cuando dan una solución
   exacta.
4. **Cargas en movimiento:** usa el motor de cuerpos común (Dormand–Prince
   con eventos). Incluye la interacción entre cargas libres y, si la escena lo
   pide, gravedad, resortes y rieles.

## 4. Espacios de trabajo

| Espacio | Enfoque |
|---|---|
| Cargas y campos | Cargas puntuales y distribuciones; campo, potencial, líneas, Gauss |
| Conductores y dieléctricos | Capacitores, blindaje, carga inducida, energía y fuerzas |
| Cargas en movimiento | Trayectorias, energía potencial, escape, órbitas eléctricas |

## 5. Objetos

| Objeto | Parámetros |
|---|---|
| Carga puntual | q, fija o libre, masa, velocidad inicial |
| Esfera cargada | radio, carga total, aislante (carga uniforme) o conductora |
| Hilo infinito | λ (perpendicular al plano o contenido en él) |
| Segmento o anillo cargado | longitud o radio, carga total |
| Lámina o placa | σ o carga total, tamaño (finita o infinita) |
| Capacitor de placas paralelas | área, separación, V o Q, desplazamiento de una placa durante la simulación |
| Conductor de forma libre | rectángulo, círculo, polígono; a potencial V, a tierra o aislado con carga Q |
| Dieléctrico de forma libre | εr; se puede insertar y retirar durante la simulación |
| Batería entre conductores | ΔV |
| Campo externo uniforme | E0 y dirección |
| Resorte, riel, gravedad | del motor común, para cargas sujetas |

## 6. Instrumentos

- Sonda de campo: vector E y su magnitud.
- Sonda de potencial y voltímetro de dos puntas.
- **Superficie gaussiana:** curva cerrada dibujable que muestra el flujo y la
  carga encerrada.
- Medidor de fuerza sobre una carga.
- Carga inducida en cada conductor.
- Capacitancia entre dos conductores.
- Energía almacenada en el campo (½∫εE² dV).
- **Trabajo por un camino:** arrastrar una carga de prueba por un camino
  dibujado; muestra el trabajo acumulado y que no depende del camino.
- Perfil de una cantidad a lo largo de una recta: V(s), |E|(s) y la energía
  potencial U(s) de una carga de prueba.

## 7. Visualizaciones

- Malla de vectores de campo, con escala lineal o logarítmica.
- Líneas de campo, con densidad proporcional a la carga de origen.
- Equipotenciales con niveles configurables.
- Mapa de calor de V o de |E|.
- **Paisaje de potencial en 3D:** V(x, y) como una superficie con relieve;
  las cargas libres se ven rodar por él.
- Carga superficial inducida coloreada en los conductores; cargas de
  polarización en los dieléctricos; campo D y campo E por separado.
- Trayectorias de las cargas libres.

## 8. Cantidades medibles

E y V en sondas; ΔV; flujo; carga de cada conductor; capacitancia; energía del
campo; fuerza sobre cada carga y sobre cada placa; posición, velocidad y
energía de las cargas libres; trabajo hecho por fuerzas externas.

## 9. Escenarios incluidos

### Tutoriales
1. Una carga: campo, potencial y sondas.
2. Dipolo con líneas de campo y equipotenciales.
3. Superficie gaussiana alrededor de varias cargas.
4. Capacitor de placas paralelas con voltímetro.
5. Carga lanzada entre dos placas (tiro "eléctrico").

### Ejemplos
Dos cargas iguales y su punto neutro; cuadrupolo; conductor en un campo
uniforme (blindaje); dieléctrico que se introduce en un capacitor; carga que
oscila a través de un anillo; hilo infinito y la ley de Gauss; separación de
las placas con la batería conectada y desconectada.

### MEXT
| Tema | Escenarios |
|---|---|
| Electrostática (E1) | 2027 P3; 2023 1-(3); 2020 P2; 2018 1-(3); 2017 1-(4); 2015 1-(4); 2013 1-(3); 2010 4-A; 2008 P2; 2006 1-(2) |
| Conductores y Gauss (E2) | 2025 T4; 2009 1-(3) |
| Capacitores como geometría (E3) | 2020 1-(3); 2017 P2; 2016 1-(3); 2010 4-B; 2008 1-(2); 2007 P2 |

## 10. Decisiones y límites

- Solo electrostática: no hay corrientes ni campos variables (eso es de
  Circuitos y Magnetismo).
- Conexión con Circuitos: la capacitancia que calcula este módulo para una
  geometría puede usarse como componente en un circuito. El caso del conductor
  que se inserta con la batería conectada (2007 P2) necesita ambos.
