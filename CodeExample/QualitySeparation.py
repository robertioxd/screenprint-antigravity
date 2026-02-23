import cv2
import numpy as np
from PIL import Image
import os
import sys
from pdf2image import convert_from_path

# NOTA: Para que esto funcione, debes tener instalado 'Ghostscript' y 'Poppler' en el sistema.

def load_vector_as_hires_array(file_path, target_dpi):
    """
    Convierte archivos vectoriales (.ai, .eps) a una matriz numpy de alta resolución.
    Mantiene la nitidez de los bordes para una separación perfecta.
    """
    print(f"-> Cargando archivo nativo: {file_path} a {target_dpi} DPI...")
    
    file_ext = os.path.splitext(file_path)[1].lower()
    img_pil = None

    try:
        # CASO A: Archivos .AI (Illustrator) o .PDF
        # Los .ai modernos son PDFs disfrazados. Usamos poppler para renderizarlos.
        if file_ext in ['.ai', '.pdf']:
            print("   Detectado formato Adobe Illustrator / PDF.")
            # Convertimos la primera página
            images = convert_from_path(file_path, dpi=target_dpi)
            if images:
                img_pil = images[0] # Tomamos la primera página/mesa de trabajo
            else:
                raise Exception("No se pudo leer el contenido del archivo AI/PDF.")

        # CASO B: Archivos .EPS (Encapsulated PostScript)
        # Usamos Pillow que delega a Ghostscript
        elif file_ext == '.eps':
            print("   Detectado formato EPS.")
            img_pil = Image.open(file_path)
            # Forzamos la carga a alta resolución escalando
            img_pil.load(scale=10) # Truco de Ghostscript para cargar con más calidad
            # Redimensionamos al DPI deseado si es necesario (simplificación)
            # En producción, se configuran parámetros de Ghostscript directamente.
        
        else:
            print(f"Error: Formato {file_ext} no soportado en el módulo vectorial.")
            return None

        # Convertir de PIL (RGB) a OpenCV (BGR)
        if img_pil:
            print("   -> Rasterización de alta fidelidad completada.")
            img_np = np.array(img_pil)
            
            # Manejo de canales (Quitar Alpha si existe, convertir a BGR)
            if img_np.shape[2] == 4:
                # Si tiene transparencia, poner fondo blanco o negro según preferencia
                # Aquí convertimos a BGR simple ignorando alpha por ahora o fusionando
                img_np = cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
            else:
                img_np = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
                
            return img_np

    except Exception as e:
        print(f"ERROR CRÍTICO al leer vector: {e}")
        print("Asegúrate de tener instalados 'Poppler' (para AI) y 'Ghostscript' (para EPS).")
        return None
def process_native_vector_file(file_path, shirt_mode, max_colors,target_dpi):
    """
    Pipeline completo para archivos nativos (.AI / .PDF):
    1. Rasterización HD -> 2. Separación -> 3. Pantallas -> 4. COMPOSITE
    """
    
    # 1. RASTERIZACIÓN DE ALTA FIDELIDAD (300 DPI)
    # Usamos la función pura que definimos antes
    high_res_img = load_vector_as_hires_array(file_path, target_dpi)
    
    if high_res_img is None:
        print("Error: No se pudo cargar el vector.")
        return

    print(f"--- Separando Vector HD ({high_res_img.shape[1]}x{high_res_img.shape[0]} px) ---")
    h, w = high_res_img.shape[:2]

    # 2. SUAVIZADO LEVE (Para eliminar anti-aliasing del renderizado)
    img_smooth = cv2.bilateralFilter(high_res_img, 9, 75, 75)

    # 3. DETECCIÓN DE COLOR (K-MEANS++)
    # Detección de fondo (esquinas)
    corners = [high_res_img[0,0], high_res_img[0, w-1], high_res_img[h-1, 0], high_res_img[h-1, w-1]]
    avg_bg_color = np.mean(corners, axis=0).astype(int)
    
    # Clustering
    data = img_smooth.reshape((-1, 3)).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.1)
    K = max_colors + 1
    _, _, centers = cv2.kmeans(data, K, None, criteria, 10, cv2.KMEANS_PP_CENTERS)
    centers = np.uint8(centers)

    # Espacio Lab para precisión
    img_lab = cv2.cvtColor(img_smooth, cv2.COLOR_BGR2Lab).astype(float)
    centers_lab = cv2.cvtColor(np.array([centers], dtype=np.uint8), cv2.COLOR_BGR2Lab)[0].astype(float)
    bg_lab = cv2.cvtColor(np.array([[avg_bg_color]], dtype=np.uint8), cv2.COLOR_BGR2Lab)[0][0].astype(float)

    # 4. IDENTIFICACIÓN DE TINTAS
    detected_colors = {}
    min_dist_bg = float('inf')
    bg_idx = -1
    
    # Encontrar índice de fondo
    for i, center in enumerate(centers_lab):
        dist = np.linalg.norm(center - bg_lab)
        if dist < min_dist_bg:
            min_dist_bg = dist
            bg_idx = i

    active_info = []
    color_count = 1
    
    for i in range(len(centers)):
        if i == bg_idx: continue
        c_bgr = centers[i]
        c_lab = centers_lab[i]
        hex_val = '#%02x%02x%02x' % (c_bgr[2], c_bgr[1], c_bgr[0])
        name = f"Tinta_{color_count}_{hex_val}"
        active_info.append({'name': name, 'lab': c_lab, 'bgr': c_bgr})
        detected_colors[name] = tuple(map(int, c_bgr))
        color_count += 1

    # 5. GENERACIÓN DE MÁSCARAS (PANTALLAS)
    print("-> Generando pantallas...")
    dist_maps = []
    for info in active_info:
        diff = img_lab - info['lab']
        dist_maps.append(np.linalg.norm(diff, axis=2))
    dist_bg = np.linalg.norm(img_lab - bg_lab, axis=2)
    dist_maps.append(dist_bg)
    
    dist_stack = np.dstack(dist_maps)
    labels = np.argmin(dist_stack, axis=2).astype(np.uint8)

    final_plates = {}
    total_ink_mask = np.zeros((h, w), dtype=np.uint8)

    for idx, info in enumerate(active_info):
        mask = np.where(labels == idx, 255, 0).astype(np.uint8)
        # Limpieza suave (Opcional en vectores, pero buena para eliminar ruido de render)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        
        if np.sum(mask) > 0:
            final_plates[info['name']] = mask
            total_ink_mask = cv2.bitwise_or(total_ink_mask, mask)
            
            # Guardar Pantalla Individual (Como JPG para visualizar)
            filename = f"Pantalla_Vector_{info['name']}.jpg"
            cv2.imwrite(filename, 255 - mask)
            print(f"   [Guardado] {filename}")

    # 6. GENERACIÓN DE BASE BLANCA (UNDERBASE)
    preview_bg_color = (0, 0, 0)
    needs_underbase = False
    
    # Lógica de Camiseta
    if shirt_mode == 'white':
        preview_bg_color = (255, 255, 255)
    elif shirt_mode == 'black':
        preview_bg_color = (20, 20, 20)
        needs_underbase = True
    else: # color
        preview_bg_color = (100, 100, 100)
        needs_underbase = True

    underbase = None
    if needs_underbase:
        # Choke suave
        kernel_choke = np.ones((3,3), np.uint8)
        underbase = cv2.erode(total_ink_mask, kernel_choke, iterations=1)
        cv2.imwrite("Pantalla_Vector_Base_Blanca.jpg", 255 - underbase)
        print("   [Guardado] Pantalla_Vector_Base_Blanca.jpg")

    # 7. GENERACIÓN DE COMPOSITE (VISTA PREVIA)
    print("-> Generando Composite Final...")
    
    # A. Crear lienzo del color de la camiseta
    composite = np.full((h, w, 3), preview_bg_color, dtype=np.uint8).astype(float)

    # B. Pintar Base Blanca (si aplica)
    if needs_underbase and underbase is not None:
        ub_norm = underbase.astype(float) / 255.0
        ub_layer = np.dstack([ub_norm]*3)
        white_ink = np.array([230, 230, 230]) # Blanco Tinta (no puro)
        
        # Mezcla Alpha: (Fondo * (1-alpha)) + (Tinta * alpha)
        composite = composite * (1 - ub_layer) + white_ink * ub_layer

    # C. Pintar Tintas de Color (En orden)
    for info in active_info:
        name = info['name']
        if name in final_plates:
            mask = final_plates[name]
            color_bgr = info['bgr']
            
            alpha = mask.astype(float) / 255.0
            alpha_layer = np.dstack([alpha]*3)
            
            composite = composite * (1 - alpha_layer) + np.array(color_bgr) * alpha_layer

    # Guardar Resultado Final
    output_preview = f"Vista_Previa_Vector_{shirt_mode}.jpg"
    cv2.imwrite(output_preview, composite.astype(np.uint8))
    print(f"--- PROCESO TERMINADO: Revisa '{output_preview}' ---")

# --- BLOQUE PRINCIPAL (SIMULACIÓN DE EJECUCIÓN) ---
if __name__ == "__main__":
    archivo_prueba = "input_AI.ai"
    process_native_vector_file(archivo_prueba, shirt_mode='black', max_colors=8,target_dpi=300)
    pass
#Con k=8 se tiene un tiempo de ejecucion de 2 minutos y 8 segundos. Aumento el doble del tiempo normal de ejecucion.