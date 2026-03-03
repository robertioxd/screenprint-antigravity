# Documentación Técnica: Separation Station Pro v113

Este documento proporciona un desglose técnico profundo de la arquitectura y la lógica matemática detrás de **Separation Station Pro v113 Offline**, diseñado para desarrolladores e ingenieros de software.

## 1. Arquitectura General y Pipeline de Datos

Separation Station Pro v113 es una aplicación web del lado del cliente escrita en HTML, CSS, JavaScript estándar y WebGL2. Está diseñada para operar completamente *offline* alojando todos sus recursos y datos (ej. biblioteca Pantone) directamente de forma local o incrustada (inlined) en el archivo principal.

**Pipeline de Datos de la Aplicación:**

1. **Input e Inicialización (`loadImage`)**:
   - El usuario arrastra o sube una imagen mediante File API (`FileReader`).
   - Una vez leída, `HTMLImageElement` dibuja los datos en un `<canvas>` interno. Si la imagen excede los 2048px en cualquier eje, la imagen es automáticamente escalada manteniendo su proporción (aspect ratio).
   - Los datos de los pixeles se extraen con `getImageData()`.

2. **Extracción y Análisis de Gama (`analyzeGamut` & `iterativeFurthestPointSampling`)**:
   - El sistema hace un *down-sampling* de los pixeles usando el parámetro de usuario `sampleRes` (resolución de muestra).
   - Ignora la transparencia (alpha < 0.5).
   - Invoca el algoritmo **Iterative Furthest Point Sampling (IFPS)** para determinar dinámicamente los colores predominantes en las fronteras de la gama (gamut boundaries) en espacio de color RGB 3D.
   - Determina el color exacto y asocia los canales generados con colores estándar mediante `findClosestPantone()`.

3. **Restauración y Configuración del Estado (`state` y `initChannels`)**:
   - El estado de los colores seleccionados y sus configuraciones métricas (niveles, underbase, colinealidad, morphology, etc.) se almacenan en el super-objeto global `state` derivado de las constantes nativas de `CONFIG`.
   - Se renderiza la Interfaz de Usuario para mostrar los "Plates/Canales" detectados y el "Pair Matrix".

4. **Pipeline WebGL2 (`render()`)**:
   - Compila y sube un Quad 2D a la pantalla que mapea la topología de la textura (Imagen).
   - Se crea una sola textura (`gl.TEXTURE0`) con la imagen procesada de la memoria y un Fragment Shader toma responsabilidad. Todas las lógicas de separación, bajo-base (underbase), combinaciones (Barycentric vs IDW), Knockouts y Morphology (Choke/Spread) ocurren a nivel de GPU en un solo paso (single-pass fragment shader).

---

## 2. Detección de Colores y Algoritmos de Gama

Los algoritmos de color radican en el espacio RGB y el espacio perceptual LAB.

### Iterative Furthest Point Sampling (IFPS)
La aplicación extrae la paleta automáticamente buscando en la imagen los "extremos del cubo de color" mediante IFPS (Código JS, a partir de la línea 1963):

1. **Punto Inicial**: Calcula el color promedio (mean R, G, B) de la muestra de pixeles de entrada.
2. **Primer Extremo**: Encuentra la distancia euclidiana máxima desde ese Promedio hasta cualquier punto. El pixel ganador es el punto *A*.
3. **Iteraciones subsecuentes**: Luego busca el punto que tenga la *distancia mínima mayor* hacia cualquiera de los puntos generados previamente en el array. Para agilizar y mejorar los cálculos geométricos utiliza:
   - Para arrancar o con 1 punto: `colorDistance3D` normal.
   - Si existen 2 puntos: Usa proyecciones vectoriales calculando la distancias hacia el segmento de linea (`distanceToLineSegment()`).
   - Si existen 3 puntos: Calcula distancia geométrica hacia un triángulo plano en el espacio 3D (`distanceToTriangle()`).
   - Para más de 3: Simplifica a una lectura aproximada como `distanceToConvexHull()`.

### Conversiones Perceptuales (`rgbToLab`, `labToHex`, `findClosestPantone`)
Al escoger color, asigna un Pantone simulado calculando un mapeo RGB->XYZ->LAB a la temperatura estándar D65 (luminante de la luz del día típica). Luego utiliza las coordenadas L, A y B calculando y comparando su distancia (delta geométrico, una forma simple de Delta E (ΔE)) contra los 2000+ recursos de la variable estática JSON en memoria (`__UNOFFICIAL_PANTONE_SOLID_COATED_2024_V5__`).

---

## 3. Análisis del Fragment Shader WebGL2 (Motor de Separación)

El corazón de la extracción de placas es el WebGL2 Shader incrustado como variable string `SEPARATION_SHADER`. 

Aquí está un desglose matemático pormenorizado del cálculo de pixeles que ocurre en base por per-pixel (`main()` del shader):

### 3.1 Métrica de Distancias Euclidianas
La función `colorDistance(vec3 a, vec3 b)` se encarga directamente de cuantizar distancias de color (`sqrt(dot(d, d))`) para evaluar la discrepancia de un pixel evaluado de la muestra respecto al target de la paleta.

### 3.2 Cuantización Multi-Tier (Singles, Pairs, Triplets, Quads+)
El motor WebGL usa la distancia euclidiana para determinar el "Blend Level" correcto si este está habilitado (`u_blendEnabled`). El código descarta proyecciones si encuentra una con mejor tolerancia `err < bestError - u_blendTolerance`.

- **Singles (Spots Puros):** Se computa el canal ideal al simplemente escoger el vector o base color (nodo único) que represente la menor distancia global en la paleta vectorial en uso.
- **Pairs (Segmentos 1D/Gradients Simples):**
  Opera proyecciones entre el punto $P$ (color actual) sobre una línea desde el color de canal $A$ hasta un canal objetivo secundario $B$.
  Se usa un cálculo similar a las proporciones baricéntricas uni-dimensionales, bloqueando si la variable $t$ queda fuera del clamping [0, 1]. Define $t = dot(P - A, B - A) / dot(B - A, B - A)$.
- **Triplets (Caras del Polígono 2D):**
  Para las mezclas complejas tricolores usa verdaderas **Coordenadas Baricéntricas** (Barycentric coordinates). Descompone los vectores que apuntan de $A \rightarrow B$, de $A \rightarrow C$ y $A \rightarrow P$. Se resuelven los pesos ($b_v$, $b_w$, $b_u$) desde el determinante ($denom$) de la matriz 2x2. Evalúa si el punto cae idealmente adentro proyectando la suma de los clamps y penaliza mediante la distancia euclidiana.
- **Quads+ (Inverse Distance Weighting - IDW):**
  La coordenada baricéntrica 3D o 4D hiperespacial es prohibitivamente costosa sobre GPU si se evalúa a gran volumen. Si el pixel reporta un error > 0.05 a los métodos anteriores, el fragment transiciona a **Interpolación por Potencia Inversa Normalizada**.
  Se asignan pesos inversamente proporcionales a su distancia: $w_i = \frac{1}{(dist^3 + 0.001)}$ , sumando y normalizando al final. Esta función cónica empuja suavemente grises complejos hacia pesos relativos a los 16 canales activos.

### 3.3 Colinealidad y Matrices de Pares Bloqueados (Pair Matrix Logic)
Para evitar colores sucios u opacos en mezclas (muddiness), JS calcula previamente triangulaciones para determinar puntos colineales.
La validación (`isBetween()`) comprueba si los colores A y C poseen un eslabón B escondido trazando `A-C` midiendo distancias.
El JS manda estos Array emparejados a WebGL en forma plana (`u_blockedPairs[64]`). Cuando la cuantización del shader procesa los pares ("Pairs"), usa condicionales iterativos (`isPairBlocked()`) e interrumpe agresivamente la mezcla permitiendo de esta forma saltos de colores limpios a la placa de trama final.

### 3.4 Operadores Morfológicos (Edge Choke / Spread)
Solo afecta renders de PLATES (Salidas en Blanco/Negro), ignorando pixeles de gris mixto (`!isSolidBlack && !isSolidWhite`).
Se leen las cuatro cardinalidades ortogonales al pixel actual:
`vec2 offset` de `offset * pixelSize`. Si es el caso del **Spread** (expandir bordes de la plasta para generar Trappings), evalúa si algún vecino adyacente tiene carga "Negra" y aplica el canal negro máximo. De forma inversa el **Choke** (Ahorcar), lee blancos min-max y se evalúa usando `< 0.5`.

### 3.5 Alpha Masking Knockout
`pixelAlpha` no simplemente "vuelve a cortar" píxeles de transparencia, sino escala dinámicamente como modulador multiplicativo de la carga de las placas de color general: `weights[i] *= alphaMask;`. Con Thresholds `smoothstep(u_alphaThreshold, u_alphaThreshold + 0.1, ...)` crea drop-offs agradables (una especie de anti-aliasing sobre plasta blanca) a los bordes semi-transparentes de PNGs.

### 3.6 Generador Underbase (White Plate Substrate) - Linear Burn
La Placa de Base (Underbase Plate) no es solo un mapa invertido tradicional, sino que emula cómo tintas de cobertura reaccionan mediante sustracción en composiciones superpuestas.

Para crear la base blanca, toma el `weights` original previo al Morphology de capa individual, pero permite pasar por morfologías designadas *Únicamente* a Underbase (`u_channelChokeUB`).
**Linear Burn Logic:** 
Se acumula o resta la densidad individual (`ubWeight`). La composición inicia en 1.0 (Sin underbase, máximo negativo) y substrae el $ubWeight$. El $composite = max(0.0, composite - ubWeight)$ calcula densidades empíricas.
Finalmente, el generador invierte a `underbaseValue = 1.0 - composite`, amplificando con coeficientes `u_ubStrength`, `pow/gamma`, y recorta el threshold para asegurar blancos opacos para pantalla textil plana de fondo. Nivelaciones de Puntos Blancos y Negros (`Output Levels`) corren linear `mix(ubBlackPt, ubWhitePt)` al momento del re-clamp.
