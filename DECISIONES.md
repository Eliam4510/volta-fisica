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
14. **Contactos como problema de complementariedad (2026-11-19).** Las
    restricciones unilaterales (apoyos, pares de discos, cuerdas) cumplen
    λ ≥ 0, w ≥ 0 y λ·w = 0. Se resuelven así en los instantes de evento: el
    conjunto activo, con un LCP de pivoteo principal (Murty) sobre el sistema
    ya armado y las bilaterales como filas libres; los restos de acercamiento,
    con un LCP de impulsos inelásticos simultáneos sobre todo lo que se toca.
    Dentro de cada tramo se sigue resolviendo una igualdad sobre el conjunto
    activo, para que los despegues (λ → 0) sigan siendo eventos exactos.
    J M⁻¹ Jᵀ se regulariza (el CFM de ODE y MuJoCo) solo cuando un pivote baja
    de 10⁻⁶ de la diagonal, con un paso de refinamiento iterativo que quita el
    sesgo en los modos bien condicionados. Al empezar cada tramo, las
    posiciones se proyectan para quitar los solapes de cuerpos (Cline y Pai,
    2003); las cuerdas no se proyectan. Un contacto persistente con hueco
    exige que la rapidez relativa entera sea lenta, no solo la normal.
15. **Superficies que se mueven y movimiento impuesto (2026-11-19).** Una
    superficie puede ir sobre un cuerpo (`sobre`): su geometría es relativa a
    él, se traslada sin girar y la reacción y la fricción lo empujan al revés.
    El movimiento impuesto es un cuerpo cinemático de masa inversa cero que
    sigue su velocidad inicial o un perfil de aceleración por tramos; dentro
    de cada tramo la aceleración es constante, así que los tramos de la
    simulación se cortan en cada cambio y allí se revisan los apoyos como en
    un instante de evento. Su trabajo (continuo e impulsivo) es una
    componente más del estado, `W`, y el balance es E + Qc + Qi = E0 + W. Un
    cinemático no interactúa con superficies fijas ni con otros cinemáticos.
    Sigue sin haber rotación: los cuerpos rígidos se arman con varillas.
16. **«Continuar» muestra solo lo real.** Inicio no inventa actividad: las
    escenas recientes salen del autoguardado de cada pantalla.
17. **N cuerpos: Yoshida 4 con Bulirsch–Stoer en los encuentros
    (2026-11-19).** El motor de «Sistema solar» y «Maniobras» integra con
    Yoshida de cuarto orden (simpléctico: la energía no deriva) y, en los
    pasos con un encuentro cercano (paso > 0.05·√(d³/μ)), con
    Bulirsch–Stoer adaptativo hasta orden 16, como MERCURY y SWIFT. La
    especificación proponía IAS15 o Dormand–Prince 8; Bulirsch–Stoer da la
    misma exactitud en los encuentros con menos código.
18. **Discos que giran: el giro es un grado de libertad más en las mismas
    filas (2026-11-19).** Un disco con inercia (I = k·m·r²) suma θ y ω al
    final del estado. En los gradientes de las restricciones su giro tiene
    el índice n + q y masa inversa 1/I, de modo que J M⁻¹ Jᵀ, el LCP, los
    impulsos y las proyecciones no cambian. La fricción (cinética y
    adherencia) actúa sobre el deslizamiento del punto de contacto,
    t̂·v + cr·ω con cr = −r·t̂·(ẑ×n̂): la adherencia es la rodadura sin
    deslizar y la fricción cinética hace par. El sentido de la fricción
    cinética queda fijo en cada tramo (antes se evaluaba signo(v_t) en cada
    etapa del integrador: el paso que contenía el cero mezclaba los dos
    sentidos y el instante en que una bola empieza a rodar salía 10⁻⁸ s
    tarde); el cero es el evento vt0. Los choques siguen sin fricción
    (impulso normal, que no cambia ω) y el contacto entre discos sigue sin
    fricción; los bloques que vuelcan (polígonos con vértices) quedan para
    después: encajan en el mismo esquema, con filas por vértice.
19. **Contactos entre cuerpos con superficies que giran (2026-11-19).** Un
    bloque aporta sus cuatro caras (segmentos) y sus cuatro esquinas (arcos
    de radio 0) como superficies llevadas por él que giran con él. Los
    vértices de otro bloque y los discos se apoyan y chocan en ellas con la
    misma maquinaria de apoyos (LCP, adherencia, eventos); cada fila mide la
    velocidad relativa al punto material del portador y lleva las entradas
    de su traslación y su giro, con J̇v = ω(ẑ×d)·rel + d·A0 − ω·d·(ẑ×(Ṗ − v)).
    Un punto que está detrás de una cara no vigila el borde de la cara (con
    el ruido de un bloque apoyado sobre otro se cruzaba sin fin): espera a
    pasar al lado libre (evento «frente»). Vértice contra vértice y la
    esquina fija de un escalón contra una cara quedan fuera.
20. **Paradoja de Painlevé: pegado en el límite del cono (2026-11-19).**
    Cuando un apoyo deja de deslizar, la adherencia no alcanza y ningún
    sentido de la fricción cinética es coherente (con él, el deslizamiento
    acelera hacia el otro lado), el apoyo queda pegado aunque pida un poco
    más que μs·N, como en los motores que resuelven la fricción dentro del
    cono (Box2D, PhysX). Si ambos sentidos son coherentes, se toma el
    contrario a la adherencia que no alcanzó. La fricción entre discos solo
    existe si alguno gira: entre partículas que no giran, el radio sigue
    sirviendo solo para chocar y las escenas anteriores no cambian.
21. **Actualizaciones con el plugin oficial y releases de GitHub
    (2026-11-19).** Se usa tauri-plugin-updater con un manifiesto
    `latest.json` adjunto a cada release y la dirección fija
    `releases/latest/download/latest.json`: no hace falta servidor propio.
    El instalador va firmado (minisign); la clave pública está en
    `tauri.conf.json` y la privada vive fuera del proyecto
    (`~/.tauri/volta-actualizaciones.key` en el perfil del autor, que guarda
    una copia de seguridad) y como secreto `TAURI_SIGNING_PRIVATE_KEY` del
    repositorio. Los artefactos firmados se piden solo en CI (`--config`
    con `createUpdaterArtifacts`), para que una compilación local sin clave
    no falle; sin el secreto, la release sale igual pero sin `latest.json`.
    En Windows la actualización ejecuta el instalador NSIS en modo pasivo,
    así que solo la versión instalada se actualiza sola; la portátil se
    reconoce porque no tiene `uninstall.exe` al lado y se le ofrece la
    página de descarga (plugin opener, limitado a la dirección del
    repositorio). Si la clave privada se pierde, las versiones instaladas
    ya no podrán actualizarse solas: habría que publicar una con clave
    nueva y que cada usuario la instale a mano.
