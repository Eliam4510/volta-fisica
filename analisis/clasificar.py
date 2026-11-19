# Clasifica cada reactivo de Fisica.csv por subtema. Uso: python clasificar.py ../Fisica.csv clasificacion.csv
import csv, collections, sys
sys.stdout.reconfigure(encoding="utf-8")  # la consola de Windows usa cp932
SRC = sys.argv[1]; OUT = sys.argv[2]
# Taxonomía: código -> (área, subtema)
TAX = {
 'M1': ('Mecánica', 'Cinemática 1D y gráficas v-t'),
 'M2': ('Mecánica', 'Tiro horizontal/oblicuo (con pendientes)'),
 'M3': ('Mecánica', 'Dinámica: tensiones, fricción, bloques apilados'),
 'M4': ('Mecánica', 'Energía y trayectorias restringidas (esfera, péndulo con clavo, cuerda floja)'),
 'M5': ('Mecánica', 'Momento, choques, restitución, impulso'),
 'M6': ('Mecánica', 'Movimiento circular y fuerza centrípeta'),
 'M7': ('Mecánica', 'Oscilaciones (resortes, MAS, oscilación pequeña)'),
 'M8': ('Mecánica', 'Gravitación y órbitas'),
 'M9': ('Mecánica', 'Estática del cuerpo rígido'),
 'M10': ('Mecánica', 'Fluidos (Pascal, flotación)'),
 'M11': ('Mecánica', 'Movimiento relativo'),
 'T1': ('Termodinámica', 'Gas ideal, leyes de los gases, densidad'),
 'T2': ('Termodinámica', 'Procesos y primera ley (émbolos, recipientes divididos)'),
 'T3': ('Termodinámica', 'Ciclos en diagrama P-V y eficiencia'),
 'T4': ('Termodinámica', 'Expansión libre y mezcla en recipientes conectados'),
 'T5': ('Termodinámica', 'Teoría cinética, Cv, Cp, gamma, mezclas de gases'),
 'T6': ('Termodinámica', 'Calorimetría y conversión de energía'),
 'W1': ('Ondas', 'Ondas viajeras y(x,t), longitudinales, reflexión'),
 'W2': ('Ondas', 'Ondas estacionarias (cuerdas, tubos, canales)'),
 'W3': ('Ondas', 'Efecto Doppler (viento, reflexión, pulsaciones)'),
 'W4': ('Ondas', 'Interferencia de dos fuentes'),
 'W5': ('Ondas', 'Refracción de ondas'),
 'O1': ('Óptica', 'Refracción, Snell, reflexión total, profundidad aparente'),
 'O2': ('Óptica', 'Doble rendija de Young'),
 'O3': ('Óptica', 'Película delgada'),
 'O4': ('Óptica', 'Interferómetro de Michelson'),
 'O5': ('Óptica', 'Dispersión: prisma y red de difracción'),
 'E1': ('Electromagnetismo', 'Electrostática: Coulomb, campo, potencial, trayectorias'),
 'E2': ('Electromagnetismo', 'Conductores y ley de Gauss'),
 'E3': ('Electromagnetismo', 'Capacitores (dieléctricos, conductor insertado, redes con interruptores)'),
 'E4': ('Electromagnetismo', 'Circuitos DC y RC (puentes, voltímetro, elementos no lineales)'),
 'E5': ('Electromagnetismo', 'Campo magnético de corrientes'),
 'E6': ('Electromagnetismo', 'Partículas cargadas en B y ExB'),
 'E7': ('Electromagnetismo', 'Efecto Hall'),
 'E8': ('Electromagnetismo', 'Inducción electromagnética'),
 'E9': ('Electromagnetismo', 'Circuitos LC / RLC transitorios'),
 'Q1': ('Física moderna', 'Efecto fotoeléctrico'),
 'Q2': ('Física moderna', 'Física nuclear (decaimientos, fisión)'),
}

# Problemas largos (2 a 5): todo el bloque comparte tema
BLOQ = {
 '2027': {'2': 'M5', '3': 'E1', '4': 'T4', '5': 'O2'},
 '2023': {'2': 'E3', '3': 'M8', '4': 'T2', '5': 'O2'},
 '2020': {'2': 'E1', '3': 'M7', '4': 'T1', '5': 'W3'},
 '2019': {'2': 'E9', '3': 'M2', '4': 'T2', '5': 'O3'},
 '2018': {'2': 'E8', '3': 'M8', '4': 'T3', '5': 'W1'},
 '2017': {'2': 'E3', '3': 'M4', '4': 'T3', '5': 'W4'},
 '2016': {'2': 'E6', '3': 'M3', '4': 'T4', '5': 'O1'},
 '2015': {'2': 'E8', '3': 'M7', '4': 'T2', '5': 'W2'},
 '2014': {'2': 'E7', '3': 'M4', '4': 'T3', '5': 'W3'},
 '2013': {'2': 'E3', '3': 'M9', '4': 'T5', '5': 'W3'},
 '2012': {'2': 'E8', '3': 'M4', '4': 'T5', '5': 'W3'},
 '2009': {'2': 'E6', '3': 'M4', '4': 'T5', '5': 'W3'},
 '2008': {'2': 'E1', '3': 'M7', '4': 'T5', '5': 'W2'},
 '2007': {'2': 'E3', '3': 'M9', '4': 'T5', '5': 'W3'},
 '2006': {'2': 'E4', '3': 'M4', '4': 'T2', '5': 'W3'},
}

# Problema 1 (preguntas sueltas) y exámenes con otro formato: por reactivo
ITEM = {
 '2027': {'1-(1)': 'M1', '1-(2)': 'M8', '1-(3)': 'E4', '1-(4)': 'E8', '1-(5)': 'W2'},
 '2025': {'T1': 'M1', 'T2': 'M6', 'T3': 'E8', 'T4': 'E2', 'T5': 'M2', 'T6': 'E6', 'T7': 'T2', 'T8': 'O4'},
 '2023': {'1-(1)': 'M1', '1-(2)': 'M5', '1-(3)': 'E1', '1-(4)': 'T2', '1-(5)': 'O1'},
 '2020': {'1-(1)': 'M3', '1-(2)': 'M5', '1-(3)': 'E3', '1-(4)': 'W1', '1-(5)': 'T3'},
 '2019': {'1-(1)': 'M1', '1-(2)': 'M5', '1-(3)': 'E5', '1-(4)': 'W1', '1-(5)': 'W2'},
 '2018': {'1-(1)': 'M2', '1-(2)': 'M6', '1-(3)': 'E1', '1-(4)': 'O2', '1-(5)': 'W3'},
 '2017': {'1-(1)': 'M1', '1-(2)': 'T2', '1-(3)': 'M7', '1-(4)': 'E1', '1-(5)': 'O1'},
 '2016': {'1-(1)': 'M1', '1-(2)': 'T2', '1-(3)': 'E3', '1-(4)': 'M3', '1-(5)': 'M7'},
 '2015': {'1-(1)': 'M2', '1-(2)': 'M8', '1-(3)': 'T4', '1-(4)': 'E1', '1-(5)': 'O1'},
 '2014': {'1-(1)': 'M5', '1-(2)': 'M8', '1-(3)': 'T1', '1-(4)': 'E3', '1-(5)': 'O1'},
 '2013': {'1-(1)': 'M11', '1-(2)': 'M8', '1-(3)': 'E1', '1-(4)': 'T2', '1-(5)': 'O3'},
 '2012': {'1-(1)': 'M3', '1-(2)': 'E4', '1-(3)': 'T2', '1-(4)': 'O1', '1-(5)': 'Q1'},
 '2010': {'1-A': 'M10', '1-B': 'M9', '1-C': 'M2', '1-D': 'M7', '1-E': 'M4', '1-F': 'M7', '1-G': 'M8',
          '2-A': 'T6', '2-B': 'T2', '2-C': 'T6', '3-A': 'W5', '3-B': 'W5', '3-C': 'O5',
          '4-A': 'E1', '4-B': 'E3', '4-C': 'E4', '4-D': 'E6', '4-E': 'E8', '4-F': 'E8'},
 '2009': {'1-(1)': 'M6', '1-(2)': 'M8', '1-(3)': 'E2', '1-(4)': 'T2', '1-(5)': 'O1'},
 '2008': {'1-(1)': 'M2', '1-(2)': 'E3', '1-(3)': 'T1', '1-(4)': 'W3', '1-(5)': 'Q2'},
 '2007': {'1-(1)': 'M5', '1-(2)': 'E4', '1-(3)': 'T2', '1-(4)': 'W4', '1-(5)': 'Q2'},
 '2006': {'1-(1)': 'M4', '1-(2)': 'E1', '1-(3)': 'W1', '1-(4)': 'Q2'},
}

rows = list(csv.DictReader(open(SRC, encoding='utf-8')))
out = []; miss = []
for r in rows:
    y, p = r['MEXT_Year'], r['Problem']
    code = ITEM.get(y, {}).get(p) or BLOQ.get(y, {}).get(p.split('-')[0])
    if not code:
        miss.append((y, p)); continue
    a, s = TAX[code]
    out.append((y, p, code, a, s))
print('sin clasificar:', miss)
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f)
    w.writerow(['MEXT_Year', 'Problem', 'Codigo', 'Area', 'Subtema'])
    w.writerows(out)
N = len(out)
area = collections.Counter(o[3] for o in out)
print(f'\nTOTAL {N}')
for a, c in area.most_common():
    print(f'{a:20s} {c:4d} {100*c/N:5.1f}%')
sub = collections.Counter(o[2] for o in out)
yrs = collections.defaultdict(set)
for o in out:
    yrs[o[2]].add(o[0])
print()
for c, n in sorted(sub.items(), key=lambda x: -x[1]):
    print(f'{c:4s} {n:3d} reactivos  {len(yrs[c]):2d}/17 exámenes  {TAX[c][1]}')
