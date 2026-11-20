// ARCHIVO GENERADO desde tokens.json. No editar a mano.
export const tokens = {
  "$descripcion": "Fuente única de los tokens de diseño de Volta. No editar tokens.css a mano: se genera con construir.mjs.",
  "color": {
    "claro": {
      "lienzo": "#FFFFFF",
      "fondo": "#F6F6F4",
      "panel": "#FAFAF8",
      "campo": "#F0F0ED",
      "campo-hover": "#E8E8E4",
      "campo-activo": "#DEDEDA",
      "linea-suave": "#E6E6E2",
      "linea": "#D3D3CE",
      "linea-fuerte": "#ABABA5",
      "texto-4": "#A8A8A2",
      "texto-3": "#6E6E68",
      "texto-2": "#4B4B47",
      "texto": "#171716",
      "tinta": "#0C0C0B",
      "sobre-tinta": "#FFFFFF",
      "error": "#C2261C",
      "aviso": "#9A6200",
      "cuadricula-menor": "#F1F1EE",
      "cuadricula-mayor": "#E2E2DE",
      "eje": "#9C9C96",
      "sombra-menu": "0 6px 24px rgb(0 0 0 / 0.08), 0 1px 2px rgb(0 0 0 / 0.04)",
      "sombra-dialogo": "0 16px 48px rgb(0 0 0 / 0.14), 0 2px 6px rgb(0 0 0 / 0.06)",
      "velo": "rgb(12 12 11 / 0.32)",
      "sombra-perilla": "0 1px 2px rgb(0 0 0 / 0.2)"
    },
    "oscuro": {
      "lienzo": "#0D0D0E",
      "fondo": "#09090A",
      "panel": "#121213",
      "campo": "#1A1A1C",
      "campo-hover": "#212124",
      "campo-activo": "#2A2A2E",
      "linea-suave": "#1F1F22",
      "linea": "#303034",
      "linea-fuerte": "#4A4A50",
      "texto-4": "#55555B",
      "texto-3": "#85858C",
      "texto-2": "#B5B5BB",
      "texto": "#EDEDEF",
      "tinta": "#FAFAFA",
      "sobre-tinta": "#0C0C0B",
      "error": "#FF6B60",
      "aviso": "#F2B33D",
      "cuadricula-menor": "#151517",
      "cuadricula-mayor": "#202023",
      "eje": "#55555B",
      "sombra-menu": "0 8px 28px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.04)",
      "sombra-dialogo": "0 20px 60px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.05)",
      "velo": "rgb(0 0 0 / 0.55)",
      "sombra-perilla": "0 1px 2px rgb(0 0 0 / 0.6)"
    }
  },
  "fisica": {
    "$descripcion": "Paleta física. Cada familia genera --f-<familia> (trazo) y --f-<familia>-tinte (relleno al 14 %).",
    "claro": {
      "movimiento": "#1D5FD6",
      "cambio": "#1C8546",
      "interaccion": "#D2382B",
      "inercia": "#7B3FD4",
      "electrico": "#A86400",
      "magnetico": "#0B8592",
      "corriente": "#C21E78",
      "termico": "#C65A0E"
    },
    "oscuro": {
      "movimiento": "#6EA1FF",
      "cambio": "#4CCB83",
      "interaccion": "#FF6B5E",
      "inercia": "#B08BFF",
      "electrico": "#F2B33D",
      "magnetico": "#3FD0DC",
      "corriente": "#FF6EBE",
      "termico": "#FF9A4D"
    },
    "tinte": 0.14
  },
  "mapas": {
    "divergente-negativo": "#2B59C3",
    "divergente-positivo": "#C8401E"
  },
  "tipografia": {
    "familias": {
      "interfaz": "\"IBM Plex Sans\", \"Segoe UI\", system-ui, sans-serif",
      "numeros": "\"IBM Plex Mono\", \"Cascadia Mono\", Consolas, monospace",
      "simbolos": "\"STIX Two Text\", \"Cambria Math\", Cambria, Georgia, serif",
      "formulas": "\"STIX Two Math\", \"Cambria Math\", serif"
    },
    "escala": {
      "micro": [
        11,
        14
      ],
      "pequeno": [
        12,
        16
      ],
      "base": [
        13,
        18
      ],
      "enfasis": [
        14,
        20
      ],
      "subtitulo": [
        16,
        22
      ],
      "titulo": [
        20,
        26
      ],
      "pantalla": [
        28,
        34
      ],
      "display": [
        44,
        48
      ]
    },
    "pesos": {
      "normal": 400,
      "medio": 500,
      "fuerte": 600
    }
  },
  "espacio": {
    "1": 4,
    "2": 8,
    "3": 12,
    "4": 16,
    "5": 20,
    "6": 24,
    "8": 32,
    "12": 48,
    "0-5": 2,
    "1-5": 6
  },
  "radio": {
    "casilla": 3,
    "control": 5,
    "tarjeta": 8,
    "dialogo": 12,
    "pildora": 999
  },
  "control": {
    "compacto": 24,
    "normal": 28,
    "grande": 32
  },
  "estructura": {
    "barra": 44,
    "panel-izq": 264,
    "panel-der": 304,
    "panel-inf": 248
  },
  "trazo": {
    "materia": 2,
    "real": 1.5,
    "previsto": 1.5,
    "auxiliar": 1,
    "cota": 1,
    "vector": 2.25,
    "componente": 1.25,
    "icono": 1.5,
    "emblema": 1.75
  },
  "lienzo": {
    "particula-radio": 6,
    "carga-radio": 9,
    "asa": 7,
    "halo": 3,
    "rayado-paso": 6,
    "rayado-profundidad": 10
  },
  "movimiento": {
    "rapido": "90ms",
    "medio": "160ms",
    "lento": "240ms",
    "curva": "cubic-bezier(0.2, 0, 0, 1)"
  },
  "acentos": {
    "$descripcion": "Color de acento de los controles (Configuración): botón principal, foco, casillas, interruptores, deslizadores. No toca el dibujo de la física.",
    "sobre": {
      "claro": "#FFFFFF",
      "oscuro": "#0C0C0B"
    },
    "colores": {
      "azul": {
        "claro": "#1D5FD6",
        "oscuro": "#6EA1FF"
      },
      "verde": {
        "claro": "#0F7B4C",
        "oscuro": "#4CCB83"
      },
      "violeta": {
        "claro": "#6A3FC9",
        "oscuro": "#A98BFF"
      },
      "ambar": {
        "claro": "#A86200",
        "oscuro": "#F2B33D"
      },
      "rojo": {
        "claro": "#C2261C",
        "oscuro": "#FF6B60"
      }
    }
  },
  "matices": {
    "$descripcion": "Matiz de las superficies (Configuración): neutro (el de siempre), cálido (papel) o frío (gris azulado).",
    "calido": {
      "claro": {
        "lienzo": "#FFFEFB",
        "fondo": "#F5F2EC",
        "panel": "#FAF8F3",
        "campo": "#EFEBE3",
        "campo-hover": "#E7E2D8",
        "campo-activo": "#DED8CB",
        "linea-suave": "#E5E0D6",
        "linea": "#D2CCC0",
        "cuadricula-menor": "#F2EFE8",
        "cuadricula-mayor": "#E3DED4"
      },
      "oscuro": {
        "lienzo": "#100F0D",
        "fondo": "#0B0A09",
        "panel": "#151412",
        "campo": "#1D1B18",
        "campo-hover": "#25221E",
        "campo-activo": "#2D2A25",
        "linea-suave": "#24211D",
        "linea": "#322E29",
        "cuadricula-menor": "#171512",
        "cuadricula-mayor": "#221F1B"
      }
    },
    "frio": {
      "claro": {
        "lienzo": "#FDFEFF",
        "fondo": "#F2F4F7",
        "panel": "#F8F9FB",
        "campo": "#ECEFF3",
        "campo-hover": "#E3E7EC",
        "campo-activo": "#D9DEE5",
        "linea-suave": "#E1E5EA",
        "linea": "#CBD1D9",
        "cuadricula-menor": "#EEF1F5",
        "cuadricula-mayor": "#DDE2E9"
      },
      "oscuro": {
        "lienzo": "#0C0E11",
        "fondo": "#080A0C",
        "panel": "#111418",
        "campo": "#191D22",
        "campo-hover": "#21262C",
        "campo-activo": "#29303A",
        "linea-suave": "#20252B",
        "linea": "#2C333B",
        "cuadricula-menor": "#13171B",
        "cuadricula-mayor": "#1D2228"
      }
    }
  }
} as const;
