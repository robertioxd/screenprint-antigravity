"""
==========================================================================
  QUALITY BENCHMARK MODULE - Standalone Color Separation (High Fidelity)
==========================================================================
  Purpose: Gold-standard separation module for benchmarking quality.
  Replicates QualitySeparation.py quality with user-selectable colors.

  Supports:
    - .AI / .PDF  -> Poppler rasterization at configurable DPI
    - .PNG / .JPG -> Direct load with optional 2x super-sampling
    - Vector mode (hard nearest-neighbor in LAB)
    - Raster mode (soft gradient with per-color min/max range)

  Requirements:
    pip install opencv-python numpy Pillow pdf2image
    + Poppler binaries on PATH (for AI/PDF support)
==========================================================================
"""

import cv2
import numpy as np
from PIL import Image
import os
import sys
import time

# Try to import pdf2image (optional, only for AI/PDF)
try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False
    print("[WARN] pdf2image not installed. AI/PDF support disabled.")
    print("       Install with: pip install pdf2image")
    print("       Also requires Poppler: choco install poppler")


# ==========================================
#   USER CONFIGURATION
# ==========================================

CONFIG = {
    # --- Input/Output ---
    "input_file": "../ImageExample/input_AI.ai",  # Supports .ai, .pdf, .png, .jpg
    "output_dir": "quality_benchmark_output",

    # --- Resolution ---
    "target_dpi": 300,                      # DPI for AI/PDF rasterization
    "super_sample_raster": True,            # 2x upscale for PNG/JPG inputs
    
    # --- Separation Mode ---
    # "vector" = Hard nearest-neighbor (spot color, clean edges)
    # "raster" = Soft gradient (simulated process, smooth gradients)
    "separation_mode": "vector",

    # --- User Color Palette (HEX) ---
    # Define your colors. Background will be auto-detected from corners.
    # Each color can optionally have per-channel gradient range (raster mode only).
    "palette": {
        "Color_1": {
            "hex": "#ce202f",       # Red
            "range_min": 0,         # Raster mode: distance for 100% opacity
            "range_max": 60,        # Raster mode: distance for 0% opacity
            "gamma": 1.0,           # Raster mode: gradient curve
        },
        "Color_2": {
            "hex": "#282d55",       # Dark Blue
            "range_min": 0,
            "range_max": 60,
            "gamma": 1.0,
        },
        "Color_3": {
            "hex": "#e7ae3c",       # Yellow
            "range_min": 0,
            "range_max": 60,
            "gamma": 1.0,
        },
        "Color_4": {
            "hex": "#fafbfb",       # White
            "range_min": 0,
            "range_max": 60,
            "gamma": 1.0,
        },
        # Add more colors as needed...
    },

    # --- Garment Simulation ---
    # "white", "black", "color"
    "shirt_mode": "black",
    # Custom garment color (used when shirt_mode is "color")
    "garment_color_hex": "#808080",

    # --- Pre-Processing ---
    "bilateral_d": 9,
    "bilateral_sigma_color": 75,
    "bilateral_sigma_space": 75,

    # --- Post-Processing ---
    "morphology_cleanup": True,        # Elliptical open/close (3x3)
    "morphology_kernel_size": 3,       # Must be odd
    
    # --- Auto-Detect Palette (Alternative Mode) ---
    # If True, ignores "palette" and uses K-Means to auto-detect colors
    "auto_detect": False,
    "auto_detect_k": 8,                # Number of colors for K-Means
}


# ==========================================
#   CORE FUNCTIONS
# ==========================================

def hex_to_bgr(hex_color: str) -> tuple:
    """Convert HEX string to BGR tuple for OpenCV."""
    hex_color = hex_color.lstrip('#')
    r, g, b = (int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    return (b, g, r)


def hex_to_rgb(hex_color: str) -> tuple:
    """Convert HEX string to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def load_image(file_path: str, target_dpi: int, super_sample: bool) -> np.ndarray:
    """
    Load image file to numpy array (BGR).
    - AI/PDF: Uses Poppler at specified DPI
    - PNG/JPG: Direct load with optional 2x super-sampling
    
    Returns: BGR numpy array or None on failure.
    """
    ext = os.path.splitext(file_path)[1].lower()
    
    # --- Vector Files (AI/PDF) ---
    if ext in ['.ai', '.pdf']:
        if not HAS_PDF2IMAGE:
            print("ERROR: pdf2image is required for AI/PDF files.")
            return None
        
        print(f"-> Loading vector file: {file_path} at {target_dpi} DPI...")
        try:
            images = convert_from_path(file_path, dpi=target_dpi)
            if not images:
                print("ERROR: No pages found in AI/PDF file.")
                return None
            
            img_pil = images[0]  # First page/artboard
            img_np = np.array(img_pil)
            
            # Handle alpha channel
            if len(img_np.shape) == 3 and img_np.shape[2] == 4:
                img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
            else:
                img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
            
            print(f"   Rasterized at {target_dpi} DPI -> {img_bgr.shape[1]}x{img_bgr.shape[0]} px")
            return img_bgr
            
        except Exception as e:
            print(f"ERROR loading vector: {e}")
            print("Ensure Poppler is installed and on PATH.")
            return None
    
    # --- EPS Files ---
    elif ext == '.eps':
        print(f"-> Loading EPS: {file_path}...")
        try:
            img_pil = Image.open(file_path)
            img_pil.load(scale=10)
            img_np = np.array(img_pil)
            if len(img_np.shape) == 3 and img_np.shape[2] == 4:
                return cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
            else:
                return cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        except Exception as e:
            print(f"ERROR loading EPS: {e}")
            return None
    
    # --- Raster Files (PNG/JPG) ---
    elif ext in ['.png', '.jpg', '.jpeg', '.tiff', '.bmp']:
        print(f"-> Loading raster: {file_path}...")
        img = cv2.imread(file_path)
        if img is None:
            print(f"ERROR: Cannot read '{file_path}'")
            return None
        
        if super_sample:
            h, w = img.shape[:2]
            img = cv2.resize(img, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
            print(f"   Super-sampled 2x -> {img.shape[1]}x{img.shape[0]} px")
        else:
            print(f"   Loaded at native -> {img.shape[1]}x{img.shape[0]} px")
        
        return img
    
    else:
        print(f"ERROR: Unsupported format: {ext}")
        return None


def detect_background(img_bgr: np.ndarray) -> np.ndarray:
    """Detect background color from corner pixels."""
    h, w = img_bgr.shape[:2]
    corners = [
        img_bgr[0, 0],
        img_bgr[0, w - 1],
        img_bgr[h - 1, 0],
        img_bgr[h - 1, w - 1]
    ]
    return np.mean(corners, axis=0).astype(np.uint8)


def auto_detect_palette(img_bgr: np.ndarray, k: int, bg_color: np.ndarray) -> list:
    """Auto-detect palette using K-Means++ in BGR space."""
    print(f"-> Auto-detecting {k} colors with K-Means++...")
    
    data = img_bgr.reshape((-1, 3)).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.1)
    _, _, centers = cv2.kmeans(data, k + 1, None, criteria, 10, cv2.KMEANS_PP_CENTERS)
    centers = np.uint8(centers)
    
    # Convert to Lab for background identification
    centers_lab = cv2.cvtColor(np.array([centers], dtype=np.uint8), cv2.COLOR_BGR2Lab)[0].astype(float)
    bg_lab = cv2.cvtColor(np.array([[bg_color]], dtype=np.uint8), cv2.COLOR_BGR2Lab)[0][0].astype(float)
    
    # Find background cluster
    bg_dists = [np.linalg.norm(c - bg_lab) for c in centers_lab]
    bg_idx = int(np.argmin(bg_dists))
    
    # Build palette (excluding background)
    palette = []
    count = 1
    for i, center_bgr in enumerate(centers):
        if i == bg_idx:
            continue
        hex_val = '#%02x%02x%02x' % (center_bgr[2], center_bgr[1], center_bgr[0])
        palette.append({
            "name": f"Auto_{count}_{hex_val}",
            "hex": hex_val,
            "bgr": tuple(map(int, center_bgr)),
            "range_min": 0,
            "range_max": 60,
            "gamma": 1.0,
        })
        count += 1
    
    return palette


def separate_vector(img_lab: np.ndarray, palette_lab: list, bg_lab: np.ndarray) -> dict:
    """
    Vector (hard) separation: Each pixel assigned to nearest color in LAB space.
    Returns dict of color_name -> binary mask (uint8, 0 or 255).
    """
    print("-> Vector Separation (Hard Nearest-Neighbor in LAB)...")
    
    # Build distance maps for each color + background
    dist_maps = []
    for info in palette_lab:
        diff = img_lab - info['lab']
        dist_maps.append(np.linalg.norm(diff, axis=2))
    
    # Background distance
    dist_bg = np.linalg.norm(img_lab - bg_lab, axis=2)
    dist_maps.append(dist_bg)
    
    # Winner-takes-all
    dist_stack = np.dstack(dist_maps)
    labels = np.argmin(dist_stack, axis=2).astype(np.uint8)
    
    masks = {}
    for idx, info in enumerate(palette_lab):
        mask = np.where(labels == idx, 255, 0).astype(np.uint8)
        if np.sum(mask) > 0:
            masks[info['name']] = mask
    
    return masks


def separate_raster(img_lab: np.ndarray, palette_lab: list, bg_lab: np.ndarray) -> dict:
    """
    Raster (soft) separation: Per-color gradient masks with configurable range.
    Returns dict of color_name -> grayscale mask (uint8, 0-255 gradient).
    """
    print("-> Raster Separation (Soft Gradient in LAB)...")
    
    # Distance to each color
    all_dists = []
    for info in palette_lab:
        diff = img_lab - info['lab']
        all_dists.append(np.linalg.norm(diff, axis=2))
    
    # Distance to background
    dist_bg = np.linalg.norm(img_lab - bg_lab, axis=2)
    
    # Stack all distances for min calculation
    dist_stack = np.dstack(all_dists + [dist_bg])
    min_dists = np.min(dist_stack, axis=2)
    
    masks = {}
    for idx, info in enumerate(palette_lab):
        raw_d = all_dists[idx]
        rng_min = info.get('range_min', 0)
        rng_max = info.get('range_max', 60)
        gamma = info.get('gamma', 1.0)
        rng = max(rng_max - rng_min, 1.0)
        
        # Proximity: linear ramp from range_min (1.0) to range_max (0.0)
        proximity = np.clip(1.0 - (raw_d - rng_min) / rng, 0.0, 1.0)
        
        # Exclusivity: suppress colors that aren't the closest
        dist_diff = raw_d - min_dists
        dist_slope = rng * 0.5
        exclusivity = np.clip(1.0 - (dist_diff / max(dist_slope, 1.0)), 0.0, 1.0)
        
        alpha = proximity * exclusivity
        
        # Gamma correction
        if gamma != 1.0:
            alpha = np.power(alpha, gamma)
        
        # Kill near-zero noise
        alpha = np.where(alpha < 0.02, 0.0, alpha)
        
        # Subtract background
        bg_proximity = np.clip(1.0 - (dist_bg / 60.0), 0.0, 1.0)
        alpha = alpha * (1.0 - bg_proximity)
        
        mask_uint8 = (alpha * 255).astype(np.uint8)
        
        if np.any(mask_uint8):
            masks[info['name']] = mask_uint8
    
    return masks


def postprocess_mask(mask: np.ndarray, do_cleanup: bool, kernel_size: int) -> np.ndarray:
    """Apply morphological cleanup to a mask."""
    if not do_cleanup:
        return mask
    
    k = kernel_size if kernel_size % 2 == 1 else kernel_size + 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    return mask


def generate_composite(masks: dict, palette_info: list, img_shape: tuple, 
                       shirt_mode: str, garment_hex: str) -> np.ndarray:
    """Generate composite preview with alpha blending on garment background."""
    h, w = img_shape[:2]
    
    # Determine garment color
    if shirt_mode == 'white':
        bg_color = np.array([255, 255, 255], dtype=float)
    elif shirt_mode == 'black':
        bg_color = np.array([20, 20, 20], dtype=float)
    else:
        bg_color = np.array(hex_to_bgr(garment_hex), dtype=float)
    
    # Start with garment
    composite = np.full((h, w, 3), bg_color, dtype=float)
    
    # White underbase for dark garments
    needs_underbase = shirt_mode != 'white'
    if needs_underbase:
        total_ink = np.zeros((h, w), dtype=np.uint8)
        for name, mask in masks.items():
            total_ink = cv2.bitwise_or(total_ink, np.where(mask > 127, 255, 0).astype(np.uint8))
        
        # Choke the underbase slightly
        kernel_choke = np.ones((3, 3), np.uint8)
        underbase = cv2.erode(total_ink, kernel_choke, iterations=1)
        
        ub_norm = underbase.astype(float) / 255.0
        ub_layer = np.dstack([ub_norm] * 3)
        white_ink = np.array([230, 230, 230], dtype=float)
        composite = composite * (1 - ub_layer) + white_ink * ub_layer
    
    # Paint each color layer
    for info in palette_info:
        name = info['name']
        if name not in masks:
            continue
        
        mask = masks[name]
        color_bgr = np.array(info['bgr'], dtype=float)
        
        alpha = mask.astype(float) / 255.0
        alpha_layer = np.dstack([alpha] * 3)
        
        composite = composite * (1 - alpha_layer) + color_bgr * alpha_layer
    
    return composite.astype(np.uint8)


# ==========================================
#   MAIN PIPELINE
# ==========================================

def run_benchmark(config: dict):
    """Execute the full quality benchmark pipeline."""
    start_time = time.time()
    
    file_path = config["input_file"]
    output_dir = config["output_dir"]
    
    print("=" * 60)
    print("  QUALITY SEPARATION BENCHMARK")
    print("=" * 60)
    print(f"  Input:  {file_path}")
    print(f"  Output: {output_dir}/")
    print(f"  Mode:   {config['separation_mode']}")
    print(f"  DPI:    {config['target_dpi']}")
    print("=" * 60)
    
    # 1. Load Image
    img_bgr = load_image(
        file_path,
        target_dpi=config["target_dpi"],
        super_sample=config["super_sample_raster"]
    )
    
    if img_bgr is None:
        print("FATAL: Could not load image. Aborting.")
        return
    
    h, w = img_bgr.shape[:2]
    print(f"\n   Working resolution: {w}x{h} ({w*h:,} pixels)")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # 2. Pre-processing: Bilateral Filter
    print("-> Applying bilateral filter...")
    img_smooth = cv2.bilateralFilter(
        img_bgr,
        d=config["bilateral_d"],
        sigmaColor=config["bilateral_sigma_color"],
        sigmaSpace=config["bilateral_sigma_space"]
    )
    
    # 3. Convert to LAB
    img_lab = cv2.cvtColor(img_smooth, cv2.COLOR_BGR2Lab).astype(float)
    
    # 4. Detect background
    bg_color = detect_background(img_bgr)
    bg_lab = cv2.cvtColor(
        np.array([[bg_color]], dtype=np.uint8), cv2.COLOR_BGR2Lab
    )[0][0].astype(float)
    print(f"   Background detected: BGR={tuple(bg_color)}")
    
    # 5. Build palette
    if config["auto_detect"]:
        palette_info = auto_detect_palette(img_bgr, config["auto_detect_k"], bg_color)
    else:
        palette_info = []
        for name, color_cfg in config["palette"].items():
            bgr = hex_to_bgr(color_cfg["hex"])
            bgr_arr = np.uint8([[bgr]])
            lab = cv2.cvtColor(bgr_arr, cv2.COLOR_BGR2Lab)[0][0].astype(float)
            palette_info.append({
                "name": name,
                "hex": color_cfg["hex"],
                "bgr": bgr,
                "lab": lab,
                "range_min": color_cfg.get("range_min", 0),
                "range_max": color_cfg.get("range_max", 60),
                "gamma": color_cfg.get("gamma", 1.0),
            })
    
    # For auto-detect, compute LAB values
    if config["auto_detect"]:
        for info in palette_info:
            bgr_arr = np.uint8([[info["bgr"]]])
            info["lab"] = cv2.cvtColor(bgr_arr, cv2.COLOR_BGR2Lab)[0][0].astype(float)
    
    print(f"\n   Palette ({len(palette_info)} colors):")
    for info in palette_info:
        print(f"     {info['name']}: {info['hex']} -> BGR{info['bgr']}")
    
    # 6. Separation
    if config["separation_mode"] == "vector":
        masks = separate_vector(img_lab, palette_info, bg_lab)
    else:
        masks = separate_raster(img_lab, palette_info, bg_lab)
    
    # 7. Post-processing & Export Plates
    print("\n-> Exporting separation plates...")
    for info in palette_info:
        name = info['name']
        if name not in masks:
            print(f"   [SKIP] {name} (no pixels assigned)")
            continue
        
        mask = masks[name]
        mask = postprocess_mask(
            mask,
            do_cleanup=config["morphology_cleanup"],
            kernel_size=config["morphology_kernel_size"]
        )
        masks[name] = mask  # Update with cleaned version
        
        # Save as film positive (inverted: black = ink)
        plate_file = os.path.join(output_dir, f"Plate_{name}.png")
        cv2.imwrite(plate_file, 255 - mask, [cv2.IMWRITE_PNG_COMPRESSION, 0])
        
        # Also save the raw mask (white = ink density)
        mask_file = os.path.join(output_dir, f"Mask_{name}.png")
        cv2.imwrite(mask_file, mask, [cv2.IMWRITE_PNG_COMPRESSION, 0])
        
        coverage = (cv2.countNonZero(mask) / (w * h)) * 100
        print(f"   [OK] {name}: {coverage:.1f}% coverage")
    
    # 8. Generate Underbase (if dark garment)
    if config["shirt_mode"] != "white":
        total_ink = np.zeros((h, w), dtype=np.uint8)
        for name, mask in masks.items():
            total_ink = cv2.bitwise_or(total_ink, np.where(mask > 127, 255, 0).astype(np.uint8))
        
        kernel_choke = np.ones((3, 3), np.uint8)
        underbase = cv2.erode(total_ink, kernel_choke, iterations=1)
        ub_file = os.path.join(output_dir, "Plate_White_Underbase.png")
        cv2.imwrite(ub_file, 255 - underbase, [cv2.IMWRITE_PNG_COMPRESSION, 0])
        print(f"   [OK] White Underbase: {(cv2.countNonZero(underbase) / (w * h)) * 100:.1f}% coverage")
    
    # 9. Generate Composite Preview
    print("\n-> Generating composite preview...")
    composite = generate_composite(
        masks, palette_info, img_bgr.shape,
        shirt_mode=config["shirt_mode"],
        garment_hex=config["garment_color_hex"]
    )
    
    comp_file = os.path.join(output_dir, f"Composite_{config['shirt_mode']}.jpg")
    cv2.imwrite(comp_file, composite, [cv2.IMWRITE_JPEG_QUALITY, 100])
    
    # 10. Save original (rasterized) for comparison
    orig_file = os.path.join(output_dir, "Original_Rasterized.jpg")
    cv2.imwrite(orig_file, img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 100])
    
    elapsed = time.time() - start_time
    
    print("\n" + "=" * 60)
    print("  BENCHMARK COMPLETE")
    print("=" * 60)
    print(f"  Resolution:  {w}x{h} ({w*h:,} pixels)")
    print(f"  Colors:      {len(masks)} active / {len(palette_info)} defined")
    print(f"  Time:        {elapsed:.1f} seconds")
    print(f"  Output:      {os.path.abspath(output_dir)}/")
    print("=" * 60)


# ==========================================
#   ENTRY POINT
# ==========================================

if __name__ == "__main__":
    # Change to script directory so relative paths work
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    run_benchmark(CONFIG)
