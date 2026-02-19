import cv2
import numpy as np
import os

# ==========================================
#   CONFIGURACIÓN: SOFT MASKING (COMPLETO)
# ==========================================

CONFIGURACION = {
    "archivo_entrada": "13534.png",
    "carpeta_salida": "separacion_phillies_soft_final",
    
    # --- COLORES EXACTOS (HEX) ---
    "hex_blanco": "#f2f2f2",  # Papel / Camiseta
    "hex_rojo":   "#ce202f",  # Base Roja Sólida
    "hex_azul":   "#282d55",  # Textura Azul Oscura

    # --- PARÁMETROS DE SUAVIDAD (GRADIENTE) ---
    # RANGO DE CAPTURA AZUL:
    # Ajusta estos valores si quieres más o menos azul.
    # min: Distancia donde el azul es sólido (100% opacidad).
    # max: Distancia donde el azul desaparece (0% opacidad).
    # La diferencia entre min y max crea el degradado suave.
    "rango_azul_min": 10,   
    "rango_azul_max": 110,  
    
    # Ganancia del degradado (1.0 = Lineal / Natural)
    "gamma_azul": 1.0,

    # Super-muestreo (Mejora calidad de bordes)
    "super_muestreo": True
}

def hex_to_bgr(hex_color):
    """Convierte HEX a BGR para OpenCV"""
    hex_color = hex_color.lstrip('#')
    rgb = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    return (rgb[2], rgb[1], rgb[0])

def ejecutar_separacion_completa(config):
    input_path = config["archivo_entrada"]
    output_dir = config["carpeta_salida"]
    
    print(f"--- Procesando '{input_path}' (Modo: Soft Masking Completo) ---")
    img = cv2.imread(input_path)
    if img is None:
        print("Error: Imagen no encontrada. Verifica el nombre del archivo.")
        return

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # 1. UPSCALING (Calidad)
    h, w = img.shape[:2]
    if config["super_muestreo"]:
        img = cv2.resize(img, (w*2, h*2), interpolation=cv2.INTER_CUBIC)
    
    # Usamos floats para precisión matemática
    img_float = img.astype(float)
    h_proc, w_proc = img.shape[:2]

    # ---------------------------------------------------------
    # PASO 1: MÁSCARA DE PAPEL (BLANCO)
    # ---------------------------------------------------------
    print("-> Generando Máscara de Papel...")
    target_white = np.array(hex_to_bgr(config["hex_blanco"]), dtype=float)
    dist_white = np.linalg.norm(img_float - target_white, axis=2)
    
    # Corte duro para el papel (lo que es blanco, es blanco)
    mask_papel_binaria = np.where(dist_white < 60, 1.0, 0.0)

    # ---------------------------------------------------------
    # PASO 2: MÁSCARA AZUL (SUAVE / GRADIENTE)
    # ---------------------------------------------------------
    print("-> Calculando Opacidad del Azul...")
    target_blue = np.array(hex_to_bgr(config["hex_azul"]), dtype=float)
    dist_blue = np.linalg.norm(img_float - target_blue, axis=2)
    
    # Matemática de Soft Masking (Rampa lineal inversa)
    min_val = config["rango_azul_min"]
    max_val = config["rango_azul_max"]
    
    # Si la distancia es menor a min, es 1.0. Si es mayor a max, es 0.0. En medio es gradiente.
    mask_azul_soft = np.clip(1.0 - (dist_blue - min_val) / (max_val - min_val), 0.0, 1.0)
    
    # Aplicar Gamma (si se requiere ajustar intensidad)
    mask_azul_soft = np.power(mask_azul_soft, config["gamma_azul"])

    # Limpieza: El azul no puede estar donde hay papel blanco
    mask_azul_final = mask_azul_soft * (1.0 - mask_papel_binaria)

    # ---------------------------------------------------------
    # PASO 3: MÁSCARA ROJA (BASE SÓLIDA)
    # ---------------------------------------------------------
    print("-> Generando Base Roja...")
    # Todo lo que no es papel, es base roja (para soportar el azul encima)
    mask_roja_final = 1.0 - mask_papel_binaria

    # ---------------------------------------------------------
    # PASO 4: EXPORTACIÓN DE POSITIVOS
    # ---------------------------------------------------------
    print("-> Guardando Positivos...")
    
    def guardar_positivo(mask_float, nombre):
        # Convertir 0.0-1.0 a 0-255 (Enteros)
        mask_uint8 = (mask_float * 255).astype(np.uint8)
        
        # Reducir al tamaño original si hicimos upscaling
        if config["super_muestreo"]:
            out = cv2.resize(mask_uint8, (w, h), interpolation=cv2.INTER_AREA)
        else:
            out = mask_uint8
            
        # Invertir (Negro = Tinta) y Guardar
        cv2.imwrite(f"{output_dir}/{nombre}", 255 - out)
        
        # Retornamos la máscara (positiva, no invertida) para el composite
        return cv2.resize(mask_uint8, (w_proc, h_proc)) # Mantenemos tamaño procesado

    # Guardamos y obtenemos máscaras uint8
    alpha_azul = guardar_positivo(mask_azul_final, "Positivo_Azul_Grayscale.png")
    alpha_rojo = guardar_positivo(mask_roja_final, "Positivo_Rojo_Base.png")
    # El blanco es opcional, pero útil
    guardar_positivo(mask_papel_binaria, "Positivo_Blanco_Papel.png") 

    # ---------------------------------------------------------
    # PASO 5: GENERACIÓN DE COMPOSITE (VISTA PREVIA)
    # ---------------------------------------------------------
    print("-> Renderizando Composite Final (Mezcla Alpha)...")
    
    # 1. Crear Lienzo (Camiseta Gris Claro)
    # Usamos un gris muy claro (230) para simular la tela
    composite = np.full_like(img, [230, 230, 230]) 
    
    # --- CAPA 1: ROJO (BASE) ---
    color_rojo = np.array(hex_to_bgr(config["hex_rojo"]))
    
    # Normalizamos alpha rojo a 0-1
    a_red = alpha_rojo.astype(float) / 255.0
    a_red = np.dstack([a_red]*3) # Expandir a 3 canales
    
    # Mezcla: (Color * Alpha) + (Fondo * (1-Alpha))
    composite = (composite * (1.0 - a_red) + color_rojo * a_red).astype(np.uint8)
    
    # --- CAPA 2: AZUL (OVERPRINT / DETALLE) ---
    color_azul = np.array(hex_to_bgr(config["hex_azul"]))
    
    # Normalizamos alpha azul (este contiene el degradado suave)
    a_blue = alpha_azul.astype(float) / 255.0
    a_blue = np.dstack([a_blue]*3)
    
    # Mezcla: Pintamos Azul ENCIMA del resultado anterior (Rojo + Camiseta)
    # Esto crea el violeta: El azul semitransparente deja ver el rojo de abajo.
    composite = (composite * (1.0 - a_blue) + color_azul * a_blue).astype(np.uint8)

    # Guardar Resultado Final
    if config["super_muestreo"]:
        final_view = cv2.resize(composite, (w, h), interpolation=cv2.INTER_AREA)
    else:
        final_view = composite

    output_file = f"{output_dir}/VISTA_PREVIA_SOFT_FINAL.jpg"
    cv2.imwrite(output_file, final_view, [cv2.IMWRITE_JPEG_QUALITY, 100])
    
    print(f"--- LISTO. Revisa la carpeta '{output_dir}' ---")
    print(f"    1. {output_file} (Debe verse idéntica a la original)")
    print(f"    2. Positivo_Azul_Grayscale.png (Debe tener bordes grises suaves)")

if __name__ == "__main__":
    ejecutar_separacion_completa(CONFIGURACION)