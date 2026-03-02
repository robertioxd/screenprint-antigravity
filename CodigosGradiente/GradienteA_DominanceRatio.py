import cv2
import numpy as np
import os

# ==============================================================
#   OPCIÓN A — DOMINANCE RATIO (Ratio de Dominancia)
#
#   El gradiente depende de cuánto DOMINA este color vs su rival
#   más cercano. Funcionea con cualquier métrica de distancia.
#   No requiere calibrar min/max manualmente.
#
#   PARÁMETROS QUE PUEDES VARIAR:
# ==============================================================
CONFIGURACION = {
    "archivo_entrada": "ImageExample/13534.png",
    "carpeta_salida":  "out_A_DominanceRatio",

    # --- COLORES DE LA PALETA (HEX) ---
    "hex_blanco": "#f2f2f2",  # Papel / camiseta (knockout)
    "hex_rojo":   "#ce202f",  # Color SÓLIDO (no gradiente)
    "hex_azul":   "#282d55",  # Color GRADIENTE

    # -------------------------------------------------------
    # PARÁMETRO 1: THRESHOLD DE DOMINANCIA (0.0 - 1.0)
    #   Define qué tan amplia es la zona de transición.
    #   0.0 → todo es transición (gradiente muy suave, puede dar bleed)
    #   0.5 → zona moderada (recomendado)
    #   0.9 → zona muy estrecha (casi hard-edge)
    "dominance_threshold": 0.30,

    # PARÁMETRO 2: GAMMA (0.1 - 3.0)
    #   < 1.0 → transición se hace más visible (sube opacidades bajas)
    #   1.0   → lineal
    #   > 1.0 → transición se hace más oscura/estrecha
    "gamma_azul": 1.0,

    # PARÁMETRO 3: KNOCKOUT BLANCO (True/False)
    #   True  → elimina el azul donde hay papel blanco
    "knockout_blanco": True,
    "umbral_blanco":   60,    # Distancia euclidiana para clasificar como blanco

    # PARÁMETRO 4: SUPER-MUESTREO (True/False)
    #   True  → escala imagen al doble antes de procesar (mejora bordes)
    "super_muestreo": True,
    # -------------------------------------------------------
}


def hex_to_bgr(hex_color):
    hex_color = hex_color.lstrip('#')
    r, g, b = (int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    return np.array([b, g, r], dtype=float)


def ejecutar(config):
    img = cv2.imread(config["archivo_entrada"])
    if img is None:
        print("ERROR: No se pudo abrir la imagen.")
        return

    os.makedirs(config["carpeta_salida"], exist_ok=True)
    h, w = img.shape[:2]

    if config["super_muestreo"]:
        img = cv2.resize(img, (w*2, h*2), interpolation=cv2.INTER_CUBIC)

    img_f = img.astype(float)
    h2, w2 = img_f.shape[:2]

    # --- Colores objetivo ---
    azul_bgr   = hex_to_bgr(config["hex_azul"])
    rojo_bgr   = hex_to_bgr(config["hex_rojo"])
    blanco_bgr = hex_to_bgr(config["hex_blanco"])

    # --- Distancias euclidianas ---
    dist_azul   = np.linalg.norm(img_f - azul_bgr,   axis=2)
    dist_rojo   = np.linalg.norm(img_f - rojo_bgr,   axis=2)
    dist_blanco = np.linalg.norm(img_f - blanco_bgr, axis=2)

    # -----------------------------------------------------------
    # CORE A: Dominance Ratio
    #   rivalry_gap ∈ [−1, 1]:
    #     > 0 → azul domina sobre rojo
    #     = 0 → empate (zona de transición pura)
    #     < 0 → rojo domina sobre azul
    #
    #   Fórmula: (d_rival − d_i) / (d_rival + d_i + ε)
    # -----------------------------------------------------------
    eps = 1e-6
    rivalry_gap = (dist_rojo - dist_azul) / (dist_rojo + dist_azul + eps)

    # Normalizo: mapeo [threshold, 1.0] → [0, 1]
    t = config["dominance_threshold"]
    mask_azul = np.clip((rivalry_gap - (-t)) / (1.0 - (-t)), 0.0, 1.0)

    # Gamma
    mask_azul = np.power(mask_azul, config["gamma_azul"])

    # Knockout de blanco
    if config["knockout_blanco"]:
        mask_papel = (dist_blanco < config["umbral_blanco"]).astype(float)
        mask_azul = mask_azul * (1.0 - mask_papel)

    # Máscara roja: todo lo que no es blanco
    mask_papel_final = (dist_blanco < config["umbral_blanco"]).astype(float)
    mask_rojo = 1.0 - mask_papel_final

    # --- Exportar positivos ---
    def guardar(mask, nombre):
        m_u8 = (mask * 255).astype(np.uint8)
        if config["super_muestreo"]:
            m_u8 = cv2.resize(m_u8, (w, h), interpolation=cv2.INTER_AREA)
        cv2.imwrite(f"{config['carpeta_salida']}/{nombre}", 255 - m_u8)
        return m_u8

    azul_u8 = guardar(mask_azul, "A_Positivo_Azul.png")
    rojo_u8 = guardar(mask_rojo, "A_Positivo_Rojo.png")

    # --- Composite ---
    fondo = np.full_like(img, [220, 220, 220])  # camiseta gris
    color_rojo = hex_to_bgr(config["hex_rojo"]).astype(np.uint8)
    color_azul = hex_to_bgr(config["hex_azul"]).astype(np.uint8)

    if config["super_muestreo"]:
        rojo_full = cv2.resize(rojo_u8, (w2, h2))
        azul_full = cv2.resize(azul_u8, (w2, h2))
    else:
        rojo_full, azul_full = rojo_u8, azul_u8

    a_r = np.dstack([rojo_full / 255.0]*3)
    a_b = np.dstack([azul_full / 255.0]*3)
    comp = (fondo * (1 - a_r) + color_rojo * a_r).clip(0, 255)
    comp = (comp  * (1 - a_b) + color_azul * a_b).clip(0, 255)

    if config["super_muestreo"]:
        comp = cv2.resize(comp.astype(np.uint8), (w, h), interpolation=cv2.INTER_AREA)
    cv2.imwrite(f"{config['carpeta_salida']}/A_COMPOSITE.jpg",
                comp.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95])

    print(f"[Opción A] Listo. Revisa '{config['carpeta_salida']}'")
    print(f"  Parámetros usados:")
    print(f"    dominance_threshold = {config['dominance_threshold']}")
    print(f"    gamma               = {config['gamma_azul']}")


if __name__ == "__main__":
    ejecutar(CONFIGURACION)
