import cv2
import numpy as np
import os

# ==============================================================
#   OPCIÓN C — BARYCENTRIC / INVERSE-DISTANCE WEIGHTING
#
#   Calcula cuánto "pertenece" cada pixel a cada color usando
#   pesos inversos a la distancia normalizados sobre toda la paleta.
#   No requiere calibrar min/max — el ramp surge automáticamente.
#   Un pixel rojo puro obtendrá ~0 peso para el azul.
#   Un pixel intermedio (mezcla rojo+azul) obtendrá ~0.5 para cada uno.
#
#   PARÁMETROS QUE PUEDES VARIAR:
# ==============================================================
CONFIGURACION = {
    "archivo_entrada": "ImageExample/13534.png",
    "carpeta_salida":  "out_C_Baricentrico",

    # --- COLORES DE LA PALETA ---
    "hex_blanco": "#f2f2f2",
    "hex_rojo":   "#ce202f",  # Color SÓLIDO (sin modulación IDW)
    "hex_azul":   "#282d55",  # Color BARYCENTRIC (gradiente automático)

    # -------------------------------------------------------
    # PARÁMETRO 1: POTENCIA IDW (p)   rango: 1.0 – 8.0
    #   Controla cuán rápido se concentra el peso en el color más cercano.
    #   1.0 → suave, muchos colores se mezclan (gradiente amplio)
    #   2.0 → moderado (recomendado)
    #   4.0 → agresivo, zona de transición muy estrecha
    "idw_power": 2.0,

    # PARÁMETRO 2: GAMMA (0.1 – 3.0)
    #   Forma la curva del peso resultante
    #   1.0 → lineal
    #   0.5 → realza gradientes sutiles
    "gamma_azul": 1.0,

    # PARÁMETRO 3: UMBRAL MÍNIMO (0.0 – 0.15)
    #   Los pesos menores a este valor se llevan a 0 (limpieza de ruido)
    #   0.0 → sin limpieza (puede aparecer polvo en áreas sólidas)
    #   0.05 → leve limpieza (recomendado)
    "min_weight_threshold": 0.05,

    # PARÁMETRO 4: DISTANCIA BASE
    #   "rgb" → RGB Euclidean (más rápido, escala 0-441)
    #   "lab" → LAB Euclidean (más perceptual, escala 0-~130)
    "distancia": "rgb",

    # PARÁMETRO 5: KNOCKOUT BLANCO
    "knockout_blanco": True,
    "umbral_blanco":   60,

    # PARÁMETRO 6: SUPER-MUESTREO
    "super_muestreo": True,
    # -------------------------------------------------------
}


def hex_to_bgr(hex_color):
    hex_color = hex_color.lstrip('#')
    r, g, b = (int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    return np.array([b, g, r], dtype=float)


def hex_to_rgb_arr(hex_color, dtype=np.float32):
    hex_color = hex_color.lstrip('#')
    return np.array([int(hex_color[i:i+2], 16) for i in (0, 2, 4)], dtype=dtype)


def ejecutar(config):
    img = cv2.imread(config["archivo_entrada"])
    if img is None:
        print("ERROR: No se pudo abrir la imagen.")
        return

    os.makedirs(config["carpeta_salida"], exist_ok=True)
    h, w = img.shape[:2]

    if config["super_muestreo"]:
        img = cv2.resize(img, (w*2, h*2), interpolation=cv2.INTER_CUBIC)

    h2, w2 = img.shape[:2]

    azul_rgb  = hex_to_rgb_arr(config["hex_azul"])
    rojo_rgb  = hex_to_rgb_arr(config["hex_rojo"])
    blanco_bgr = hex_to_bgr(config["hex_blanco"])

    # -------------------------
    # 1. Calcular distancias (azul y rojo en la paleta "activa")
    # -------------------------
    img_rgb = img[:, :, ::-1].astype(np.float32)
    flat_rgb = img_rgb.reshape(-1, 3)

    if config["distancia"] == "lab":
        palette_rgb_u8 = np.array([azul_rgb, rojo_rgb], dtype=np.uint8).reshape(1, 2, 3)
        palette_lab = cv2.cvtColor(palette_rgb_u8, cv2.COLOR_RGB2Lab).reshape(2, 3).astype(np.float32)
        img_lab = cv2.cvtColor(img[:, :, ::-1], cv2.COLOR_RGB2Lab).astype(np.float32)
        flat_lab = img_lab.reshape(-1, 3)
        d_azul = np.linalg.norm(flat_lab - palette_lab[0], axis=1)
        d_rojo = np.linalg.norm(flat_lab - palette_lab[1], axis=1)
    else:
        d_azul = np.linalg.norm(flat_rgb - azul_rgb, axis=1)
        d_rojo = np.linalg.norm(flat_rgb - rojo_rgb, axis=1)

    # -------------------------
    # 2. Inverse-Distance Weighting (IDW)
    #   w_i = (1/d_i)^p  /  Σ (1/d_j)^p
    # -------------------------
    p = config["idw_power"]
    eps = 1e-6

    # Para 2 colores, la fórmula simplifica a:
    inv_azul = 1.0 / (d_azul + eps) ** p
    inv_rojo = 1.0 / (d_rojo + eps) ** p
    total    = inv_azul + inv_rojo

    weight_azul = inv_azul / total  # ∈ [0, 1], 1 = pixel es exactamente el azul

    weight_azul = weight_azul.reshape(h2, w2)

    # Gamma
    weight_azul = np.power(weight_azul, config["gamma_azul"])

    # Umbral mínimo (limpia ruido en zonas sólidas)
    thr = config["min_weight_threshold"]
    weight_azul = np.where(weight_azul < thr, 0.0, weight_azul)

    # Knockout de blanco
    img_fbgr = img.astype(float)
    dist_blanco = np.linalg.norm(img_fbgr - blanco_bgr, axis=2)
    mask_papel = (dist_blanco < config["umbral_blanco"]).astype(float)

    if config["knockout_blanco"]:
        weight_azul = weight_azul * (1.0 - mask_papel)

    mask_azul = weight_azul
    mask_rojo = 1.0 - mask_papel

    # --- Exportar ---
    def guardar(mask, nombre):
        m_u8 = (mask * 255).astype(np.uint8)
        if config["super_muestreo"]:
            m_u8 = cv2.resize(m_u8, (w, h), interpolation=cv2.INTER_AREA)
        cv2.imwrite(f"{config['carpeta_salida']}/{nombre}", 255 - m_u8)
        return m_u8

    azul_u8 = guardar(mask_azul, "C_Positivo_Azul.png")
    rojo_u8 = guardar(mask_rojo, "C_Positivo_Rojo.png")

    # Composite
    fondo = np.full_like(img, [220, 220, 220])
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
    cv2.imwrite(f"{config['carpeta_salida']}/C_COMPOSITE.jpg",
                comp.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95])

    print(f"[Opción C] Listo. Revisa '{config['carpeta_salida']}'")
    print(f"  Parámetros usados:")
    print(f"    idw_power            = {config['idw_power']}")
    print(f"    gamma                = {config['gamma_azul']}")
    print(f"    min_weight_threshold = {config['min_weight_threshold']}")
    print(f"    distancia            = {config['distancia']}")


if __name__ == "__main__":
    ejecutar(CONFIGURACION)
