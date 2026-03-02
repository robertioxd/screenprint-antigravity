# CodigosGradiente — Scripts de prueba

Ejecuta cada script en la terminal desde **esta carpeta** con:
```
python GradienteA_DominanceRatio.py
python GradienteB_RGBdentroTerritorio.py
python GradienteC_Baricentrico.py
```

Cada script genera una subcarpeta con los positivos y un **COMPOSITE** de vista previa.

---

## Parámetros por script

### A — Dominance Ratio
| Parámetro | Rango | Efecto |
|---|---|---|
| `dominance_threshold` | 0.0 – 0.9 | Amplitud de la zona de transición |
| `gamma_azul` | 0.1 – 3.0 | Forma de la curva |

### B — RGB dentro de Territorio (Recomendado)
| Parámetro | Rango | Efecto |
|---|---|---|
| `min_rgb` | 0 – 100 | Distancia donde la tinta ya es 100% sólida |
| `max_rgb` | 10 – 200 | Distancia donde la tinta desaparece |
| `gamma_azul` | 0.1 – 3.0 | Forma de la curva |
| `metodo_territorio` | `"rgb"` / `"lab"` | Cómo se calculan los bordes de zona |

### C — Barycéntrico (IDW)
| Parámetro | Rango | Efecto |
|---|---|---|
| `idw_power` | 1.0 – 8.0 | A mayor valor = transición más estrecha |
| `gamma_azul` | 0.1 – 3.0 | Forma de la curva |
| `min_weight_threshold` | 0.0 – 0.15 | Limpia ruido en áreas sólidas |
| `distancia` | `"rgb"` / `"lab"` | Métrica de distancia base |
