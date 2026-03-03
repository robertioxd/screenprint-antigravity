"""
==========================================================================
  RESOLUTION DIAGNOSIS MODULE - DPI vs Quality Comparator
==========================================================================
  Purpose: Prove whether resolution is the root cause of quality loss 
  in the browser app vs the Python reference.

  Loads the same .ai/.pdf file at multiple DPIs (72, 150, 216, 300, 600),
  runs identical spot-color separation, and generates:
    1. Side-by-side comparison strip
    2. Per-DPI detail crops
    3. Quantitative metrics (pixel count, edge sharpness, detail survival)

  Requirements:
    pip install opencv-python numpy Pillow pdf2image
    + Poppler binaries on PATH
==========================================================================
"""

import cv2
import numpy as np
from PIL import Image
import os
import time

try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False
    print("[FATAL] pdf2image is REQUIRED for this diagnostic tool.")
    print("        pip install pdf2image + install Poppler")


# ==========================================
#   CONFIGURATION
# ==========================================

CONFIG = {
    "input_file": "../ImageExample/input_AI.ai",
    "output_dir": "resolution_diagnosis_output",
    
    # DPI levels to test
    # 72 = screen default, 150 = draft, 216 = pdf.js scale=3, 300 = print, 600 = high
    "dpi_levels": [72, 150, 216, 300, 600],
    
    # Number of colors for K-Means auto-detection at each DPI
    "k_colors": 6,
    
    # Detail crop region (relative, 0.0-1.0)
    # Adjust these to focus on a detail-rich area of your design
    "crop_region": {
        "x_start": 0.3,   # 30% from left
        "y_start": 0.3,   # 30% from top
        "width": 0.2,     # 20% of image width
        "height": 0.2,    # 20% of image height
    },
    
    # Bilateral filter params (same as QualitySeparation.py)
    "bilateral_d": 9,
    "bilateral_sigma_color": 75,
    "bilateral_sigma_space": 75,
}


# ==========================================
#   CORE FUNCTIONS
# ==========================================

def load_at_dpi(file_path: str, dpi: int) -> np.ndarray:
    """Load AI/PDF at specified DPI using Poppler."""
    if not HAS_PDF2IMAGE:
        return None
    
    try:
        images = convert_from_path(file_path, dpi=dpi)
        if not images:
            return None
        img_pil = images[0]
        img_np = np.array(img_pil)
        if len(img_np.shape) == 3 and img_np.shape[2] == 4:
            return cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
        else:
            return cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
    except Exception as e:
        print(f"   ERROR at {dpi} DPI: {e}")
        return None


def run_separation(img_bgr: np.ndarray, k: int, config: dict) -> dict:
    """Run spot-color separation (same algorithm as QualitySeparation.py)."""
    h, w = img_bgr.shape[:2]
    
    # Pre-process
    img_smooth = cv2.bilateralFilter(
        img_bgr,
        config["bilateral_d"],
        config["bilateral_sigma_color"],
        config["bilateral_sigma_space"]
    )
    
    # Detect background
    corners = [img_bgr[0, 0], img_bgr[0, w-1], img_bgr[h-1, 0], img_bgr[h-1, w-1]]
    bg_color = np.mean(corners, axis=0).astype(np.uint8)
    
    # K-Means++
    data = img_smooth.reshape((-1, 3)).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.1)
    _, labels_flat, centers = cv2.kmeans(data, k + 1, None, criteria, 10, cv2.KMEANS_PP_CENTERS)
    centers = np.uint8(centers)
    
    # LAB conversion
    img_lab = cv2.cvtColor(img_smooth, cv2.COLOR_BGR2Lab).astype(float)
    centers_lab = cv2.cvtColor(np.array([centers], dtype=np.uint8), cv2.COLOR_BGR2Lab)[0].astype(float)
    bg_lab = cv2.cvtColor(np.array([[bg_color]], dtype=np.uint8), cv2.COLOR_BGR2Lab)[0][0].astype(float)
    
    # Find background cluster
    bg_dists = [np.linalg.norm(c - bg_lab) for c in centers_lab]
    bg_idx = int(np.argmin(bg_dists))
    
    # Build active colors
    active = []
    for i in range(len(centers)):
        if i == bg_idx:
            continue
        active.append({
            'lab': centers_lab[i],
            'bgr': centers[i],
        })
    
    # Distance-based separation
    dist_maps = [np.linalg.norm(img_lab - info['lab'], axis=2) for info in active]
    dist_bg = np.linalg.norm(img_lab - bg_lab, axis=2)
    dist_maps.append(dist_bg)
    
    dist_stack = np.dstack(dist_maps)
    labels = np.argmin(dist_stack, axis=2).astype(np.uint8)
    
    # Build masks
    masks = {}
    total_ink = np.zeros((h, w), dtype=np.uint8)
    for idx, info in enumerate(active):
        mask = np.where(labels == idx, 255, 0).astype(np.uint8)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        if np.sum(mask) > 0:
            masks[f"color_{idx}"] = {
                'mask': mask,
                'bgr': info['bgr'],
            }
            total_ink = cv2.bitwise_or(total_ink, mask)
    
    # Composite on black
    composite = np.full((h, w, 3), 20, dtype=float)
    
    # Underbase
    kernel_choke = np.ones((3, 3), np.uint8)
    underbase = cv2.erode(total_ink, kernel_choke, iterations=1)
    ub_norm = underbase.astype(float) / 255.0
    ub_layer = np.dstack([ub_norm] * 3)
    composite = composite * (1 - ub_layer) + 230 * ub_layer
    
    for name, info in masks.items():
        alpha = info['mask'].astype(float) / 255.0
        alpha_layer = np.dstack([alpha] * 3)
        color_bgr = info['bgr'].astype(float)
        composite = composite * (1 - alpha_layer) + color_bgr * alpha_layer
    
    return {
        'composite': composite.astype(np.uint8),
        'masks': masks,
        'total_ink': total_ink,
        'num_colors': len(masks),
    }


def compute_edge_sharpness(mask: np.ndarray) -> float:
    """Measure edge sharpness using Laplacian variance."""
    laplacian = cv2.Laplacian(mask, cv2.CV_64F)
    return laplacian.var()


def crop_detail(img: np.ndarray, crop_cfg: dict) -> np.ndarray:
    """Crop a detail region from the image."""
    h, w = img.shape[:2]
    x1 = int(w * crop_cfg["x_start"])
    y1 = int(h * crop_cfg["y_start"])
    cw = int(w * crop_cfg["width"])
    ch = int(h * crop_cfg["height"])
    return img[y1:y1+ch, x1:x1+cw]


# ==========================================
#   MAIN DIAGNOSTIC
# ==========================================

def run_diagnosis(config: dict):
    """Execute multi-DPI resolution diagnosis."""
    
    if not HAS_PDF2IMAGE:
        print("FATAL: pdf2image required. Aborting.")
        return
    
    file_path = config["input_file"]
    output_dir = config["output_dir"]
    dpi_levels = config["dpi_levels"]
    
    print("=" * 60)
    print("  RESOLUTION DIAGNOSIS")
    print("=" * 60)
    print(f"  Input:  {file_path}")
    print(f"  DPIs:   {dpi_levels}")
    print("=" * 60)
    
    os.makedirs(output_dir, exist_ok=True)
    
    results = []
    composites = []
    detail_crops = []
    
    for dpi in dpi_levels:
        print(f"\n{'='*40}")
        print(f"  Testing {dpi} DPI")
        print(f"{'='*40}")
        
        t0 = time.time()
        
        # Load
        img = load_at_dpi(file_path, dpi)
        if img is None:
            print(f"  FAILED to load at {dpi} DPI")
            continue
        
        h, w = img.shape[:2]
        pixels = w * h
        print(f"  Resolution: {w}x{h} ({pixels:,} pixels)")
        
        # Separate
        sep_result = run_separation(img, config["k_colors"], config)
        
        elapsed = time.time() - t0
        
        # Edge sharpness metric (average across all masks)
        sharpness_scores = []
        for name, info in sep_result['masks'].items():
            score = compute_edge_sharpness(info['mask'])
            sharpness_scores.append(score)
        avg_sharpness = np.mean(sharpness_scores) if sharpness_scores else 0
        
        # Save individual composite
        comp_file = os.path.join(output_dir, f"Composite_{dpi}dpi.jpg")
        cv2.imwrite(comp_file, sep_result['composite'], [cv2.IMWRITE_JPEG_QUALITY, 100])
        
        # Save detail crop
        detail = crop_detail(sep_result['composite'], config["crop_region"])
        detail_file = os.path.join(output_dir, f"Detail_{dpi}dpi.jpg")
        cv2.imwrite(detail_file, detail, [cv2.IMWRITE_JPEG_QUALITY, 100])
        
        result = {
            'dpi': dpi,
            'width': w,
            'height': h,
            'pixels': pixels,
            'colors': sep_result['num_colors'],
            'sharpness': avg_sharpness,
            'time': elapsed,
        }
        results.append(result)
        composites.append((dpi, sep_result['composite']))
        detail_crops.append((dpi, detail))
        
        print(f"  Colors:    {result['colors']}")
        print(f"  Sharpness: {avg_sharpness:.1f}")
        print(f"  Time:      {elapsed:.1f}s")
    
    # Generate comparison strip
    print("\n-> Generating comparison strip...")
    if composites:
        # Resize all composites to same height for strip
        target_h = 600
        strip_images = []
        for dpi, comp in composites:
            h, w = comp.shape[:2]
            scale = target_h / h
            resized = cv2.resize(comp, (int(w * scale), target_h), interpolation=cv2.INTER_AREA)
            
            # Add label
            label = f"{dpi} DPI ({int(w * (dpi / max(d for d,_ in composites)))}x{int(h * (dpi / max(d for d,_ in composites)))})"
            label = f"{dpi} DPI"
            cv2.putText(resized, label, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            
            strip_images.append(resized)
        
        # Horizontal concatenation with padding
        max_h = max(img.shape[0] for img in strip_images)
        padded = []
        for img in strip_images:
            if img.shape[0] < max_h:
                pad = np.zeros((max_h - img.shape[0], img.shape[1], 3), dtype=np.uint8)
                img = np.vstack([img, pad])
            padded.append(img)
            # Add separator
            sep = np.full((max_h, 4, 3), 128, dtype=np.uint8)
            padded.append(sep)
        
        strip = np.hstack(padded[:-1])  # Remove last separator
        strip_file = os.path.join(output_dir, "COMPARISON_STRIP.jpg")
        cv2.imwrite(strip_file, strip, [cv2.IMWRITE_JPEG_QUALITY, 95])
        print(f"   [OK] {strip_file}")
    
    # Generate detail comparison strip
    if detail_crops:
        target_detail_h = 400
        detail_strip_images = []
        for dpi, detail in detail_crops:
            h, w = detail.shape[:2]
            if h == 0 or w == 0:
                continue
            scale = target_detail_h / h
            resized = cv2.resize(detail, (int(w * scale), target_detail_h), interpolation=cv2.INTER_NEAREST)
            cv2.putText(resized, f"{dpi} DPI", (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            detail_strip_images.append(resized)
        
        if detail_strip_images:
            detail_strip = np.hstack(detail_strip_images)
            detail_file = os.path.join(output_dir, "DETAIL_COMPARISON.jpg")
            cv2.imwrite(detail_file, detail_strip, [cv2.IMWRITE_JPEG_QUALITY, 95])
            print(f"   [OK] {detail_file}")
    
    # Print summary table
    print("\n" + "=" * 80)
    print("  RESULTS SUMMARY")
    print("=" * 80)
    print(f"  {'DPI':>5} | {'Resolution':>15} | {'Pixels':>12} | {'Colors':>6} | {'Sharpness':>10} | {'Time':>6}")
    print(f"  {'-'*5:>5} | {'-'*15:>15} | {'-'*12:>12} | {'-'*6:>6} | {'-'*10:>10} | {'-'*6:>6}")
    
    for r in results:
        res_str = f"{r['width']}x{r['height']}"
        print(f"  {r['dpi']:>5} | {res_str:>15} | {r['pixels']:>12,} | {r['colors']:>6} | {r['sharpness']:>10.1f} | {r['time']:>5.1f}s")
    
    # Verdict
    if len(results) >= 2:
        low_dpi = results[0]
        high_dpi = results[-1]
        pixel_ratio = high_dpi['pixels'] / max(low_dpi['pixels'], 1)
        sharp_ratio = high_dpi['sharpness'] / max(low_dpi['sharpness'], 0.001)
        
        print(f"\n  PIXEL RATIO ({high_dpi['dpi']} vs {low_dpi['dpi']} DPI): {pixel_ratio:.1f}x")
        print(f"  SHARPNESS RATIO: {sharp_ratio:.1f}x")
        
        if pixel_ratio > 5:
            print("\n  >> VERDICT: RESOLUTION IS THE ROOT CAUSE.")
            print(f"     The browser at ~216 DPI produces {(1/pixel_ratio)*100:.0f}% of the pixel data.")
            print(f"     Recommendation: Increase pdf.js scale or process server-side at {high_dpi['dpi']} DPI.")
        else:
            print("\n  >> INFO: Resolution difference is moderate.")
            print("     Other factors (rasterizer quality, filter params) may also contribute.")
    
    print("\n  Output directory:", os.path.abspath(output_dir))
    print("=" * 80)


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    run_diagnosis(CONFIG)
