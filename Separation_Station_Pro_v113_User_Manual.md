# Manual de Usuario y Workflow: Separation Station Pro v113

Este documento instruye y explica de manera práctica y digerible las mejores directrices, conceptos y uso a aplicar en el taller de imprenta (serigrafía y estampados textiles) para sacar el máximo potencial a su procesador de separación de color **Separation Station Pro v113**.

---

## 1. El Flujo de Trabajo a Prueba a de Balas

El panel de la izquierda está configurado paso a paso para llevar de manera segura tu arte original a planchas viables (separaciones limpias) listas para quemar o revelar mayas/bastidores.

### PASO 1: Ingresar Original (Input)
Usa el área donde dice **Arrastrar y Soltar Diseño**.
*Nota Práctica:* Cargar gráficos a resolución real a 300DPI ayudará con los resultados, aunque el programa está diseñado para lidiar con diseños hasta 2048px localmente.

### PASO 2: ¿Cuántos Canales/Colores deseas? (How Many Colors?)
Esta es la cantidad de colores *activos* dinámicos que se extraerán sobre la base y el blanco/negro de registro.
1. Selecciona la cuenta (`3 Colors`, `4 Colors`, `+9 Colors`).
2. Presiona de Inmediato **"Auto-Detect & Generate Info" (Hit Auto)**.
👉 En este momento, el motor escanea los colores principales en tu diseño de los vértices mas predominantes y los indexa junto con su color directo análogo, por ejemplo: código "PANTONE 186 C", listos en el panel de canales del lado derecho de tu pantalla!

### PASO 3: Ajustes Generales (Tuning) y Nivelación de Salidas
Aquí cambias y ajustas la simulación y comportamiento químico del motor. Todos los cambios que hagas aquí se pre-visualizan en el instante. No olvides seleccionar o modificar en la paleta el color del Sustrato (La Camisa) antes de tocar este paso.

---

## 2. Entendiendo tus Herramientas de Ajuste de Salida

### Modo de Fusión: "Blend Levels" (Tensionando los Gradiantes)
Aquí determinas cuántas combinaciones usar (mezcla tricomías y cuatricomías) o mantener los registros planos para evitar acumulación excesiva (dot gain/muddiness) en las mayas.
- **Singles:** Si tu arte es estilo retro/cómic y sólo requiere platas fijas y planas, sólo activa Singles.
- **Pairs:** Fundamental para crear sombreados simples (Ej. un naranja suave que transita de amarillo a rojo).
- **Triplets y Quads+:** Habilitan algoritmos visualmente suaves para gradientes fotográficos complejos, ideal en Serigrafía Simulada para halftones que requieren degradados finos de mezclas profundas fotorealistas.
*Tolerancias:* Bajar la tolerancia obliga al programa ser "más estricto" y dejar más blancos, mientras subirlas suaviza las mezclas.

### "Smooth vs. Spot Solid Graphic" (Hardness/Dureza)
Esta herramienta es oro para el taller:
* Poner a lo bajo del control genera bordes ultra suaves con un anti-aliasing impecable para fotografías y mallas finas de medios tonos (Halftones > 60-70 LPI).
* Subir este control empuja el diseño simulado generalizado a Plastas Vectoriales y Sólidas (Colores Spot). Se recomienda usar en impresiones deportivas, números, ilustraciones cómicas y vectores duros donde no hay sombras, ya que vuelve tu arte en colores duros exactos.

### Alpha Knockout / Corte Alpha
Si envias un logo en .PNG que incluye zonas traslúcidas de borde duro y lo quieres estampar en ropa. Al subir el "Strength", se eliminarán inteligentemente estas transparencias y se mezclarán gradualmente con la tela base (Background/Sustrato).
* Threshold ayuda en cortes duros y a deshacerse de bordes fantasmas oscuros del anti-aliasing en bordes transparentes.

---

## 3. Preparando La Underbase (Placa/Base Blanca)
Este es probablemente el canal más importante en estampados sobre algodón o ropa de color u oscura para mantener la vida del color base y tacto suave de tu prenda (“Soft Hand Feel”).  

La app te permite:
- **Strength (Poder):** Control global. Disminuir la cantidad permite "quemar o morder" camisas negras mejor.
- **Output Levels (White Pt. / Black Pt.):** Si la bajo-base queda 100% como plasta (solida de principio a final) tu prenda final es rígida, pesada en sudor, con textura gruesa sintética (como calcomanía/parches transferidos). Limitar o bajar los limites y "White Point", deja "puntos abiertos" o perforados en el blanco, permitiendo a la remera o playera de algodón respirar y los colores de arriba adherirse firmemente sin colapsar.

---

## 4. Pair Matrix (Evitar Colores Mezclados Sucios)
**¿Qué Problema Resuelve?**  
Imagina en tu diseño que tienes colores Rosa oscuro, magenta pálido o Azul cielo y Azul marino sólido, y en las colisiones o difuminados estos grises crean una mancha sucia ("muddy", verde olivo o colores pantanosos intermedios indeseables).
La **Matriz de Pares Detecta Automáticamente** combinaciones problemáticas donde colores interponibles que arruinarian tus tramas al interceptar ("Ej. No mezcles Rojo con Amarillo si ya tenemos la capa Naranja a lado de éste").

- Las casillas mostradas están "Checadas o Tildadas" en rojo indicando Combinaciones Estrictamente Prohibidas en prensa.
- El Botón *Auto-Detect* detecta posibles riesgos, pero si por motivos creativos tú quieres combinar Verde con Naranja para probar las tramas puedes Tildarlo de regreso a Verde (Permitido). 

---

## 5. Modificadores de Capas Individuales (Choke & Spread) - En la barra de capas y Platado

Cuando vas a la vista de Placas Individuales (`View: Separation Plates`) y pre-visualizas la placa de tinta negra pura en positivo:
- **Spread:** (Engorde) Dilata los bordes vectorizados o duros generados en el arte original sumando 1 pixel de tinta afuera, logrando el conocido "Trapping" y previniendo los aborrecidos "bordes blancos del fondo" que suceden si el carrusel serigráfico pierde el registro en décimas de mm a altas velocidades de rotativa. O los movimientos de tela.
- **Choke:** Lo contrario a Spread, "ahorca" las orillas finas. Típicamente usado y muy aconsejable exclusivamente en tu **Placa/Malla de Bajo Base**. Esta acción esconde el marco del Underbase siempre a un nivel dentro y por el filo exacto de ser atrapado y expuesto visiblemente afuera del diseño superior si llega a colapsar el calce.

---

## 6. Exportar e Imprimir
Puedes visualizar tus Positivos en película de pre-prensa visualizándolos en negro.
1. Presiona `Export Separations & Standalone HTML`.
2. Las cajas con `Reg Marks` permiten dibujar automáticamente en la placa las "Cruces de Registro del Impresor" al tiro y a la medida. Estas te ayudan en el revelado del marco de seda.
3. Puedes guardarlos individualmente, listos para tu Software de RIPeo de Halftone! (como AccuRIP o Photoshop con modo Bitmap). Y el resultado será lo que el taller imprime!
