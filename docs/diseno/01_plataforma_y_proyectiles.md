# Diseño detallado 1 — Plataforma y espacio "Cinemática y proyectiles"

Primera iteración de Volta: la plataforma común se construye junto con el
primer espacio de trabajo de Mecánica. Este documento fija qué entra, cómo se
modela y cómo se comporta, antes de programar.

## 1. Qué entra en esta iteración

| Entra | Queda para después |
|---|---|
| Aplicación Tauri con ventana, menú y archivos `.volta` | Instalador firmado y actualizaciones |
| Lienzo con zoom, desplazamiento, cuadrícula, ejes y barra de escala | Capa WebGL para campos (llega con Electrostática) |
| Paleta, árbol de escena, inspector, variables | Restricciones geométricas entre objetos |
| Partículas, suelo, segmentos, plano inclinado, plataforma, curva y = f(x) | Cuerpos rígidos, cuerdas, resortes (siguientes espacios de Mecánica) |
| Gravedad, resistencia del aire lineal y cuadrática | Fluidos, campos propios |
| Choques con restitución, deslizamiento con fricción sobre superficies | Fricción estática con estados pegado/deslizando completa |
| Motor preciso: Dormand–Prince 5(4) con salida densa y eventos | Modo multitud |
| Línea de tiempo con eventos, retroceso y avance | Ramas comparables |
| Trayectoria prevista en vivo al editar | |
| Vectores, componentes, trazas, estroboscopio | Diagrama de cuerpo libre (llega con Dinámica) |
| Regla, transportador, cronómetro, fotopuerta | |
| Gráficas de cualquier cantidad, tabla, exportar CSV y PNG | Ajuste de curvas, video MP4 |
| Deshacer y rehacer, autoguardado | Paleta de comandos completa |
| Escenas: 3 tutoriales, 2 ejemplos, 2019 P3 y 2015 1-(1) | El resto de escenas MEXT de Mecánica |

## 2. Herramientas de desarrollo

Comprobado en este equipo (2026-11-18): Rust 1.100 (x86_64-pc-windows-msvc),
Node 24.15, npm 11.12, WebView2 157. Falta instalar:

- el destino `wasm32-unknown-unknown` (`rustup target add`);
- `wasm-bindgen-cli` (o `wasm-pack`);
- la CLI de Tauri (`@tauri-apps/cli` como dependencia de desarrollo de npm).

## 3. Modelo de datos

### 3.1 Valores con unidades y expresiones

Todo parámetro numérico de una escena se guarda como **texto** y se evalúa al
compilar la escena:

```json
"velocidad": { "modulo": "v0", "angulo": "35 deg" },
"posicion":  ["0 m", "h"]
```

- Acepta números con unidad (`72 km/h`, `35 deg`, `3 m`), variables (`h`) y
  expresiones (`sqrt(2*g*h)`).
- Cada campo conoce su dimensión (longitud, velocidad, ángulo…). Si la
  expresión da otra dimensión, el inspector la marca en rojo y no se aplica.
- Internamente todo es SI en `f64`.

### 3.2 Escena

```rust
// Esquema simplificado; los tipos reales viven en volta-escena.
struct Escena {
    version: u32,
    meta: Meta,                     // título, módulo, espacio, tipo, etiquetas, datos MEXT
    vista: Vista,                   // cámara, escala, cuadrícula, capas visibles
    constantes: Constantes,         // g (módulo y dirección), etc.
    variables: Vec<Variable>,       // nombre, expresión, unidad, rango del deslizador
    objetos: Vec<Objeto>,           // ver 3.3
    acciones: Vec<Accion>,          // "en t = …" o "cuando ocurra …" → hacer …
    instrumentos: Vec<Instrumento>, // regla, transportador, fotopuerta, cronómetro
    graficas: Vec<Grafica>,         // series: (objeto, cantidad) contra t u otra cantidad
    simulacion: AjustesSim,         // modo, tolerancia, duración máxima, paso de salida
    verificacion: Vec<Comprobacion>,// solo para el verificador interno
}
```

### 3.3 Objetos de esta iteración

| Tipo | Campos |
|---|---|
| `Particula` | id, nombre, color, masa, posición, velocidad (módulo y ángulo, o componentes), radio visual, traza, estroboscopio, vectores visibles |
| `Suelo` | altura, e, μk |
| `Segmento` | p1, p2, e, μk, cara activa (una o ambas) |
| `PlanoInclinado` | vértice, ángulo, longitud, sentido (sube o baja hacia la derecha), e, μk |
| `Plataforma` | rectángulo (esquina, ancho, alto), e, μk |
| `Curva` | expresión y = f(x), dominio, e, μk |
| `Aire` | modelo (ninguno, lineal b, cuadrático c) |

Cada objeto tiene un `id` estable (no cambia al renombrar) para que gráficas,
instrumentos y acciones se refieran a él.

### 3.4 Archivo `.volta`

ZIP con `escena.json`, `miniatura.png` y, opcionalmente, `figura.png` (la
figura original de un escenario MEXT). El JSON se valida con un esquema
generado desde los tipos de Rust; los tipos de TypeScript se generan del mismo
origen.

## 4. Motor

### 4.1 Estado y fases

- El estado de cada partícula es (x, y, vx, vy).
- La **fase** de una partícula es "en vuelo" o "sobre la superficie S".
- En vuelo: a = g + arrastre/m.
- Sobre una superficie: la partícula se mueve a lo largo de ella; la
  aceleración tangencial incluye la fricción cinética, y la normal se calcula
  explícitamente para vigilar el despegue.

### 4.2 Eventos

| Evento | Función que cruza cero | Transición |
|---|---|---|
| Impacto con superficie | distancia con signo a la superficie (para curvas, por proyección) | Choque: v_n' = −e·v_n, v_t' = v_t (sin fricción de impacto en esta iteración). Si v_n' queda bajo el umbral, pasa a "sobre la superficie" |
| Despegue | normal N | Pasa a vuelo |
| Fin de la superficie | parámetro de la curva llega a su extremo | Pasa a vuelo (sale por el borde) |
| Se detiene | rapidez tangencial = 0 con fricción | Queda en reposo |
| Eventos de instrumentos | fotopuerta cruzada, vy = 0 (altura máxima) si el usuario los pide | Solo se registran |

- Cada evento se localiza con el método de Brent sobre la salida densa, con
  tolerancia de 1e-12 s.
- Si dos eventos caen en el mismo paso, se procesa el primero y se reintegra
  desde ahí.
- **Rebotes infinitos:** con e < 1 se lleva la cuenta; si el tiempo entre
  rebotes baja de 1e-9 s, la partícula pasa a "sobre la superficie".

### 4.3 Ejecución e historial

- **Simulación anticipada:** el worker calcula por delante de la pantalla
  (hasta 2 s de tiempo físico, o hasta el final). La pantalla solo lee del
  historial, así que la animación nunca da tirones aunque haya eventos.
- **Historial:** por cada paso aceptado del integrador se guardan el estado y
  los coeficientes de la salida densa. Cualquier instante se reconstruye
  exactamente, sin volver a integrar. Los eventos se guardan aparte con su
  estado antes y después.
- **Editar en t = 0 (modo preparación):** cada cambio recalcula la
  simulación completa en segundo plano (milisegundos con pocos cuerpos). Por
  eso, al arrastrar la flecha de velocidad, la **trayectoria prevista** se
  redibuja en vivo.
- **Editar con t > 0:** si se cambia una condición inicial, se recalcula
  desde t = 0 y la línea de tiempo conserva el instante que se estaba viendo.
  Las ramas a mitad de la simulación llegan en una iteración posterior.

### 4.4 Interfaz entre el núcleo y la ventana

El worker expone mensajes, no objetos:

| Mensaje de la ventana | Respuesta del worker |
|---|---|
| `cargar(escena_json)` | errores de validación o `ok` con resumen |
| `simular(hasta_t)` | bloques de historial (búferes transferibles) y eventos nuevos |
| `muestrear(t)` | estado de todos los objetos en t |
| `serie(id, cantidad, t0, t1, n)` | arreglo de valores para una gráfica |
| `editar(parche)` | aplica un cambio y reinicia la simulación |

### 4.5 Pruebas del motor (antes de la interfaz)

- Tiro sin aire: alcance, altura máxima y tiempo de vuelo contra la fórmula,
  con error relativo menor que 1e-10.
- Impacto con plano inclinado: punto exacto contra la fórmula de 2019 P3.
- Rebotes con e = 0.8: alturas sucesivas h·e^(2n) (2019 1-(2)).
- Arrastre lineal: contra la solución analítica exponencial.
- Energía: con e = 1, sin fricción y sin aire, la energía se conserva a 1e-12.
- Convergencia: el error baja con orden 5 al reducir la tolerancia.

## 5. Interfaz

### 5.1 Componentes

```
App
├── BarraSuperior: módulo ▸ espacio, transporte, velocidad, tiempo, archivo
├── PanelIzquierdo
│   ├── Paleta (objetos e instrumentos del espacio de trabajo)
│   └── ArbolEscena (objetos, visibilidad, bloqueo, orden)
├── Lienzo
│   ├── capa Cuadrícula y ejes
│   ├── capa Mundo (superficies, partículas)
│   ├── capa Superposiciones (trayectoria prevista, trazas, estroboscopio, vectores, etiquetas)
│   ├── capa Instrumentos (regla, transportador, fotopuertas)
│   └── capa Edición (selección, asas, guías de ajuste)
├── PanelDerecho
│   ├── Inspector (campos del objeto seleccionado)
│   └── Variables (con deslizadores)
└── PanelInferior
    ├── LineaDeTiempo (eventos marcados)
    └── pestañas: Gráficas · Tabla · Energía
```

- Interfaz en Svelte 5 con TypeScript.
- El lienzo se dibuja con Canvas 2D: líneas y texto nítidos, y sobra
  rendimiento para decenas de objetos. Las capas WebGL se suman cuando un
  módulo las necesite.
- Gráficas con uPlot; fórmulas en etiquetas con KaTeX.

### 5.2 Interacciones del lienzo

| Acción | Gesto |
|---|---|
| Colocar objeto | Arrastrar desde la paleta, o elegirlo y hacer clic en el lienzo |
| Plano inclinado | Clic en el vértice y arrastrar: el ángulo se ajusta a múltiplos de 5° (Mayús para 1°) |
| Velocidad inicial | Arrastrar la punta de la flecha; muestra módulo y ángulo mientras se arrastra |
| Mover | Arrastrar el objeto; ajuste a la cuadrícula y a bordes de otros objetos |
| Zoom | Rueda del ratón, centrada en el cursor; doble clic en vacío para encuadrar todo |
| Desplazar | Botón central, o espacio + arrastrar |
| Editar valor exacto | Doble clic en una etiqueta del lienzo abre el campo en el inspector |
| Simular | Barra espaciadora para reproducir o pausar; flechas para avanzar o retroceder un cuadro |

### 5.3 Colores con significado físico

Los mismos colores en todos los módulos, en el lienzo, las gráficas y el
inspector:

| Cantidad | Uso |
|---|---|
| Velocidad | vectores v y sus componentes, gráficas de v |
| Aceleración | vectores a, gráficas de a |
| Fuerza | vectores de fuerza (Mecánica, Electrostática, Magnetismo) |
| Momento lineal | vectores p |
| Energía cinética, potencial, térmica | barras y gráficas de energía |
| Trayectoria | trazas y estroboscopio |

Los valores concretos dependen de la dirección visual elegida; cada uno tiene
versión clara y oscura con contraste suficiente.

## 6. Escenas de esta iteración

| Tipo | Escena |
|---|---|
| Tutorial | Caída libre: colocar una partícula y reproducir |
| Tutorial | Tiro oblicuo: arrastrar la flecha de velocidad y ver la trayectoria prevista |
| Tutorial | Gráficas: añadir y(t) y vy(t) a una partícula |
| Ejemplo | Alcance contra ángulo: cinco lanzamientos con el mismo v0 |
| Ejemplo | Pelota que rebota con e = 0.8 |
| MEXT | 2019 P3 (salto desde una plataforma hacia una pendiente) |
| MEXT | 2015 1-(1) (tiro oblicuo hasta el suelo) |

## 7. Criterio de terminado

- Las pruebas del motor (4.5) pasan.
- Las siete escenas abren, simulan y se ven bien en capturas reales, en tema
  claro y oscuro.
- 2019 P3 y 2015 1-(1) pasan la verificación interna.
- La trayectoria prevista responde al arrastre sin retraso perceptible.
