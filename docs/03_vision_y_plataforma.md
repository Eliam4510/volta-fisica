# Volta — Visión y plataforma común

## 1. Qué es Volta

Volta es un **simulador de física**. Sirve para ver cómo evoluciona un sistema
físico en el tiempo, construyendo uno mismo la situación con total libertad.

- No es una herramienta de examen ni un explicador de problemas: no muestra
  soluciones, pasos ni respuestas.
- Está **orientado** al temario de Física MEXT: los módulos y sus capacidades
  se eligieron para que cualquier situación del banco se pueda construir y
  simular. Pero cada módulo es un simulador general de su área.
- Cada módulo trae tres tipos de escenarios ya hechos:
  1. **Tutoriales:** escenas mínimas para aprender a usar el módulo.
  2. **Ejemplos:** situaciones clásicas de física.
  3. **MEXT:** las situaciones de los exámenes, reproducidas como escenas
     normales (mismos objetos, mismas medidas, mismo planteamiento). Se pueden
     modificar como cualquier otra escena.

## 2. Mapa de módulos

Cada módulo resuelve un tipo distinto de simulación con su propio motor. Dentro
de cada módulo hay **espacios de trabajo**: el mismo motor con la paleta de
objetos, las herramientas y las vistas pensadas para un tipo de situación.

| Módulo | Espacios de trabajo | Motor | Temas del banco |
|---|---|---|---|
| Mecánica | Cinemática y proyectiles · Dinámica y fuerzas · Energía y trayectorias · Choques · Oscilaciones · Estática · Fluidos | Cuerpos 2D con restricciones y eventos | M1–M7, M9–M11 |
| Gravitación | Órbitas · Sistema solar · Maniobras | N cuerpos con integradores de alta precisión | M8 |
| Termodinámica | Laboratorio de gases · Ciclos y máquinas · Gas molecular · Calor | Gas por volúmenes de control + dinámica molecular 3D | T1–T6 |
| Electrostática | Cargas y campos · Conductores y dieléctricos · Cargas en movimiento | Superposición + Poisson + cuerpos cargados | E1, E2, E3 (geometría) |
| Circuitos | Corriente continua · Transitorios | Análisis nodal modificado | E3 (redes), E4, E9 |
| Magnetismo e inducción | Campos magnéticos · Partículas en E y B · Inducción | Biot–Savart + Boris + acoplamiento electromecánico | E5–E8 |
| Ondas y sonido | Medio 1D · Cubeta de ondas 2D · Doppler y acústica | Diferencias finitas 1D/2D + modelo cinemático con audio | W1–W5 |
| Óptica | Óptica geométrica · Interferencia y difracción · Películas e interferómetros | Trazado de rayos 2D + óptica ondulatoria por fasores | O1–O5 |
| Física moderna | Efecto fotoeléctrico · Núcleo | Modelos específicos | Q1, Q2 |

Las especificaciones de cada módulo están en `docs/modulos/`.

## 3. Un solo motor de cuerpos, muchos campos

La física de varios módulos comparte la misma base: cuerpos con masa que se
mueven bajo fuerzas. Una carga en un resorte, un péndulo cargado dentro de un
capacitor o una barra conductora que cae por unos rieles en un campo magnético
mezclan dominios. Por eso el núcleo tiene **un único motor de cuerpos** y cada
módulo le aporta:

- **campos** (gravedad, eléctrico, magnético, flotación, arrastre);
- **propiedades** de los cuerpos (carga, conductividad, resistencia);
- **solucionadores propios** (Poisson, circuitos, ondas, rayos, gas);
- **instrumentos y vistas**.

Así, cualquier módulo puede activar fuerzas de otro cuando la escena lo pida,
sin duplicar física.

## 4. Mundo y escalas

- El mundo es un plano 2D en el que se calcula con física 3D cuando hace falta
  (las cargas puntuales siguen la ley 1/r², no la versión 2D). Las vistas 3D
  existen donde aportan: gas molecular, bobinas y solenoides, paisaje de
  potencial.
- Cada módulo tiene una escala de trabajo por defecto (cm, m, km, unidades
  astronómicas) y el lienzo muestra siempre una barra de escala.
- Todo se calcula en SI con doble precisión. Los campos numéricos aceptan
  unidades al escribir: `72 km/h`, `5 cm`, `2 µF`, `1 atm`.

## 5. Distribución de la pantalla

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Volta │ Mecánica ▾ │ Proyectiles ▾ │  ▶ ❚❚ ⏭ ⟲  0.25× 1× 4×  │ archivo ▾  │
├────────────┬──────────────────────────────────────────────┬───────────────┤
│ Paleta     │                                              │ Inspector     │
│ de objetos │                 Lienzo                       │ (objeto       │
│            │   (zoom, desplazamiento, cuadrícula, ejes,   │  seleccionado:│
│────────────│    barra de escala, herramientas de medida)  │  parámetros   │
│ Escena     │                                              │  con unidades)│
│ (árbol de  │                                              │───────────────│
│  objetos)  │                                              │ Variables     │
├────────────┴──────────────────────────────────────────────┴───────────────┤
│ Línea de tiempo (eventos marcados, arrastre para retroceder)              │
│ Gráficas · Tabla de datos · Registro de energía   (paneles acoplables)    │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Inicio:** tarjetas de módulos, archivos recientes y la biblioteca de
  escenarios con miniaturas y filtros (módulo, tipo, año MEXT).
- Los paneles se pueden mover, acoplar, separar y ocultar. La distribución se
  guarda por módulo.

## 6. Edición de escenas

| Función | Detalle |
|---|---|
| Colocar objetos | Arrastrar desde la paleta; ajuste a cuadrícula, a otros objetos y a ángulos notables |
| Editar | Mover, rotar, escalar, duplicar, agrupar, alinear, bloquear, ocultar, capas |
| Inspector | Todos los parámetros del objeto, con unidades, rango y control deslizante |
| Variables | Valores con nombre (`h`, `theta`, `q`) que se pueden usar en cualquier campo como expresión: `2*h`, `sqrt(2*g*h)` |
| Constantes | g, G, k, ε0, μ0, c, h, R, kB, con valor editable por escena |
| Restricciones geométricas | "este punto sobre esta curva", "a esta distancia de", para construir figuras exactas |
| Acciones programadas | "En t = 2 s, cerrar S2", "aplicar impulso", "abrir válvula" |
| Disparadores | "Cuando ocurra [evento], hacer [pausar, marcar, cambiar parámetro, iniciar acción]" |
| Anotaciones | Texto, flechas, cotas, etiquetas con fórmulas; no afectan la física |
| Deshacer y rehacer | Ilimitado, también para cambios hechos durante la simulación |

## 7. Tiempo y ejecución

- Reproducir, pausar, avanzar un paso, reiniciar.
- Velocidad de 0.01× a 100×, sin cambiar la precisión.
- **Línea de tiempo:** todo lo simulado queda guardado. Se puede retroceder y
  avanzar arrastrando, sin volver a calcular. Los eventos (choques, cambios de
  fase, interruptores) aparecen marcados y se puede saltar a ellos.
- **Ramas:** si se cambia algo a mitad de la simulación, la historia se
  ramifica desde ese instante y se puede comparar con la anterior.
- **Precisión:** modo normal y modo de alta precisión (tolerancias más
  estrictas), con indicador del error estimado.

## 8. Medición y visualización

Comunes a todos los módulos (cada módulo añade los suyos):

- Regla, transportador, cronómetro, coordenadas del cursor.
- Trazas de trayectoria, modo estroboscópico (imágenes cada Δt), fantasmas.
- Vectores con componentes y escala ajustable.
- Etiquetas de valor en vivo pegadas a los objetos.
- **Gráficas:** cualquier cantidad de cualquier objeto contra el tiempo o
  contra otra cantidad, varias series y ejes, cursores sincronizados con la
  línea de tiempo, ajuste de curvas (lineal, polinomial, exponencial,
  senoidal o una expresión propia).
- **Tabla de datos** con exportación a CSV.
- **Registro de energía:** a dónde va cada joule (cinética, potencial,
  almacenada en campos, calor disipado, trabajo de cada fuerza). Debe cuadrar
  siempre.

## 9. Barrido de parámetros

Correr la misma escena para muchos valores de una variable y graficar un
resultado: alcance contra ángulo, periodo contra longitud, voltaje de Hall
contra corriente. Se ejecuta en segundo plano, en paralelo y sin interfaz.

## 10. Escenarios y archivos

- Un escenario es un archivo `.volta` (JSON comprimido con una miniatura). Se
  puede guardar, abrir, duplicar y compartir.
- **Metadatos:** título, módulo, espacio de trabajo, tipo (tutorial, ejemplo,
  MEXT, propio), etiquetas. Los escenarios MEXT indican año y problema y
  pueden mostrar la figura original como referencia visual; no traen
  soluciones ni explicaciones.
- **Tutoriales:** incluyen una nota lateral con los pasos a seguir.
- **Plantillas:** cualquier escena se puede guardar como plantilla.

## 11. Exportación

- Imagen PNG o SVG del lienzo (las anotaciones permiten hacer figuras como
  las del examen).
- Video MP4 de la simulación.
- Datos en CSV.

## 12. Comodidades de aplicación profesional

- Paleta de comandos (Ctrl+K) y atajos de teclado configurables.
- Autoguardado y recuperación tras un cierre inesperado.
- Temas claro y oscuro, alta densidad de píxeles.
- Indicador de rendimiento opcional (cuadros por segundo, pasos por cuadro).
- Interfaz en español con el término en inglés en la ayuda emergente.
