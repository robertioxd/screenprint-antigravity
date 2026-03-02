import cv2
import numpy as np
import os

# ==============================================================
#   OPCIÓN B — RGB EUCLIDEAN DENTRO DE TERRITORIO CIEDE2000
#
#   El BORDERS del territorio se calcula con CIEDE2000 (preciso).
#   Dentro de ese territorio, la rampa de opacidad usa RGB Euclidean
#   (igual que SoftColor1), por lo que los sliders min/max
#   mantienen la misma escala numérica que SoftColor1.
#
#   PARÁMETROS QUE PUEDES VARIAR:
# ==============================================================
CONFIGURACION = {
    "archivo_entrada":  "ImageExample/13534.png",
    "carpeta_salida":   "out_B_RGBdentroTerritorio",

    # --- COLORES DE LA PALETA ---
    "hex_blanco": "#f2f2f2",
    "hex_rojo":   "#ce202f",  # Color SÓLIDO
    "hex_azul":   "#282d55",  # Color GRADIENTE

    # -------------------------------------------------------
    # PARÁMETRO 1: RANGO RGB PARA EL GRADIENTE
    #   min_rgb → distancia RGB donde la tinta es 100% sólida
    #   max_rgb → distancia RGB donde la tinta desaparece (0%)
    #   (Igual que en SoftColor1: min=10, max=110 recomendado)
    "min_rgb": 10,
    "max_rgb": 110,

    # PARÁMETRO 2: GAMMA (0.1 – 3.0)
    #   1.0 → lineal
    #   < 1 → eleva opacidades bajas (gradiente más visible)
    "gamma_azul": 1.0,

    # PARÁMETRO 3: MÉTODO DE TERRITORIO
    #   "rgb"    → territorio por distancia RGB (más rápido)
    #   "lab"    → territorio por distancia LAB-Euclidean (más suave)
    "metodo_territorio": "lab",

    # PARÁMETRO 4: KNOCKOUT BLANCO
    "knockout_blanco": True,
    "umbral_blanco":   60,

    # PARÁMETRO 5: SUPER-MUESTREO
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
    img_bgr = img.astype(np.float32)
    img_rgb = img_bgr[:, :, ::-1]  # BGR→RGB

    azul_rgb  = hex_to_rgb_arr(config["hex_azul"])
    rojo_rgb  = hex_to_rgb_arr(config["hex_rojo"])
    blanco_bgr = hex_to_bgr(config["hex_blanco"])

    # -------------------------
    # 1. TERRITORIO — ¿cuál color es el dueño de cada pixel?
    # -------------------------
    metodo = config["metodo_territorio"]
    if metodo == "lab":
        # Distancia LAB-Euclidean (más perceptual)
        img_lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab).astype(np.float32)
        azul_lab = cv2.cvtColor(np.array([[img_bgr[0,0][::-1].astype(np.uint8)]], dtype=np.uint8),
                                cv2.COLOR_RGB2Lab).astype(np.float32)
        # Calcula centro LAB de azul y rojo
        palette_bgr_u8 = np.array([
            hex_to_bgr(config["hex_azul"]).astype(np.uint8),
            hex_to_bgr(config["hex_rojo"]).astype(np.uint8)
        ]).reshape(1, 2, 3)
        palette_rgb_u8 = palette_bgr_u8[:, :, ::-1]
        palette_lab = cv2.cvtColor(palette_rgb_u8, cv2.COLOR_RGB2Lab).reshape(2, 3).astype(np.float32)

        flat = img_lab.reshape(-1, 3)
        d_azul_lab = np.linalg.norm(flat - palette_lab[0], axis=1).reshape(h2, w2)
        d_rojo_lab = np.linalg.norm(flat - palette_lab[1], axis=1).reshape(h2, w2)
        territorio_azul = (d_azul_lab <= d_rojo_lab)  # True donde azul gana
    else:
        # Distancia RGB Euclidean para territorio
        flat_rgb = img_rgb.reshape(-1, 3)
        d_azul_rgb_terr = np.linalg.norm(flat_rgb - azul_rgb, axis=1).reshape(h2, w2)
        d_rojo_rgb_terr = np.linalg.norm(flat_rgb - rojo_rgb, axis=1).reshape(h2, w2)
        territorio_azul = (d_azul_rgb_terr <= d_rojo_rgb_terr)

    # -------------------------
    # 2. RAMPA GRADIENTE — distancia RGB dentro del territorio
    # -------------------------
    flat_rgb = img_rgb.reshape(-1, 3)
    d_azul_rgb = np.linalg.norm(flat_rgb - azul_rgb, axis=1).reshape(h2, w2)

    mn = config["min_rgb"]
    mx = config["max_rgb"]
    rng = max(mx - mn, 1.0)

    # Rampa lineal (como SoftColor1)
    mask_azul_raw = np.clip(1.0 - (d_azul_rgb - mn) / rng, 0.0, 1.0)
    mask_azul_raw = np.power(mask_azul_raw, config["gamma_azul"])

    # Aplicar territorio: fuera del territorio azul → alpha = 0
    mask_azul = mask_azul_raw * territorio_azul.astype(np.float32)

    # Knockout de blanco
    if config["knockout_blanco"]:
        img_fbgr = img.astype(float)
        dist_blanco = np.linalg.norm(img_fbgr - blanco_bgr, axis=2)
        mask_papel = (dist_blanco < config["umbral_blanco"]).astype(float)
        mask_azul = mask_azul * (1.0 - mask_papel)

    # Máscara roja: todo lo que no es blanco
    img_fbgr = img.astype(float)
    dist_blanco = np.linalg.norm(img_fbgr - blanco_bgr, axis=2)
    mask_papel_final = (dist_blanco < config["umbral_blanco"]).astype(float)
    mask_rojo = 1.0 - mask_papel_final

    # --- Exportar ---
    def guardar(mask, nombre):
        m_u8 = (mask * 255).astype(np.uint8)
        if config["super_muestreo"]:
            m_u8 = cv2.resize(m_u8, (w, h), interpolation=cv2.INTER_AREA)
        cv2.imwrite(f"{config['carpeta_salida']}/{nombre}", 255 - m_u8)
        return m_u8

    azul_u8 = guardar(mask_azul, "B_Positivo_Azul.png")
    rojo_u8 = guardar(mask_rojo, "B_Positivo_Rojo.png")

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
    cv2.imwrite(f"{config['carpeta_salida']}/B_COMPOSITE.jpg",
                comp.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95])

    print(f"[Opción B] Listo. Revisa '{config['carpeta_salida']}'")
    print(f"  Parámetros usados:")
    print(f"    metodo_territorio = {config['metodo_territorio']}")
    print(f"    min_rgb / max_rgb = {config['min_rgb']} / {config['max_rgb']}")
    print(f"    gamma             = {config['gamma_azul']}")


if __name__ == "__main__":
    ejecutar(CONFIGURACION)
