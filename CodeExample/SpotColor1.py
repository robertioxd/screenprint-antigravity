import cv2
import numpy as np
import os

# ==========================================
#   CONFIGURACIÓN DE ALTA FIDELIDAD
# ==========================================

CONFIGURACION = {
    # --- ARCHIVOS ---
    "archivo_entrada": "dificilon.png",
    "carpeta_salida": "separacion_alta_calidad",

    # --- 1. PRE-PROCESO (SUAVIZADO) ---
    # AJUSTE: Bajamos valores para NO perder textura.
    "filtro_d": 5,             # Antes 9. Ahora 5 para ser más local y preciso.
    "filtro_sigmaColor": 15,   # CRÍTICO: Antes 75. Bajado a 15.
                               # Esto evita el efecto "acuarela/borroso". 
                               # Mantiene la textura "grunge" nítida.
    "filtro_sigmaSpace": 75,   

    # --- 2. LIMPIEZA (DESACTIVADA) ---
    # AJUSTE: Desactivado para evitar bordes "mordidos" o pixelados.
    "usar_limpieza": False,     # Al ser False, respeta cada punto de la textura original.
    "kernel_limpieza": (1, 1),  # Irrelevante si usar_limpieza es False.

    # --- 3. PALETA DE COLORES ---
    "paleta": {
        "1_Fondo_Gris": "#dcdcdc",
        "2_Contorno_Blanco": "#fafbfb",
        "3_Sombra_Azul": "#303c47",
        "4_Texto_Amarillo": "#e7ae3c",
        "5_Linea_Roja": "#fa121a"
    }
}

# ==========================================
#   LÓGICA DEL PROGRAMA
# ==========================================

def hex_to_bgr(hex_color):
    hex_color = hex_color.lstrip('#')
    rgb = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    return (rgb[2], rgb[1], rgb[0])

def ejecutar_separacion(config):
    input_path = config["archivo_entrada"]
    output_dir = config["carpeta_salida"]
    
    print(f"--- Procesando '{input_path}' en modo Alta Calidad ---")
    img = cv2.imread(input_path)
    if img is None:
        print(f"ERROR: No se encuentra '{input_path}'.")
        return

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # 1. PRE-PROCESO SUAVE
    # Usamos un filtro muy ligero solo para quitar artefactos JPG invisibles,
    # pero manteniendo el 99% de la textura original.
    print(f"-> Aplicando micro-suavizado (Sigma: {config['filtro_sigmaColor']})...")
    img_smooth = cv2.bilateralFilter(
        img, 
        d=config["filtro_d"], 
        sigmaColor=config["filtro_sigmaColor"], 
        sigmaSpace=config["filtro_sigmaSpace"]
    )
    
    # 2. CONVERSIÓN A LAB
    # Usamos LAB porque es mejor distinguiendo tonos de gris/blanco similares
    img_lab = cv2.cvtColor(img_smooth, cv2.COLOR_BGR2Lab).astype("float32")

    palette_bgr = []
    palette_lab = []
    palette_names = []

    for name, hex_code in config["paleta"].items():
        bgr = hex_to_bgr(hex_code)
        pix_bgr = np.uint8([[bgr]])
        pix_lab = cv2.cvtColor(pix_bgr, cv2.COLOR_BGR2Lab)[0][0].astype("float32")
        
        palette_bgr.append(bgr)
        palette_lab.append(pix_lab)
        palette_names.append(name)

    palette_lab = np.array(palette_lab)
    
    # 3. SEPARACIÓN MATRICIAL
    print("-> Clasificando píxeles...")
    dist_maps = []
    for i in range(len(palette_lab)):
        dist = np.linalg.norm(img_lab - palette_lab[i], axis=2)
        dist_maps.append(dist)
    
    dist_stack = np.dstack(dist_maps)
    
    # Ganador se lleva todo (Hard Clustering)
    labels = np.argmin(dist_stack, axis=2).astype(np.uint8)

    # 4. EXPORTACIÓN
    print(f"-> Generando archivos en '{output_dir}'...")
    composite = np.zeros_like(img)
    
    for i, name in enumerate(palette_names):
        # Crear máscara
        mask = np.where(labels == i, 255, 0).astype(np.uint8)
        
        # Lógica de Limpieza Condicional
        if config["usar_limpieza"]:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, config["kernel_limpieza"])
            mask_final = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        else:
            # Si desactivamos la limpieza, la máscara pasa pura.
            # Esto garantiza que el "ruido" de la textura se conserve exacto.
            mask_final = mask
        
        # Guardar POSITIVO
        positive_img = 255 - mask_final
        filename = os.path.join(output_dir, f"Positivo_{name}.png")
        # Usamos compresión 0 en PNG para máxima calidad
        cv2.imwrite(filename, positive_img, [cv2.IMWRITE_PNG_COMPRESSION, 0])
        print(f"   [OK] {filename}")

        # Composite
        color_bgr = palette_bgr[i]
        composite[mask_final > 0] = color_bgr

    # Guardar Vista Previa con máxima calidad JPG
    comp_file = os.path.join(output_dir, "VISTA_PREVIA_HD.jpg")
    cv2.imwrite(comp_file, composite, [cv2.IMWRITE_JPEG_QUALITY, 100])
    print(f"--- LISTO: Revisa '{comp_file}' ---")

if __name__ == "__main__":
    try:
        ejecutar_separacion(CONFIGURACION)
    except Exception as e:
        print(f"Error: {e}")