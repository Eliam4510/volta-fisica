# Volta — Lenguaje de diseño

Contrato visual único para toda la aplicación. Todos los módulos se diseñan y
se programan con estas reglas. Si un módulo necesita algo que aquí no existe,
se añade aquí primero y después se usa.

Implementación: `sistema/` (tokens, componentes, iconos, gramática del
lienzo y prototipos).

---

## 1. Principios

1. **El color significa física.** La interfaz es tinta sobre papel, en
   escala de grises. El color aparece solo para codificar magnitudes físicas
   (velocidad, fuerza, campo…) y siempre con el mismo significado en todos los
   módulos. Un botón nunca es azul; una velocidad siempre lo es.
2. **Dibujo técnico, no ilustración.** Lo físico se dibuja con las
   convenciones del dibujo técnico y de los libros de física: rayado en los
   apoyos, trazo continuo para lo real, discontinuo para lo previsto,
   punteado para lo auxiliar. Sin sombras, degradados ni texturas decorativas.
3. **Los números son instrumentos.** Toda cantidad se escribe según ISO
   80000: símbolo en cursiva, unidad en redonda, cifras tabulares, nunca un
   número sin su unidad.
4. **El lienzo manda.** Los paneles son silenciosos, de bajo contraste y sin
   adornos; el mayor contraste de la pantalla está en el lienzo.
5. **Una sola gramática.** Mismos gestos, mismos componentes y mismas reglas
   de dibujo en todos los módulos. Cada módulo solo añade símbolos a la
   gramática común.

---

## 2. Marca

- **Nombre:** Volta.
- **Símbolo: el rebote.** Una línea de suelo con su rayado y una trayectoria
  en V que toca el suelo en el vértice, con una partícula en el extremo
  derecho. La V de Volta es un choque elástico: física dibujada con el
  lenguaje del propio producto.
- **Logotipo:** "Volta" en IBM Plex Sans semibold, con espaciado de −1 %.
- **Uso:** el símbolo va en tinta sobre papel o en papel sobre tinta; nunca
  en color, nunca con efectos. Tamaño mínimo 16 px; área de respeto igual a
  la altura de la partícula alrededor del símbolo. El rayado del suelo va a
  45°, como todo rayado de Volta.
- Archivos: `sistema/marca/`.

---

## 3. Color

### 3.1 Neutros: papel y tinta

Neutros casi puros, con un leve sesgo cálido de papel para que el blanco no
sea clínico.

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--lienzo` | Fondo del lienzo de simulación | `#FFFFFF` | `#0D0D0E` |
| `--fondo` | Fondo de la aplicación | `#F6F6F4` | `#09090A` |
| `--panel` | Paneles | `#FAFAF8` | `#121213` |
| `--campo` | Campos, botones secundarios | `#F0F0ED` | `#1A1A1C` |
| `--campo-hover` | Hover | `#E8E8E4` | `#212124` |
| `--campo-activo` | Presionado, riel de deslizador | `#DEDEDA` | `#2A2A2E` |
| `--linea-suave` | Divisores | `#E6E6E2` | `#1F1F22` |
| `--linea` | Bordes de controles | `#D3D3CE` | `#303034` |
| `--linea-fuerte` | Bordes enfatizados | `#ABABA5` | `#4A4A50` |
| `--texto-4` | Deshabilitado | `#A8A8A2` | `#55555B` |
| `--texto-3` | Terciario, ejes | `#6E6E68` | `#85858C` |
| `--texto-2` | Secundario | `#4B4B47` | `#B5B5BB` |
| `--texto` | Principal | `#171716` | `#EDEDEF` |
| `--tinta` | Sólidos (botón primario, materia) | `#0C0C0B` | `#FAFAFA` |
| `--sobre-tinta` | Texto sobre `--tinta` | `#FFFFFF` | `#0C0C0B` |
| `--cuadricula-menor` | Cuadrícula fina del lienzo | `#F1F1EE` | `#151517` |
| `--cuadricula-mayor` | Cuadrícula mayor del lienzo | `#E2E2DE` | `#202023` |
| `--eje` | Ejes del lienzo y de las gráficas | `#9C9C96` | `#55555B` |
| `--velo` | Fondo detrás de diálogos | tinta al 32 % | negro al 55 % |
| `--sombra-menu`, `--sombra-dialogo`, `--sombra-perilla` | Elevación (sección 5) | — | — |

- **Selección y foco:** contorno de `--tinta`. El foco del teclado es un
  anillo de 2 px de `--tinta` separado 2 px del control.
- **Estados de interfaz** (únicos colores fuera de la física, solo en texto
  e icono): error `--error` (`#C2261C` / `#FF6B60`), aviso `--aviso`
  (`#9A6200` / `#F2B33D`). Un campo con una expresión inválida muestra su
  texto y su borde en `--error`.

### 3.2 Paleta física

Nueve familias. Cada una tiene un tono de **trazo** (vectores, líneas), un
**tinte** (rellenos suaves, 14 %) y funciona en los dos temas con contraste
de al menos 3:1 sobre el lienzo.

| Familia | Token | Significa | Claro | Oscuro |
|---|---|---|---|---|
| Movimiento | `--f-movimiento` | velocidad, energía cinética, rapidez de ondas | `#1D5FD6` | `#6EA1FF` |
| Cambio | `--f-cambio` | aceleración, gravedad g, energía potencial gravitatoria | `#1C8546` | `#4CCB83` |
| Interacción | `--f-interaccion` | toda fuerza: peso, normal, tensión, fricción, eléctrica, magnética | `#D2382B` | `#FF6B5E` |
| Inercia | `--f-inercia` | momento lineal, impulso, momento angular | `#7B3FD4` | `#B08BFF` |
| Eléctrico | `--f-electrico` | campo E, potencial V, equipotenciales, energía elástica y eléctrica almacenada | `#A86400` | `#F2B33D` |
| Magnético | `--f-magnetico` | campo B, flujo, energía magnética | `#0B8592` | `#3FD0DC` |
| Corriente | `--f-corriente` | corriente eléctrica, flujo de carga, fem | `#C21E78` | `#FF6EBE` |
| Térmico | `--f-termico` | calor, flujo de calor, temperatura, energía disipada (fricción, Joule) | `#C65A0E` | `#FF9A4D` |
| Luz | — | la luz se dibuja con el color de su longitud de onda; la luz blanca y la luz sin λ definida, en tinta | espectral | espectral; por debajo de 430 nm se aclara hasta 3:1 de contraste |

Reglas:

- **El color nunca va solo.** Todo vector lleva su símbolo (`v`, `F`, `E`);
  toda serie lleva su etiqueta. Quien no distingue colores debe poder leer
  todo.
- **La materia no tiene color.** Partículas, cuerpos, cargas, conductores,
  cables y espejos se dibujan en tinta. El signo de una carga es un glifo
  (+ o −), no un color.
- **Varias series de la misma magnitud** (la velocidad de A y la de B) se
  distinguen por el tipo de trazo y por la etiqueta, no por otro color.
- **La energía toma el color de quien la guarda:** cinética = movimiento,
  potencial gravitatoria = cambio, elástica y eléctrica = eléctrico,
  magnética = magnético, calor = térmico, total = tinta. La energía interna
  de un gas (U) también va en tinta, porque es la energía total del gas. El
  trabajo (W) es energía en tránsito, sin quien la guarde: tinta
  discontinua.

### 3.3 Mapas de color para campos

| Mapa | Uso | Construcción |
|---|---|---|
| Grises | Magnitudes positivas por defecto (\|E\|, intensidad, densidad) | de `--lienzo` a `--tinta`, perceptualmente uniforme |
| Divergente | Cantidades con signo (potencial V, desplazamiento de onda) | azul `#2B59C3` ← lienzo → bermellón `#C8401E`, interpolado en OKLab |
| Familia | Magnitud de una familia (\|B\| en magnético) | de `--lienzo` al trazo de la familia |

Los vectores y textos que se dibujan sobre un mapa llevan halo del color del
lienzo.

---

## 4. Tipografía

### 4.1 Familias

| Rol | Familia | Por qué |
|---|---|---|
| Interfaz | IBM Plex Sans 400, 500, 600 | Técnica y legible a 12–13 px; tiene versión japonesa (Plex Sans JP) para el futuro |
| Números y código | IBM Plex Mono 400, 500 | Misma familia; cifras de ancho fijo para lecturas que cambian en vivo |
| Símbolos de magnitudes | STIX Two Text, cursiva | Diseñada para publicación científica |
| Fórmulas | STIX Two Math vía MathML | El motor de WebView2 dibuja MathML de forma nativa |

En los prototipos las fuentes se cargan de Google Fonts; en la aplicación van
incluidas (licencia OFL) para funcionar sin internet.

### 4.2 Escala

| Token | Tamaño / interlineado | Uso |
|---|---|---|
| `--t-micro` | 11 / 14 | Números de ejes, marcas de cuadrícula, atajos |
| `--t-pequeno` | 12 / 16 | Etiquetas de campos, ayudas, pestañas |
| `--t-base` | 13 / 18 | Texto general de la interfaz |
| `--t-enfasis` | 14 / 20 | Nombre del objeto en el inspector, títulos de panel |
| `--t-subtitulo` | 16 / 22 | Encabezados de diálogo |
| `--t-titulo` | 20 / 26 | Títulos de sección en Inicio |
| `--t-pantalla` | 28 / 34 | Título de pantalla |
| `--t-display` | 44 / 48 | Solo en Inicio y en la marca |

Pesos: 400 normal, 500 controles y énfasis, 600 títulos. Nunca 700.
Mayúsculas sostenidas: nunca. Todo en tipo oración ("Condiciones
iniciales", no "CONDICIONES INICIALES").

### 4.3 Escritura de cantidades (ISO 80000)

- Símbolos de magnitudes en **cursiva serif**: *m*, *v*, *t*, *θ*, *E*, *F*.
- Unidades en **redonda**: m, s, kg, N, J, V, Ω, °, m/s².
- Subíndices: cursiva si son variables o índices (*v*<sub>*x*</sub>), redonda
  si son descriptivos o números (*E*<sub>k</sub>, *v*<sub>0</sub>).
- Entre número y unidad, espacio fino que no se corta (U+202F): `4.00 m/s`.
- Punto decimal. Signo menos verdadero (−, U+2212), no guion.
- Notación científica con potencia volada: `6.67 × 10⁻¹¹ N·m²/kg²`, nunca `6.67e-11`.
- Lecturas en vivo: 4 cifras significativas por defecto (configurable), con
  prefijo SI cuando el valor lo pide: 12.71 kV, 6.355 mN, 2.0 µC.
- Presión: *P* (la convención del examen y de los libros japoneses); ISO
  admite también *p*. Flujo de calor: *Φ*, para no confundirlo con *P*.
- Marcas de ejes y de la línea de tiempo: los decimales que pide el paso,
  sin ceros finales (0, 0.5, 1, 1.5).
- Valores de variables: los decimales de su paso de ajuste (35 °, 3.00 m,
  0.50). Una constante no tiene deslizador: muestra "Constante" y su valor.
- En inspectores y tablas, los números se alinean a la derecha y la unidad
  ocupa su propia columna en `--texto-3`.

### 4.4 Voz

- Español, tipo oración, verbos para acciones: "Reproducir", "Añadir
  variable", "Exportar datos".
- Se nombra lo que el usuario reconoce, no cómo está hecho: "Trayectoria
  prevista", no "salida densa".
- Errores que dicen qué pasó y cómo arreglarlo: "La expresión da una
  velocidad y este campo espera una longitud."
- El término en inglés aparece en la ayuda emergente: "Velocidad
  (velocity)".

---

## 5. Geometría

| Elemento | Valor |
|---|---|
| Rejilla base | 4 px |
| Espaciado | 2, 4, 6, 8, 12, 16, 20, 24, 32, 48 |
| Radios | 3 (casillas), 5 (controles), 8 (tarjetas, menús, paneles flotantes), 12 (diálogos); píldora solo en chips de estado |
| Alturas de control | 24 compacto · 28 normal · 32 grande |
| Bordes | 1 px; divisores de 1 px con `--linea-suave` |
| Barra superior | 44 px |
| Paneles | izquierdo 264 px, derecho 304 px, inferior 248 px (redimensionables) |
| Elevación | Paneles planos. Menús y ventanas emergentes: borde `--linea` más sombra `0 6px 24px rgb(0 0 0 / .08)`; en oscuro, sombra `0 8px 28px rgb(0 0 0 / .5)` |
| Movimiento | 90 ms (hover), 160 ms (menús, paneles), 240 ms (diálogos); curva `cubic-bezier(.2, 0, 0, 1)`; sin rebotes; se respeta "reducir movimiento". El tiempo de la simulación nunca se suaviza. |

---

## 6. Iconografía

### 6.1 Reglas

- **Rejilla de 20 × 20** con 2 px de margen (zona viva de 16 × 16). Se dibuja
  a 20 px y se usa a 16 o 20 px.
- **Trazo de 1.5 px**, extremos y uniones redondeados, sin relleno salvo en
  puntos (partículas, nodos), que son círculos llenos de radio 2.
- `stroke="currentColor"`: el icono toma el color del texto.
- Geometría ortogonal y a 45°; las curvas, arcos de circunferencia.
- **Los iconos de objetos son dibujos técnicos en miniatura** de cómo se ve
  el objeto en el lienzo: el resorte es el mismo zigzag, el apoyo lleva el
  mismo rayado (tres rayas a 45°).
- **Emblemas de módulo:** rejilla de 40 × 40, trazo de 1.75 px, mismas reglas.
- Sin texto dentro de los iconos, salvo signos físicos (+, −, N, S, V, A).
- **Puntas:** las magnitudes físicas (fuerza, campos, rayos, corriente) llevan
  punta llena, como en el lienzo; las flechas de interfaz y las cotas, punta
  abierta.
- **Simplificación a 20 px:** el resorte conserva el ángulo del zigzag pero
  con 2 dientes; el discontinuo se dibuja 3.75 · 2 (la proporción del 6 · 4
  del lienzo); el rayado son siempre tres rayas a 45° del lado sólido.
- **Partícula:** el punto se dibuja en el vértice de su trayectoria, con lo
  recorrido continuo y lo previsto discontinuo; un punto solo no se lee.
- Fuente única: `sistema/iconos/fuente/iconos.mjs`. El script de
  construcción falla si sobra o falta un nombre del inventario.

### 6.2 Inventario

Nombres en español, en minúsculas y con guiones. Prefijos: `i-` interfaz,
`o-` objetos, `n-` instrumentos, `m-` módulos.

**Interfaz (`i-`):** reproducir, pausar, paso-adelante, paso-atras,
reiniciar, inicio, deshacer, rehacer, buscar, mas, menos, cerrar, menu,
ajustes, capas, ojo, ojo-tachado, candado, candado-abierto, duplicar, borrar,
mover, rotar, zoom-mas, zoom-menos, encuadrar, cuadricula, ajuste-iman,
grafica, tabla, energia, evento, archivo, carpeta, guardar, exportar,
imagen, video, variable, enlazar, expresion, info, aviso, error, ayuda,
check, chevron-abajo, chevron-arriba, chevron-izquierda, chevron-derecha,
flecha-derecha, asa, tema-claro, tema-oscuro, pantalla-completa,
panel-izquierdo, panel-derecho, panel-inferior, filtro, estrella, historial,
rama, precision, velocidad-sim, copiar, nota, etiqueta, tutorial, ejemplo,
mext, escena.

**Objetos (`o-`):**
- Mecánica: particula, bloque, disco, barra, poligono, movimiento-prescrito,
  suelo, pared, plano-inclinado, arco, curva, trazo-libre, pista, cuerda,
  cuerda-elastica, resorte, amortiguador, varilla, polea, clavo,
  prensa-hidraulica, pasador, fijacion, riel, fuerza, motor, impulso,
  lanzador, gravedad, fluido, viento, campo-propio, marco-movil.
- Gravitación: planeta, satelite, cuerpo-masivo, nave, atmosfera.
- Termodinámica: cilindro, recipiente, embolo, tabique, valvula, pesa,
  calentador, bano-termico, gas, columna-liquido, globo, caja-molecular,
  bomba, orificio, cuerpo-termico, calorimetro.
- Electrostática: carga-positiva, carga-negativa, esfera-cargada,
  hilo-infinito, segmento-cargado, anillo, lamina, capacitor-placas,
  conductor, dielectrico, campo-uniforme, tierra.
- Circuitos: bateria, fuente-ca, fuente-corriente, resistencia, reostato, bombilla,
  capacitor, inductor, interruptor, interruptor-3, cable, nodo.
- Magnetismo: hilo-corriente, segmento-corriente, espira, solenoide, iman,
  region-b, region-e, particula-cargada, fuente-iones, placas-aceleradoras,
  pantalla, rieles, barra-conductora, espira-movil, bobina-giratoria,
  lamina-hall.
- Ondas: cuerda-vibrante, tubo, piston, oscilador, pulso, union-medios,
  onda-analitica, fuente-puntual, fuente-lineal, arreglo-fuentes, barrera,
  rendija, zona-velocidad, fuente-sonora, observador, pared-reflectante.
- Óptica: rayo, haz, fuente-luz, objeto-luminoso, medio, capas,
  recipiente-liquido, espejo-plano, espejo-curvo, lente-ideal, lente-gruesa,
  divisor-haz, bloqueador, pantalla-optica, ojo, rendija-doble,
  red-difraccion, pelicula, anillos-newton, michelson.
- Física moderna: lampara, placa-metal, colector, nucleo, muestra, foton.

**Instrumentos (`n-`):** regla, transportador, cronometro, fotopuerta,
dinamometro, velocimetro, acelerometro, balanza, periodo, sonda-campo,
sonda-potencial, voltimetro, amperimetro, osciloscopio, superficie-gauss,
termometro, manometro, histograma, frecuencimetro, microfono, espectro,
detector, intensidad, contador-franjas, sonda-b, brujula, flujo.

**Módulos (`m-`):** mecanica, gravitacion, termodinamica, electrostatica,
circuitos, magnetismo, ondas, optica, moderna.

---

## 7. Gramática del lienzo

La parte más importante del lenguaje: cómo se dibuja la física. Implementada
en `sistema/lienzo/trazo.js`; ningún módulo dibuja por su cuenta lo que esta
gramática ya resuelve.

### 7.1 Capas (de abajo arriba)

1. Fondo: `--lienzo` y cuadrícula.
2. Mapas de campo (calor, intensidad, onda).
3. Geometría fija: superficies, apoyos, paredes.
4. Medios y regiones: fluidos, vidrio, dieléctricos, regiones de campo, gas.
5. Construcción: ejes, cotas, ángulos, trayectoria prevista, trazas,
   estroboscopio.
6. Materia: partículas, cuerpos, cargas, cables, conectores.
7. Magnitudes: vectores, líneas de campo, rayos.
8. Instrumentos y sus lecturas.
9. Anotaciones.
10. Edición: selección, asas, guías de ajuste.

### 7.2 Trazos

| Tipo | Grosor | Patrón | Uso |
|---|---|---|---|
| Materia | 2 px | continuo | contornos de cuerpos, superficies, cables |
| Real secundario | 1.5 px | continuo | cuerdas, trazas recorridas |
| Previsto | 1.5 px | discontinuo 6 · 4 | trayectoria prevista, estado futuro |
| Auxiliar | 1 px | punteado 1.5 · 3 | componentes, proyecciones, construcciones |
| Cota | 1 px | continuo, flechas abiertas | medidas en el dibujo |
| Eje de simetría | 1 px | raya y punto 10 · 3 · 2 · 3 | ejes, normales |
| Vector | 2.25 px | continuo, punta llena | magnitudes |
| Componente | 1.25 px | discontinuo 4 · 3, punta llena pequeña | componentes de un vector |

Puntas de vector: triángulo lleno de largo 4.5× el grosor y ancho 3.5×
(mínimo 9 × 7 px). Cotas y ejes: punta abierta de dos trazos.

**Un vector aplicado a un cuerpo nace en su borde, no en su centro**, para
no tapar la materia ni sus signos (una flecha sobre el "−" de una carga la
hace parecer positiva). Si dos vectores del mismo punto son casi paralelos,
se dibujan lado a lado, separados 3.5 px.

### 7.3 Convenciones de dibujo

| Elemento | Cómo se dibuja |
|---|---|
| Superficie fija | Línea de materia más rayado a 45° del lado sólido (rayas de 1 px cada 6 px, 10 px de profundidad) |
| Apoyo, pivote | Triángulo con base rayada; el pivote es un círculo de 4 px de radio con centro |
| Partícula | Disco lleno de `--tinta`, radio 6 px en pantalla (no escala con el zoom) |
| Cuerpo rígido | Relleno `--campo`, contorno de materia; centro de masa con el símbolo de cuadrantes alternos (círculo con dos cuartos llenos) |
| Carga | Disco de radio 9 px: positiva, lleno de tinta con "+" en `--sobre-tinta`; negativa, lleno de lienzo con contorno de tinta y "−" en tinta |
| Resorte | Zigzag de 8 dientes con amplitud de 7 px, con tramos rectos de 6 px en los extremos |
| Cuerda | 1.5 px `--texto-2`; floja: curva catenaria |
| Polea | Círculo con eje y soporte |
| Fluido | Tinte del 6 % de tinta con líneas horizontales cortas cerca de la superficie |
| Gas | Moléculas como discos de 2 a 4 px en `--texto-2` |
| Vidrio y medios | Tinte del 5 % de tinta; contorno de 1 px; tres trazos diagonales cortos en una esquina como marca de material |
| Conductor | Relleno `--campo-activo` con rayado cruzado fino |
| Dieléctrico | Relleno de puntos regulares |
| Espejo | Línea de materia con rayado corto en la cara trasera |
| Pared adiabática | Doble línea con relleno de rayado; pared conductora: línea simple |
| Región de campo perpendicular | Borde discontinuo de la familia; rejilla de ⊙ o ⊗ cada 32 px |
| Componentes de circuito | Símbolos IEC en tinta; cables de 2 px; nodos con disco de 3 px |
| Imanes | N lleno de tinta con "N" en `--sobre-tinta`; S lleno de lienzo con "S" en tinta |
| Rayos | 1.5 px; color espectral de su λ o tinta si es luz blanca; flecha a mitad del tramo |
| Frentes de onda | 1 px tinta al 60 %, sin flecha |
| Líneas de campo eléctrico | 1 px en la familia eléctrico, con punta pequeña de 7 × 6 px a mitad de cada línea; número proporcional a \|q\| |
| Equipotenciales | 1 px discontinuas 4 · 3 en la familia eléctrico; etiqueta del valor en Plex Mono 11 px con halo |
| Sonda de campo | Anillo de 7 px con retícula a 45°; ficha con las lecturas |
| Baño térmico y líquidos | Tinte del 6 % de tinta con rayas cortas bajo la superficie; el recipiente es superficie fija |
| Moléculas | Discos de 2.5 a 4 px en `--texto-2`; su densidad y agitación siguen a V y T |
| Flujo de calor | Flecha de vector en la familia térmico, etiqueta *Φ* con subíndice descriptivo (*Φ*<sub>cal</sub>, *Φ*<sub>baño</sub>) |
| Calentador | Zigzag de resistencia en tinta (es materia; el calor que entrega lleva el color) |
| Estado futuro de un objeto | Contorno discontinuo 6 · 4 (una pesa que se pondrá más adelante) |

### 7.4 Etiquetas

- Símbolo en cursiva serif del color de la magnitud; valor en Plex Mono
  `--texto-2`: *v* = 4.96 m/s.
- Toda etiqueta sobre el lienzo lleva **halo**: contorno de 3 px del color
  del lienzo, pintado detrás del texto.
- Las etiquetas de eventos y lecturas largas van en una **ficha**: fondo
  `--panel`, borde `--linea`, radio 5, separación de 6 × 4 px, con una línea
  guía de 1 px hacia el punto.

### 7.5 Edición

- **Selección:** contorno discontinuo 3 · 3 de `--tinta` a 5 px del objeto.
  En regiones limitadas por paredes (un gas, un émbolo) el contorno va hacia
  dentro en los lados donde hay pared.
- **Asas:** cuadrados de 7 px, relleno `--lienzo`, borde de 1.5 px `--tinta`.
  El asa de un vector (para arrastrarlo) es un círculo de 5 px en la punta.
- **Guías de ajuste:** líneas punteadas de `--texto-3` con el valor del
  ajuste en una ficha.
- **Hover:** el objeto bajo el cursor se engrosa 0.5 px; nada cambia de
  color.
- **Ejes:** ningún número de un eje se escribe debajo de un objeto; se omite.

### 7.6 Eventos

Rombo de 8 px. En la línea de tiempo, rombos en `--tinta` sobre el riel; en
el lienzo, anillo de 7 px con la ficha del evento. El evento no tiene color:
lo que importa es el instante.

---

## 8. Componentes

Implementados en `sistema/componentes/componentes.css`.

| Componente | Variantes y estados |
|---|---|
| Botón | primario (sólido de tinta), secundario (campo), fantasma, solo icono; normal, hover, presionado, deshabilitado, foco |
| Campo numérico | número, unidad, expresión, referencia a variable (chip con el nombre en cursiva y el valor en gris), error |
| Deslizador | con riel, relleno y perilla; con marcas opcionales |
| Control segmentado | 2 a 5 opciones |
| Casilla e interruptor | con etiqueta y muestra de color opcional (para vectores) |
| Pestañas | de panel y de documento |
| Menú desplegable y menú contextual | con atajos a la derecha en Plex Mono |
| Árbol de escena | nodo con muestra, nombre, acciones al hover (ver, bloquear) |
| Fila de inspector | etiqueta de 72 px + control; grupo plegable con título; ayuda bajo la fila alineada con el control |
| Ayuda emergente | texto, término en inglés y atajo |
| Paleta de comandos | buscador con resultados agrupados |
| Diálogo | título, cuerpo, acciones a la derecha |
| Notificación | breve, abajo al centro, se cierra sola |
| Línea de tiempo | riel, progreso, cabezal, eventos, marcas de tiempo |
| Tarjeta de gráfica | título con símbolos, lectura actual, gráfica |
| Tarjeta de escenario | miniatura dibujada con la gramática, título, módulo, tipo |
| Chip | De tipo en contorno (Tutorial, Ejemplo, Propio); MEXT en lleno, porque identifica el banco; de dato en suave ("7 espacios de trabajo", "Prototipo") |
| Barra superior y migas | marca, módulo / espacio, nombre de escena, transporte, reloj |
| Paleta de objetos | `.herr`: icono de 20 px y nombre en hasta dos líneas |
| Flotantes del lienzo | `.flotante` en las esquinas; aviso sobre el lienzo abajo al centro |
| Tabla de datos | `.tabla`, cifras alineadas a la derecha, fila del instante actual resaltada |
| Registro de energía | `.barras` y `.barra-e`, con variante con signo (`.con-signo`) |
| Leyenda de gráfica | `.leyenda`: muestra del trazo y símbolo |
| Atajo | `kbd` en Plex Mono |
| Indicador de modo | Preciso o Multitud, con punto de estado |
| Estado vacío | ilustración de línea, una frase y una acción |

---

## 9. Plantillas de pantalla

| Plantilla | Estructura |
|---|---|
| Inicio | Barra superior; contenido de 1240 px como máximo; Continuar (4 columnas), Módulos (3 columnas), Biblioteca con filtros (4 columnas) |
| Espacio de trabajo | Barra superior (marca, módulo ▸ espacio, nombre de escena, transporte, tiempo, velocidad, modo, acciones); panel izquierdo (paleta, instrumentos, escena); lienzo; panel derecho (inspector, variables); panel inferior (línea de tiempo y pestañas Gráficas, Tabla, Energía, Eventos) |
| Biblioteca | Filtros a la izquierda; cuadrícula de tarjetas de escenario |

Todo módulo usa la plantilla de espacio de trabajo sin cambiar su
estructura; solo cambian el contenido de la paleta, el inspector, los
instrumentos y el lienzo.

---

## 10. Implementación

| Pieza | Archivo | Regla |
|---|---|---|
| Tokens | `sistema/tokens/tokens.json` | Fuente única. `node sistema/tokens/construir.mjs` genera `tokens.css` y `tokens.ts`; nunca se editan a mano |
| Componentes | `sistema/componentes/componentes.css` | Solo usa tokens; ningún color literal |
| Comportamiento común | `sistema/componentes/espacio.js` | Tema, pestañas, conmutadores, deslizadores, ayudas emergentes |
| Línea de tiempo | `sistema/componentes/linea-tiempo.js` | Una sola implementación para todos los módulos |
| Gramática del lienzo | `sistema/lienzo/trazo.js` | Núcleo común; cada dominio añade símbolos en `sistema/lienzo/dominios/<modulo>.js` extendiendo `Volta.Trazo.prototype` |
| Gráficas | `sistema/lienzo/grafica.js` | Estilo fijo; en la aplicación se reemplaza por uPlot con el mismo aspecto |
| Iconos | `sistema/iconos/fuente/iconos.mjs` | `node sistema/iconos/construir.mjs` genera los SVG, el sprite, `sprite.js` y el catálogo |
| Marca | `sistema/marca/` | Símbolo e icono de aplicación |
| Prototipos | `sistema/prototipos/` | Se sirven con el servidor local `volta-prototipos` (`.claude/launch.json`, puerto 8811) |

Un módulo nuevo empieza copiando la estructura de `sistema/prototipos/mecanica.html`
(implementación de referencia) y solo cambia paleta, inspector, instrumentos y
lienzo.

---

## 11. Pendientes del lenguaje

Detectados al construir la guía viva (`sistema/prototipos/guia.html`); se
resuelven antes del módulo que los necesite.

| Pendiente | Propuesta |
|---|---|
| Pestañas de documento, marcas del deslizador, campo deshabilitado | Añadirlos a `componentes.css` |
| Notificación de ventana (no del lienzo) | Clase `.aviso-ventana` y token de duración |
| Estados forzados para documentación | Clases `.es-hover`, `.es-activo`, `.es-foco` |
| Halo en vectores sobre mapas de campo | Opción `halo` en `vector()` y `flechaPx()` |
| Desplazamiento de vectores casi paralelos | Opción en `vector()` (hoy lo resuelve Electrostática a mano) |
| Mapas de color | `Volta.mapa(nombre, t)` en OKLab en el núcleo |
| Polea, cuerda floja (catenaria), región de campo perpendicular | Métodos `polea()`, `cuerda(p1, p2, { longitud })`, `regionCampo()` |
| Hover en `particula()` | Opción `hover` como la de `cuerpo()` |
| Etiquetas de series con símbolos | `grafica.js` acepta segmentos como `compuesto()` |
| Espacio de nombres de los dominios | Cada dominio nombra sus métodos con prefijo propio para poder cargarse juntos |
