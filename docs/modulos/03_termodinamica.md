# Módulo Termodinámica

## 1. Alcance

Gases ideales en recipientes con émbolos, válvulas y paredes; procesos y
primera ley; ciclos y máquinas térmicas; teoría cinética desde las moléculas;
calorimetría. Aparece en todos los exámenes del banco (P4).

Referencias revisadas: PhET Gas Properties (bomba de partículas ligeras y
pesadas, tapa, manómetro, termómetro, histogramas de rapidez y energía), el
simulador de moléculas y la máquina térmica de Falstad, y Energy2D
(transferencia de calor por conducción, convección y radiación).

## 2. Motores

Este módulo tiene dos motores, porque ofrece dos miradas distintas del mismo
gas.

### Motor macroscópico: laboratorio de gases

- Cada volumen de gas es un **volumen de control** con su estado: moles por
  especie, energía interna, volumen; de ahí salen P y T.
- Los **émbolos** tienen masa y se mueven por la diferencia de presiones, el
  peso, la atmósfera y los resortes que se les conecten. Un amortiguamiento
  ajustable hace que lleguen al equilibrio, y la energía que se disipa queda
  registrada.
- Las **paredes** conducen calor con una conductancia ajustable, o son
  adiabáticas.
- Las **válvulas** dejan pasar gas según la diferencia de presión. También
  hay un modo instantáneo que mezcla de golpe.
- Los procesos **emergen de la configuración**, como en un laboratorio real.
  Por ejemplo, la expansión libre ocurre sola al abrir la válvula hacia el
  vacío.
- **Modo cuasiestático:** el motor avanza por estados de equilibrio, como en
  los problemas de examen, en lugar de simular la dinámica del émbolo.
- **Procesos guiados:** también se puede imponer el camino (isobárico,
  isocórico, isotérmico, adiabático o una recta en el diagrama P-V) o dibujar
  un ciclo directamente sobre el diagrama P-V.

### Motor microscópico: gas molecular

- **Dinámica molecular por eventos** de esferas duras en **3D**. Se usa 3D
  aunque la vista pueda ser plana, para que se cumplan las fórmulas del
  temario: Cv = 3/2 R, v_rms = √(3kT/m) y PV = NkT. Un gas 2D daría otras
  constantes.
- Las colisiones se calculan exactamente, sin paso de tiempo, con listas de
  celdas para que escale a miles de moléculas.
- **Paredes térmicas:** devuelven las moléculas con la distribución de la
  temperatura de la pared. **Paredes adiabáticas:** rebote elástico.
- **Émbolo con masa** que las moléculas empujan: la adiabática PV^γ aparece
  sola, sin programarla.
- **Moléculas diatómicas** (opcional, avanzado): energía interna de rotación
  intercambiada en los choques con el modelo de Borgnakke–Larsen que se usa en
  simulación de gases (DSMC). Así Cv = 5/2 R aparece estadísticamente.

## 3. Espacios de trabajo

| Espacio | Motor | Enfoque |
|---|---|---|
| Laboratorio de gases | Macroscópico | Cilindros, émbolos, válvulas, calentadores |
| Ciclos y máquinas | Macroscópico, guiado | Ciclos en P-V, eficiencia, comparación con Carnot |
| Gas molecular | Microscópico | Presión, temperatura y distribución de velocidades desde las moléculas |
| Calor | Cuerpos con capacidad calorífica | Calorimetría, equilibrio térmico, cambio de fase |

## 4. Objetos

### Laboratorio de gases

| Objeto | Parámetros |
|---|---|
| Cilindro | sección, longitud, orientación (vertical, horizontal o inclinado un ángulo), paredes adiabáticas o conductoras |
| Recipiente rígido | volumen |
| Émbolo | masa, sección, libre o bloqueado, fricción opcional, adiabático o conductor |
| Tabique interior | fijo o móvil, conductor o aislante |
| Válvula o llave | abierta o cerrada, conductancia; acción programable |
| Atmósfera | presión exterior P0, temperatura |
| Pesa | masa sobre el émbolo; se puede poner y quitar durante la simulación |
| Resorte | k entre el émbolo y un apoyo |
| Calentador | potencia, o V y R (efecto Joule) |
| Baño térmico | temperatura fija en contacto con una pared |
| Gas | especie (monoatómico, diatómico, triatómico o γ propio), moles o masa, mezcla de especies, P y T iniciales |
| Columna de líquido | profundidad y densidad, para presión hidrostática (burbuja que sube) |
| Globo aerostático | volumen, masa de la estructura, abierto por abajo, con calentador; se eleva cuando la flotación lo permite |

### Gas molecular

| Objeto | Parámetros |
|---|---|
| Caja | dimensiones, paredes térmicas o adiabáticas |
| Especie | masa molar, radio, color, número de moléculas, diatómica o no |
| Bomba | inyecta moléculas a la temperatura elegida |
| Émbolo | masa, posición |
| Tabique con orificio o válvula | tamaño del orificio (efusión, expansión libre) |
| Calentador o enfriador | en una pared |

### Calor

Cuerpos con masa, calor específico y temperatura; contacto térmico entre
ellos; recipiente calorimétrico; cambio de fase con calor latente.

## 5. Instrumentos

- Termómetro y manómetro en cada volumen. En el gas molecular, el manómetro
  mide el impulso de los choques sobre la pared, con ventana de promedio
  ajustable.
- Medidores de calor y trabajo acumulados por tramo y por ciclo.
- Histogramas de rapidez y de energía por especie, con la curva de
  Maxwell–Boltzmann superpuesta.
- v_rms por especie, camino libre medio, contador de choques.
- Cronómetro y regla en el cilindro.

## 6. Visualizaciones

- Corte del recipiente con el gas coloreado por densidad o temperatura.
- Flechas de calor que entra y sale, y de trabajo hecho por el gas.
- Diagramas P-V, V-T y P-T que se dibujan mientras ocurre el proceso, con la
  isoterma y la adiabática de referencia que pasan por el estado actual.
- Registro Q, W, ΔU por tramo; diagrama de flujo de energía de la máquina
  (calor absorbido, trabajo, calor cedido) y eficiencia frente a la de Carnot.
- Entropía como cantidad opcional (fuera del temario, útil para ciclos).
- Gas molecular: vista 3D de la caja o proyección plana, trazas de
  moléculas marcadas.

## 7. Cantidades medibles

Por volumen: P, V, T, n por especie, U, densidad. Por proceso: Q, W, ΔU. Por
ciclo: trabajo neto, calor absorbido y cedido, eficiencia. Del émbolo:
posición, velocidad. Del gas molecular: presión medida, temperatura medida,
v_rms, energía por grado de libertad.

## 8. Escenarios incluidos

### Tutoriales
1. Ley de Boyle: compresión isotérmica en un baño térmico.
2. Ley de Charles: calentar con el émbolo libre.
3. Calentar a volumen constante.
4. Compresión adiabática.
5. Un ciclo rectangular dibujado en el diagrama P-V.
6. Gas molecular: presión y temperatura desde las moléculas.

### Ejemplos
Ciclo de Carnot; ciclo Otto; expansión libre hacia el vacío; mezcla de dos
gases a distinta temperatura; gas ligero contra gas pesado; efusión por un
orificio; émbolo con masa que oscila hasta el equilibrio; agua y metal en un
calorímetro; fusión de hielo.

### MEXT
| Tema | Escenarios |
|---|---|
| Gas ideal (T1) | 2020 P4 (globo); 2014 1-(3); 2008 1-(3) |
| Procesos (T2) | 2025 T7; 2023 1-(4); 2023 P4; 2019 P4; 2017 1-(2); 2016 1-(2); 2015 P4; 2013 1-(4); 2012 1-(3); 2010 2-B; 2009 1-(4); 2007 1-(3); 2006 P4 |
| Ciclos (T3) | 2020 1-(5); 2018 P4; 2017 P4; 2014 P4 |
| Expansión y mezcla (T4) | 2027 P4; 2016 P4; 2015 1-(3) |
| Teoría cinética (T5) | 2013 P4; 2012 P4; 2009 P4; 2008 P4; 2007 P4 |
| Calor (T6) | 2010 2-A; 2010 2-C |

## 9. Decisiones y límites

- Gas ideal en todo el módulo; sin gases reales ni cambios de fase del gas.
- La transferencia de calor dentro de un sólido (conducción 2D tipo Energy2D)
  queda como ampliación futura.
- El globo aerostático necesita acoplarse con Mecánica (movimiento vertical);
  usa el motor de cuerpos común.
