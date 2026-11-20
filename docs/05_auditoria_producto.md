# Auditoría de producto y de simulación (2026-11-19)

Revisión crítica de la versión 0.15.0, hecha a petición del autor con cuatro
revisiones independientes: interfaz y producto (sobre el código), funciones
de simulación por módulo (sobre el código), referencias de suites de escritorio
(investigación externa) y nombre definitivo. Conclusión: la física es sólida y
está probada, pero la aplicación todavía se comporta como un conjunto de
páginas web empaquetadas, no como un producto de Windows. Este documento es la
lista de trabajo; PROGRESO.md lleva el avance.

## A. Producto, interfaz y configuración

### A1. Bloqueantes

1. **Se pierde trabajo sin aviso.** Un solo autoguardado por pantalla en
   `localStorage` (`componentes/archivos.js:72-90`) que se sobrescribe al
   elegir otra escena o abrir un archivo, con el historial de deshacer vacío;
   abrir una pantalla con `?escena=` apaga el autoguardado toda la sesión
   (`autoguardar = limpio || !!previa` en 20 pantallas); «Nueva escena» de
   Inicio borra el autoguardado de Mecánica (`inicio.html:287`); no hay
   ningún diálogo «¿Guardar cambios?» ni al cerrar la ventana.
2. **No hay modelo de documento.** «Guardar» siempre pregunta la ruta y no
   la recuerda; no hay Guardar como, ni nombre de archivo ni asterisco en el
   título; «Continuar» muestra huecos de autoguardado, no archivos; `.volta`
   no está registrada en Windows (sin `fileAssociations`, sin argumentos de
   línea de órdenes, sin instancia única ni arrastrar y soltar); Ctrl O en un
   módulo rechaza archivos de otro; solo el Laboratorio tiene botones
   visibles de Abrir y Guardar; no hay proyectos, plantillas ni miniaturas.
3. **Restos de desarrollo a la vista.** Botones «Lenguaje de diseño» e
   «Iconos» en Inicio (`inicio.html:53-54`); el catálogo de iconos no tiene
   salida; la guía viva y el catálogo, `construir.mjs`, `tokens.ts` y 242 SVG
   sueltos van dentro del ejecutable (`frontendDist: "../sistema"`); escena
   inventada «Mi rampa con fricción» en la Biblioteca (`inicio.html:137`);
   parámetros de depuración activos en la URL (`?captura`, `?tema`, `?t`…).
4. **Controles muertos o engañosos.** «Ajustes» sin manejador
   (`inicio.html:57`); el buscador de Inicio es un `div` sin campo y Ctrl K
   no hace nada allí; «Nueva escena» lleva a Cinemática, que es una escena
   fija; «Añadir variable», «Añadir objeto» y comandos «Añadir partícula»,
   «Añadir plano», «Colocar regla» sin efecto; árbol estático con iconos de
   ojo y candado decorativos en Cinemática; botones `data-pendiente` (sonda
   de potencial, voltímetro, atmósfera, paletas de Órbitas) y el «Resorte»
   de Termodinámica, que falla al usarse.

### A2. Graves

5. **No hay configuración.** Falta una ventana de Preferencias: idioma,
   tema (con «seguir al sistema»), tamaño de la interfaz y de la letra,
   unidades y cifras significativas (fijas en 4), separador decimal (la coma
   se lee como separador de miles), precisión y rendimiento por defecto,
   carpeta de documentos, atajos, restablecer valores. Guardadas en
   `%APPDATA%`, no en `localStorage`.
6. **Idioma: solo español.** No hay infraestructura de traducción: 724
   ayudas, unos 350 avisos, textos del lienzo, errores de `nucleo/` y
   catálogos de escenas están escritos en español dentro del código; `lang`
   fijo. Hace falta una función de traducción común (HTML, JS y lienzo),
   formato numérico por idioma y la interfaz completa en español e inglés.
7. **Integración con Windows casi nula.** La ventana abre a 1440 × 900 sin
   maximizar ni recordar su posición (no cabe en un portátil de 1366 × 768 ni
   en 1920 × 1080 al 125 %); no hay menú de aplicación ni «Acerca de»; la
   barra de título no sigue el tema; cada cambio de módulo recarga la página
   (posible destello); no hay instancia única (dos ventanas se pisan el
   autoguardado); el instalador no está firmado (aviso de SmartScreen).
8. **Delata ser un navegador.** Menú contextual de Edge fuera del lienzo;
   F5, Ctrl R, Alt+← y Ctrl P funcionan como en un navegador (F5 pierde el
   trabajo); Inicio es un documento con scroll de página; texto
   seleccionable en los paneles; navegación con enlaces.
9. **Edición libre desigual.** Solo 5 de 23 espacios son constructores de
   verdad (Laboratorio de Mecánica, Circuitos, Óptica geométrica, Sistema
   solar, Maniobras; Magnetismo a medias). «Escena vacía» solo existe en 4.
   Renombrar escena, zoom y Encuadrar faltan en varias pantallas; no hay
   encuadre automático al cambiar la escena.
10. **Búsqueda.** No hay búsqueda global de escenas, módulos, objetos y
    opciones; la paleta de comandos de cada pantalla solo ve su espacio. La
    Biblioteca enseña 12 escenas fijas de 155 MEXT y cuatro tarjetas abren
    el autoguardado en vez de la escena anunciada.
11. **Accesibilidad.** 230 de 235 botones de icono sin nombre accesible; la
    ayuda solo aparece con el ratón; lienzos sin texto alternativo; avisos
    sin `aria-live`; contraste de 2.3:1 en texto secundario; menús sin
    navegación con flechas.

### A3. Medios y menores

12. Incoherencia entre pantallas: la pastilla «Preciso» es etiqueta en unas
    y botón en otras; velocidades de reproducción distintas; la misma tecla
    hace cosas distintas (E, C); «(modificada)» solo en Termodinámica; sin
    ayuda de atajos.
13. Exportación pobre: solo CSV y PNG; faltan SVG, PDF, informe, impresión,
    vídeo o GIF y copiar al portapapeles; `.volta` es JSON sin comprimir ni
    miniatura ni versión de formato visible.
14. Paneles de ancho fijo: no se mueven, acoplan ni ocultan.
15. Detalles: versión de relleno «0.1.0» mientras carga; chip «Disponible»
    en todos los módulos; notas de diseñador en Inicio; miniaturas
    equivocadas en «Continuar»; conteos de módulos a mano; títulos de
    ventana incoherentes; `csp: null`; comentarios «prototipo».

## B. Simulador y funciones

### B1. Transversal (todos los módulos)

1. **Gráficas de verdad.** `lienzo/grafica.js` dibuja imágenes estáticas:
   faltan zoom, desplazamiento, cursores de lectura, escala logarítmica,
   varias series y corridas superpuestas, y elegir qué graficar en todos los
   espacios (hoy solo en el Laboratorio, Magnetismo y el osciloscopio).
2. **Análisis de datos.** Ajuste de curvas genérico (lineal, potencia,
   exponencial, senoidal), tablas con columnas calculadas, barrido de
   parámetros y comparación de corridas.
3. **Expresiones.** Fuerzas, campos y fuentes como funciones de t, x y v
   (hoy todo es constante o fijo).
4. **Variables propias** en todos los espacios (hoy solo en el Laboratorio).
5. **Contenido.** Cinco a diez ejemplos clásicos con nota por espacio y
   tutoriales guiados con pasos, predicción y comprobación (los actuales son
   notas de cuatro frases; las referencias traen 150 o más).
6. **Instrumentos comunes**: cronómetro, transportador, dinamómetro, sondas
   y medidores conectables en todos los módulos donde tengan sentido.
7. **Exportar vídeo o GIF** de la simulación; importar datos experimentales.
8. **Módulos que se hablan**: cargas en Mecánica, circuitos dentro de
   Inducción, gravedad en el Laboratorio.

### B2. Por módulo

- **Mecánica.** Cinemática es una escena fija con la gravedad bloqueada y
  una paleta que no coloca nada: convertirla en constructor o integrarla en
  el Laboratorio. En el Laboratorio: fuerzas F(t), F(x); polígonos y curvas
  y = f(x); articulaciones con motor, par aplicado, engranajes; cuerdas con
  masa; fluidos y flotación (M10); marcos de referencia que se mueven (M11);
  fricción en los choques; vértice contra vértice; modo multitud para
  cientos de cuerpos; gráficas de fuerzas y energía por cuerpo; θ, ω y
  fuerzas en la tabla y en el CSV. Ejemplos que faltan: péndulo balístico y
  cónico, rizo, tiro con arrastre, osciladores acoplados, resonancia forzada,
  cohete, yo-yo, escalera que resbala.
- **Gravitación.** Órbitas duplica a Sistema solar con paletas inertes:
  fusionar o completar. Faltan órbitas inclinadas (3D), empuje continuo,
  atmósfera y reentrada, puntos de Lagrange y marco que gira, mareas y
  límite de Roche, resonancias y precesión, potencial efectivo.
- **Termodinámica.** El montaje rechaza combinaciones (un solo cilindro;
  cilindro y recipientes no conviven); el resorte no funciona; los campos no
  aceptan unidades. Faltan diagrama T-S, refrigerador y bomba de calor,
  ciclos Diesel, Brayton, Stirling y Rankine, procesos irreversibles, gas
  real (van der Waals), atmósfera barométrica y atracción molecular
  (condensación), conducción a lo largo de una barra, radiación,
  convección, evaporación y dilatación.
- **Electrostática.** Sonda de potencial y voltímetro solo avisan;
  Conductores es un selector de plantillas con simetría. Falta el
  solucionador de Poisson (conductores y dieléctricos de forma libre), flujo
  de Gauss exacto, dipolo con par, carga imagen, Millikan.
- **Circuitos.** La mayor brecha frente a Falstad o LTspice: corriente
  alterna y análisis en frecuencia (fasores, impedancia, Bode, resonancia),
  diodo y LED, transistor, amplificador operacional, transformador e
  inductancia mutua, fuentes controladas, lógica digital. Ejemplos: RL, RLC,
  Thévenin, máxima transferencia, Kirchhoff con dos fuentes.
- **Magnetismo.** Vista 3D de espiras y solenoides; materiales magnéticos
  (μr, histéresis); medidores de Inducción que se conecten de verdad; fem
  inducida que actúe sobre las partículas; imán que cae por un tubo,
  transformador, motor de corriente continua; Hall en tiempo físico; editar
  vértices de regiones.
- **Ondas.** Fuente que se mueve en la cubeta (el motor ya lo admite);
  régimen supersónico y cono de Mach; fuentes con trayectoria libre; medios
  dispersivos y cadena de masas; síntesis de Fourier editable; barreras
  curvas.
- **Óptica.** Polarización (polarizadores, Malus, Brewster con
  componentes s y p, birrefringencia); polígonos y lentes libres en la
  paleta (el motor ya los admite); instrumentos (lupa, telescopio,
  microscopio, cámara, ojo con corrección); índice gradual; abertura
  circular y disco de Airy, criterio de Rayleigh, coherencia; Michelson con
  luz blanca, Fabry–Pérot, Mach–Zehnder.
- **Física moderna.** Solo efecto fotoeléctrico y núcleo. Faltan modelo de
  Bohr y espectros, rayos X, cuerpo negro, Compton, Rutherford, de Broglie y
  efecto túnel, relatividad especial, Franck–Hertz, láser, fusión, curva de
  energía de enlace, reacción en cadena; carga espacial en el fotoeléctrico.

## C. Requisitos de producto (referencias: Interactive Physics, Working Model, Algodoo, Universe Sandbox, COMSOL, Multisim, LTspice, GeoGebra)

1. Extensión propia registrada con icono de documento; doble clic y
   arrastrar a la ventana la abren.
2. Formato contenedor (ZIP) con versión y miniatura, que abra versiones
   anteriores.
3. Archivo › Nuevo, Abrir, Guardar, Guardar como, Cerrar, con aviso de
   cambios sin guardar.
4. Recientes en el menú y en la pantalla de inicio.
5. Autoguardado periódico y recuperación tras un cierre inesperado.
6. Pantalla de inicio con plantillas y ejemplos buscables.
7. Una ventana de Preferencias con árbol de categorías, buscador y
   «Restablecer» por página y global.
8. Preferencias globales separadas de las propiedades del documento.
9. Unidades y cifras significativas configurables.
10. Precisión de la simulación configurable (paso, tolerancia).
11. Idioma elegible que arranca con el del sistema.
12. Tamaño de interfaz y de letra; temas claro, oscuro y alto contraste.
13. Deshacer y rehacer ilimitados en todas las pantallas.
14. Copiar y pegar objetos; copiar la vista como imagen.
15. Atajos estándar de Windows (F1 ayuda, Ctrl S…) y personalizables.
16. Paneles acoplables con «Restablecer diseño».
17. Ayuda contextual sin conexión y tutoriales guiados.
18. Exportar PNG, SVG, PDF, vídeo, GIF y CSV.
19. Imprimir con vista previa e informe con plantilla.
20. Configuración en AppData y documentos en Documentos, rutas
    configurables.

Diferenciador: ninguna de las referencias tiene una búsqueda de comandos y
opciones al estilo de Ctrl K; Volta puede tenerla en toda la aplicación.

## D. Nombre definitivo

«Volta» era el nombre en clave. Candidatos comprobados en la web (no es un
dictamen de marcas: falta consultar IMPI, EUIPO, USPTO y J-PlatPat):

| Nombre | Idea | Disponibilidad | Riesgo |
|---|---|---|---|
| Oscilo | Movimiento periódico, común a mecánica, ondas, circuitos y óptica; en Japón オシロ es el osciloscopio | `oscilo.app` libre; GitHub con sufijo (`oscilolab`) libre | En inglés se escribiría «oscillo» |
| Fasor | Concepto conocido de circuitos y ondas; igual en español e inglés | `fasor.io` libre | Una app pequeña uruguaya del mundo eléctrico; recuerda a «phaser» |
| Nonio | El calibre del laboratorio escolar; origen ibérico | Dominios exactos ocupados | Sistema de registro impopular en Portugal; poco conocido fuera |
| Statera | Balanza romana: medida y sobriedad | Dominios ocupados | Marcas de software empresarial en EE. UU. |
| Kelvo | Inventado, guiño al kelvin | Dominios ocupados | Tres productos pequeños con ese nombre |

Descartados por choque claro: Kinema, Kyma, Nabla, Celer, Vis viva, Fulcro.

Cambio técnico: el nombre visible (ventana, instalador, interfaz,
documentación) cambia sin romper nada. El identificador de la aplicación
(`io.github.eliam4510.volta`) debe conservarse, porque cambiarlo hace que las
versiones instaladas no se actualicen solas y se instale como otra
aplicación. Renombrar el repositorio en GitHub es posible (GitHub redirige),
pero conviene comprobar después que la dirección de `latest.json` siga
respondiendo.
