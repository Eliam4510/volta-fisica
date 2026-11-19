# Decisiones

Registro de decisiones tomadas sin consultar, con su motivo. Las más recientes
al final. Si una decisión se revierte, se anota la nueva en vez de borrar la
vieja.

## 2026-11-19 — Arranque del turno autónomo

1. **Repositorio público `Eliam4510/volta-fisica`, licencia MIT.** "volta" a
   secas choca con Volta (gestor de Node.js, ejecutable `volta.exe`) y con la
   arquitectura de GPU de NVIDIA. MIT, como Hakaru CES. Identidad git local
   con el correo *noreply* de GitHub.
2. **El banco MEXT original no se publica.** `Fisica.csv` (enunciados) y las
   124 figuras de los exámenes quedan en `.gitignore`. Se publican el análisis
   (clasificación por subtema, sin texto) y las escenas, que son
   reconstrucciones propias de cada situación física.
3. **Física e interfaz en JavaScript moderno (módulos ES) para v0.x; Tauri 2
   (Rust) como aplicación de Windows.** La arquitectura proponía el núcleo en
   Rust compilado a WASM. Se pospone: los prototipos ya validados están en
   JavaScript, y una sola lengua para núcleo e interfaz reduce el riesgo de
   integración en un turno sin supervisión. Los motores físicos van en
   módulos puros (sin DOM), con pruebas automáticas, para poder pasarlos a
   Rust/WASM cuando el rendimiento lo pida (gas molecular, cubeta 2D,
   Poisson). Tipos con JSDoc revisados por TypeScript (`checkJs`).
4. **Sin empaquetador (por ahora).** La carpeta `sistema/` se sirve tal cual
   como interfaz de la aplicación (`frontendDist`). Menos piezas que pueden
   fallar en CI; el día que haga falta, se añade Vite sin cambiar el código.
5. **Pruebas con Vitest**, que entiende módulos ES de forma nativa.
6. **Fuentes incluidas en el repositorio** (IBM Plex Sans, IBM Plex Mono,
   STIX Two Text; licencia OFL) para que la aplicación funcione sin internet.
7. **Releases:** se crean con `gh release create` (notas del CHANGELOG); un
   flujo de GitHub Actions en Windows compila con Tauri y adjunta el
   instalador NSIS y el `.exe` portátil a esa release.
8. **Prototipos como páginas de la aplicación.** `sistema/prototipos/*.html`
   pasan a ser las pantallas reales (Inicio, Mecánica, Electrostática,
   Termodinámica, Guía). Se renombrarán cuando la estructura lo pida.
9. **Motor general de Mecánica dirigido por eventos (autómata híbrido), no por
   pasos fijos.** Cada cambio de contacto es un evento localizado con Brent
   sobre la salida densa de Dormand–Prince, así que los instantes de choque,
   despegue o cuerda floja son exactos y comparables con las respuestas MEXT.
   Para muchos cuerpos en reposo esto cuesta muchos eventos; cuando haga
   falta se añadirá un modo multitud de paso fijo aparte, sin cambiar este.
10. **Robustez de los choques (2026-11-19).** Paso máximo según la rapidez
    (`hMaxDe` en el integrador); funciones de impacto continuas y medidas
    desde el hueco al empezar cada tramo; choques del mismo instante por
    impulsos secuenciales; contactos persistentes entre discos que se sueltan
    si dejan de empujarse o se separan; el radio cuenta contra las
    superficies; una partícula puede apoyarse en varias superficies.
11. **Un motor nunca aborta una simulación válida.** Al llegar al límite de
    eventos o si el integrador se detiene, devuelve lo simulado con
    `incompleta = {t, motivo}`; la pantalla lo muestra como aviso. Solo lanza
    con escenas inválidas (datos que no describen una situación física).
12. **Lo que se abre de un archivo es entrada no confiable.** Cada pantalla
    valida y acota los datos de una escena `.volta` antes de usarlos y sanea
    los nombres con `texto()` (`nucleo/escena.js`), porque se insertan en el
    marcado.
13. **Las barras flotantes del lienzo son zonas reservadas.** `trazo.ejes`
    aparta de ellas las etiquetas de los ejes; las demás etiquetas del lienzo
    deben respetarlas igual.
