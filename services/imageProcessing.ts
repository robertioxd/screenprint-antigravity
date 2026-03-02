import { PaletteColor, Layer, AdvancedConfig } from '../types';

let pyodide: any = null;
let pythonInitialized = false;

export const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

export const rgbToHex = (r: number, g: number, b: number): string => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

const PYTHON_SCRIPT = `
import numpy as np
from PIL import Image
from skimage import color, morphology, filters
import cv2
import math
import js
import gc

def resize_image_py(image_data, w, h, target_w, target_h):
    # OpenCV Resize is significantly faster (C++ backend)
    arr = np.array(image_data.to_py(), dtype=np.uint8).reshape(h, w, 4)
    # Remove alpha for resizing if not needed, or handle it. 
    # cv2 handles 4 channels fine.
    resized = cv2.resize(arr, (int(target_w), int(target_h)), interpolation=cv2.INTER_LANCZOS4)
    return resized.flatten()

def analyze_palette_py(image_data, width, height, k, sample_size):
    arr = np.array(image_data.to_py(), dtype=np.uint8).reshape(height, width, 4)
    
    # Filter alpha
    mask = arr[:, :, 3] > 50
    valid_pixels = arr[mask][:, :3] # Only RGB
    
    if valid_pixels.shape[0] == 0:
        return ["#000000"]
    
    # Sampling for performance
    n_pixels = valid_pixels.shape[0]
    sample_size = int(sample_size)
    if n_pixels > sample_size:
        indices = np.random.choice(n_pixels, sample_size, replace=False)
        sample = valid_pixels[indices]
    else:
        sample = valid_pixels

    # CIELAB K-Means: Cluster in perceptually uniform CIELAB space
    # This prevents RGB-space artifacts (e.g., merging visually distinct dark blues)
    sample_lab = cv2.cvtColor(sample.reshape(-1, 1, 3), cv2.COLOR_RGB2Lab).reshape(-1, 3)
    sample_float = np.float32(sample_lab)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    flags = cv2.KMEANS_PP_CENTERS # K-Means++ initialization
    compactness, labels, centers = cv2.kmeans(sample_float, int(k), None, criteria, 10, flags)
    
    # Convert LAB centroids back to RGB
    # centers are in OpenCV's 8-bit LAB format (L:0-255, a:0-255, b:0-255)
    centers_uint8 = np.clip(centers, 0, 255).astype(np.uint8).reshape(1, -1, 3)
    centers_rgb = cv2.cvtColor(centers_uint8, cv2.COLOR_Lab2RGB).reshape(-1, 3)
    
    # Sort centroids by frequency
    labels = labels.flatten()
    counts = np.bincount(labels, minlength=int(k))
    sorted_idx = np.argsort(-counts)
    sorted_centers = centers_rgb[sorted_idx]
    
    hex_colors = []
    for center in sorted_centers:
        r, g, b = np.clip(center, 0, 255).astype(np.uint8)
        hex_colors.append(f"#{r:02x}{g:02x}{b:02x}")
    
    return hex_colors

def separate_colors_py(image_data, width, height, palette_hex_list, kl, kc, kh, method, sep_type, cleanup_strength, smooth_edges, gamma_val, use_aa, aa_sigma, aa_threshold, use_adaptive, min_coverage, denoise_strength, denoise_spatial, per_channel_min_list, per_channel_max_list, per_channel_gamma_list, use_substrate_knockout, substrate_hex, substrate_threshold, use_gradient_list, use_supersampling):
    # 1. Load Data
    arr = np.array(image_data.to_py(), dtype=np.uint8).reshape(height, width, 4)
    rgb = arr[:, :, :3]
    
    # CRITICAL: Extract Source Alpha Channel for Masking
    source_alpha = arr[:, :, 3].astype(np.float32) / 255.0
    
    # Store original dimensions for supersampling downscale
    orig_width, orig_height = width, height
    
    # SuperSampling: 2x upscale for better edge quality
    if use_supersampling and sep_type == 'raster':
        rgb = cv2.resize(rgb, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC)
        source_alpha = cv2.resize(source_alpha, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC)
        height, width = rgb.shape[:2]
    
    source_alpha_flat = source_alpha.reshape(-1)
    
    # 2. Pre-processing: Bilateral Filter (OpenCV)
    if denoise_strength > 0:
        rgb = cv2.bilateralFilter(rgb, d=-1, sigmaColor=float(denoise_strength), sigmaSpace=float(denoise_spatial))

    # Flatten for separation logic
    pixels_flat = rgb.reshape(-1, 3)
    
    # 3. Prepare Palette
    palette_rgb = []
    for h_hex in palette_hex_list:
        h_hex = h_hex.lstrip('#')
        palette_rgb.append([int(h_hex[i:i+2], 16) for i in (0, 2, 4)])
    
    palette_arr_uint8 = np.array(palette_rgb, dtype=np.uint8)
    
    # 4. Color Space Conversion & Separation
    # We stick to skimage for CIEDE2000 because OpenCV lacks a configurable deltaE function in Python bindings.
    # However, we can optimize the Euclidean path using broadcasting.
    
    palette_float = palette_arr_uint8.astype(np.float32)
    
    if method == 'ciede2000':
        palette_lab = color.rgb2lab(palette_arr_uint8.reshape(1, -1, 3)).reshape(-1, 3).astype(np.float32)
    elif method == 'lab_euclidean':
        # LAB-Euclidean: faster than CIEDE2000, more perceptually accurate than RGB Euclidean
        palette_lab_cv = cv2.cvtColor(palette_arr_uint8.reshape(1, -1, 3), cv2.COLOR_RGB2Lab).reshape(-1, 3).astype(np.float32)

    # Adaptive Threshold Logic: per-color nearest-neighbor slopes
    max_dist = 60.0 
    dist_slope = 30.0
    # Per-color gradient slopes based on nearest neighbor distance (prevents bleed)
    per_color_slopes = np.full(len(palette_rgb), 30.0, dtype=np.float32)
    if sep_type == 'raster' and use_adaptive and len(palette_rgb) > 1:
        p_float_est = palette_arr_uint8.astype(np.float32)
        # Vectorized distance matrix for palette
        diff = p_float_est[:, np.newaxis, :] - p_float_est[np.newaxis, :, :]
        dists_matrix = np.sqrt(np.sum(diff**2, axis=2))
        np.fill_diagonal(dists_matrix, np.inf)
        min_dists = np.min(dists_matrix, axis=1)
        if len(min_dists) > 0:
             avg_nearest = np.mean(min_dists)
             max_dist = np.clip(avg_nearest * 0.7, 25.0, 70.0)
             dist_slope = max_dist * 0.5
             # Per-color slope: tighter for colors close to neighbors, wider for isolated colors
             for ci in range(len(palette_rgb)):
                 nn_dist = min_dists[ci]
                 per_color_slopes[ci] = np.clip(nn_dist * 0.35, 10.0, 50.0)

    # Per-channel gradient overrides
    ch_min_arr = np.array(per_channel_min_list.to_py(), dtype=np.float32) if hasattr(per_channel_min_list, 'to_py') else np.array(per_channel_min_list, dtype=np.float32)
    ch_max_arr = np.array(per_channel_max_list.to_py(), dtype=np.float32) if hasattr(per_channel_max_list, 'to_py') else np.array(per_channel_max_list, dtype=np.float32)
    ch_gamma_arr = np.array(per_channel_gamma_list.to_py(), dtype=np.float32) if hasattr(per_channel_gamma_list, 'to_py') else np.array(per_channel_gamma_list, dtype=np.float32)

    # Per-channel gradient toggle
    use_gradient = np.array(use_gradient_list.to_py(), dtype=bool) if hasattr(use_gradient_list, 'to_py') else np.array(use_gradient_list, dtype=bool)

    # Substrate knockout: precalculate ONCE (not per chunk)
    substrate_rgb = None
    substrate_mask_flat = None
    if use_substrate_knockout and substrate_hex:
        sh = substrate_hex.lstrip('#')
        substrate_rgb = np.array([int(sh[i:i+2], 16) for i in (0, 2, 4)], dtype=np.float32)
        sub_dist = np.linalg.norm(pixels_flat.astype(np.float32) - substrate_rgb, axis=1)
        substrate_mask_flat = np.clip(1.0 - (sub_dist / float(substrate_threshold)), 0.0, 1.0)

    num_pixels = pixels_flat.shape[0]
    num_colors = len(palette_rgb)
    layer_raw_values = np.zeros((num_colors, num_pixels), dtype=np.float32)
    chunk_size = 100000 
    
    for start in range(0, num_pixels, chunk_size):
        end = min(start + chunk_size, num_pixels)
        chunk_rgb = pixels_flat[start:end]
        chunk_alpha = source_alpha_flat[start:end] # Get alpha for this chunk
        
        chunk_dists = np.zeros((chunk_rgb.shape[0], num_colors), dtype=np.float32)

        if method == 'ciede2000':
            chunk_lab = color.rgb2lab(chunk_rgb.reshape(-1, 1, 3)).astype(np.float32)
            for i in range(num_colors):
                ref = palette_lab[i].reshape(1, 1, 3)
                # This is the bottleneck, but necessary for accuracy
                d = color.deltaE_ciede2000(ref, chunk_lab, kL=kl, kC=kc, kH=kh)
                chunk_dists[:, i] = d.reshape(-1)
        elif method == 'lab_euclidean':
            # LAB-Euclidean: convert chunk to LAB via OpenCV, then Euclidean distance
            chunk_lab_cv = cv2.cvtColor(chunk_rgb.reshape(-1, 1, 3), cv2.COLOR_RGB2Lab).reshape(-1, 3).astype(np.float32)
            for i in range(num_colors):
                diff = chunk_lab_cv - palette_lab_cv[i]
                chunk_dists[:, i] = np.linalg.norm(diff, axis=1)
        else:
            chunk_float = chunk_rgb.astype(np.float32)
            diff = chunk_float[:, np.newaxis, :] - palette_float[np.newaxis, :, :]
            chunk_dists = np.sqrt(np.sum(diff**2, axis=2))

        if sep_type == 'vector':
            labels = np.argmin(chunk_dists, axis=1)
            for i in range(num_colors):
                mask = (labels == i)
                alpha_mask = (chunk_alpha > 0.5)
                combined_mask = np.logical_and(mask, alpha_mask)
                layer_raw_values[i, start:end][combined_mask] = 255.0
        else:
            # Raster mode: bifurcate per color (gradient vs solid)
            labels = np.argmin(chunk_dists, axis=1)
            min_dists_flat = np.min(chunk_dists, axis=1)

            # Precompute RGB distances if gradients are used to align metric boundaries
            if np.any(use_gradient):
                chunk_float = chunk_rgb.astype(np.float32)
                diff_all_rgb = chunk_float[:, np.newaxis, :] - palette_float[np.newaxis, :, :]
                dists_all_rgb = np.linalg.norm(diff_all_rgb, axis=2)
                labels_rgb = np.argmin(dists_all_rgb, axis=1)
                min_dists_rgb = np.min(dists_all_rgb, axis=1)

            for i in range(num_colors):
                raw_d = chunk_dists[:, i]

                if use_gradient[i]:
                    # === GRADIENT MODE: RGB Euclidean within CIEDE2000 territory (Option B) ===
                    target_rgb = palette_float[i]
                    diff_rgb = chunk_rgb.astype(np.float32) - target_rgb
                    raw_d_rgb = np.linalg.norm(diff_rgb, axis=1)

                    # Defaults for RGB are wider (0-441 range) than CIEDE2000 (0-100)
                    ch_min = ch_min_arr[i] if ch_min_arr[i] >= 0 else 10.0
                    ch_max = ch_max_arr[i] if ch_max_arr[i] > 0 else 110.0
                    ch_range = max(ch_max - ch_min, 1.0)

                    alpha = np.clip(1.0 - (raw_d_rgb - ch_min) / ch_range, 0.0, 1.0)

                    # Per-channel gamma (fallback to global)
                    g_val = ch_gamma_arr[i] if ch_gamma_arr[i] > 0 else gamma_val
                    if g_val != 1.0:
                        np.power(alpha, g_val, out=alpha)
                        
                    # Soft territory: how much does this color WIN vs its closest rival in RGB space?
                    # Using RGB distances for both the ramp and the territory ensures 
                    # the boundaries perfectly match without hard edges.
                    dist_diff = dists_all_rgb[:, i] - min_dists_rgb
                    
                    # Feather Zone: smooth fade at the exact RGB boundary to prevent hard cuts.
                    # 15 RGB distance units gives a smooth micro-blend at the pixel edge.
                    feather_zone = 15.0  
                    territory_soft = np.clip(1.0 - (dist_diff / feather_zone), 0.0, 1.0)
                    
                    # The territory_soft formula handles the boundary transition up to feather_zone units outside the boundary.
                    # Do not multiply by 'labels_rgb == i' here, as that creates a hard boolean cutoff
                    # which completely nullifies the feathering effect.
                    alpha = alpha * territory_soft
                else:
                    # === SOLID MODE: Winner-takes-all binary assignment ===
                    alpha = np.where(labels == i, 1.0, 0.0).astype(np.float32)
                
                # Apply Source Alpha Mask
                alpha = alpha * chunk_alpha

                # Substrate Knockout (precalculated)
                if substrate_mask_flat is not None:
                    alpha = alpha * (1.0 - substrate_mask_flat[start:end])

                layer_raw_values[i, start:end] = alpha * 255.0

    gc.collect()

    result_layers = []
    
    # 5. Post-Processing & Morphology
    for i in range(num_colors):
        alpha_flat = layer_raw_values[i]
        alpha_channel = alpha_flat.reshape(height, width).astype(np.uint8)

        # Min Coverage Check
        if min_coverage > 0:
            nz_count = cv2.countNonZero(alpha_channel) # Faster OpenCV count
            coverage_pct = (nz_count / (width * height)) * 100.0
            if coverage_pct < min_coverage:
                 continue

        if np.any(alpha_channel):
            # FIX 2: Vector Anti-Aliasing BEFORE cleanup
            if sep_type == 'vector' and use_aa:
                blurred = cv2.GaussianBlur(alpha_channel, (0, 0), sigmaX=float(aa_sigma))
                _, alpha_channel = cv2.threshold(blurred, int(aa_threshold), 255, cv2.THRESH_BINARY)

            # FIX 1: Size-aware cleanup with connected component area filtering
            if cleanup_strength > 0:
                c_str = cleanup_strength / 3.0
                scale_factor = max(1.0, (width * height) / 2000000.0)
                morph_k = min(3 + (int(c_str) // 4) * 2, 7)
                if morph_k % 2 == 0:
                    morph_k += 1
                kernel_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (morph_k, morph_k))
                alpha_channel = cv2.morphologyEx(alpha_channel, cv2.MORPH_OPEN, kernel_small)
                alpha_channel = cv2.morphologyEx(alpha_channel, cv2.MORPH_CLOSE, kernel_small)

                if c_str >= 2:
                    min_area = int(c_str * c_str * scale_factor * 2)
                    num_labels, labels_cc, stats, _ = cv2.connectedComponentsWithStats(alpha_channel, connectivity=8)
                    for j in range(1, num_labels):
                        if stats[j, cv2.CC_STAT_AREA] < min_area:
                            alpha_channel[labels_cc == j] = 0

            # General Smoothing (Soft Edges) & Anti-Aliasing
            # Morphology hardens binary edges. We inject a minimum 3x3 blur if 
            # supersampling is active to ensure the downscale creates a smooth anti-aliased edge.
            k_size = 1
            if sep_type == 'raster' and use_supersampling:
                k_size = 3
                
            if smooth_edges > 0:
                s_edg = smooth_edges / 3.0
                computed_k = int(s_edg * 2) * 2 + 1
                k_size = max(k_size, computed_k)
                
            if k_size > 1:
                alpha_channel = cv2.GaussianBlur(alpha_channel, (k_size, k_size), 0)

            # SuperSampling downscale: return to original resolution
            if use_supersampling and sep_type == 'raster':
                alpha_channel = cv2.resize(alpha_channel, (orig_width, orig_height), interpolation=cv2.INTER_AREA)

            layer_out = np.zeros((orig_height, orig_width, 4), dtype=np.uint8)
            layer_out[:, :, 3] = alpha_channel
            result_layers.append({"index": i, "data": layer_out.flatten()})
    
    return result_layers

def apply_halftone_am_py(layer_data, width, height, lpi, angle_deg, dpi):
    # Optimizing AM Halftone calculation is hard in pure python/numpy without compiled loop, 
    # but we can try to ensure array types are optimal.
    arr = np.array(layer_data.to_py(), dtype=np.uint8).reshape(height, width, 4)
    ink_density = arr[:, :, 3].astype(np.float32) * (1.0/255.0)
    
    wavelength = float(dpi) / float(lpi)
    freq = 2.0 * math.pi / wavelength
    theta = math.radians(angle_deg)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    
    y, x = np.indices((height, width), dtype=np.float32)
    x_rot = x * cos_t - y * sin_t
    y_rot = x * sin_t + y * cos_t
    
    x_rot *= freq
    y_rot *= freq
    
    # Vectorized trig
    spot_func = (np.cos(x_rot) + np.cos(y_rot) + 2.0) / 4.0
    
    # Threshold
    halftoned = (ink_density + spot_func) > 1.0
    
    # Solid locking
    halftoned = np.logical_or(halftoned, ink_density > 0.95)
    halftoned = np.logical_and(halftoned, ink_density > 0.05)
    
    # Despeckle final halftone using OpenCV
    ht_mask = (halftoned * 255).astype(np.uint8)
    # Remove single pixel noise
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2,2))
    ht_mask = cv2.morphologyEx(ht_mask, cv2.MORPH_OPEN, kernel)
    
    out = np.zeros((height, width, 4), dtype=np.uint8)
    out[..., :3] = 255 # White
    out[..., 3] = 0    # Transparent
    
    mask_bool = ht_mask > 127
    out[mask_bool, 3] = 255 # Opaque
    out[mask_bool, :3] = 0  # Black
    
    return out.flatten()

def apply_halftone_fm_py(layer_data, width, height):
    arr = np.array(layer_data.to_py(), dtype=np.uint8).reshape(height, width, 4)
    alpha = arr[:, :, 3]
    
    # Simple error diffusion using PIL (Floyd Steinberg) is actually quite optimized in C
    # OpenCV doesn't have a direct Floyd-Steinberg function.
    grayscale_input = 255 - alpha
    img = Image.fromarray(grayscale_input, 'L')
    dithered = img.convert('1', dither=Image.FLOYDSTEINBERG)
    dithered_arr = np.array(dithered, dtype=np.uint8)
    
    out = np.zeros((height, width, 4), dtype=np.uint8)
    out[..., :3] = 255
    out[..., 3] = 0
    ink_mask = (dithered_arr == 0)
    out[ink_mask, :3] = 0; out[ink_mask, 3] = 255
    return out.flatten()

def generate_composite_py(layers_list, colors_hex, width, height, alpha):
    # Optimized composition
    composite = np.full((height, width, 3), 255.0, dtype=np.float32)
    
    for i, layer_proxy in enumerate(layers_list):
        layer_flat = np.array(layer_proxy.to_py(), dtype=np.uint8)
        layer_alpha = layer_flat.reshape(height, width, 4)[:, :, 3]
        
        # Fast skip empty layers
        if cv2.countNonZero(layer_alpha) == 0: continue
            
        effective_alpha = (layer_alpha.astype(np.float32) / 255.0) * (alpha / 255.0)
        
        hex_c = colors_hex[i].lstrip('#')
        r, g, b = [int(hex_c[i:i+2], 16) for i in (0, 2, 4)]
        color_rgb = np.array([r, g, b], dtype=np.float32)
        
        # Subtractive mixing simulation
        effective_alpha_broad = effective_alpha[:, :, np.newaxis]
        composite = composite * (1.0 - effective_alpha_broad) + color_rgb * effective_alpha_broad
        
        # Alternative multiply blend (more like ink):
        # inv_alpha = 1.0 - effective_alpha_broad
        # composite = composite * inv_alpha + (composite * (color_rgb/255.0)) * effective_alpha_broad

    composite_final = np.clip(composite, 0, 255).astype(np.uint8)
    rgba = cv2.cvtColor(composite_final, cv2.COLOR_RGB2RGBA)
    return rgba.flatten()

def refine_single_layer_py(layer_data, width, height, choke_spread, cleanup_strength, fill_holes, despeckle_area, smooth_edges):
    """Post-separation cleanup for a single layer using OpenCV.
    This allows per-channel noise removal without affecting other channels."""
    arr = np.array(layer_data.to_py(), dtype=np.uint8).reshape(height, width, 4)
    alpha_channel = arr[:, :, 3].copy()

    # Scale the UI sliders down by a factor of 3 for more granular fine-tuning
    choke_spread_v = choke_spread / 3.0
    cleanup_strength_v = cleanup_strength / 3.0
    fill_holes_v = fill_holes / 3.0
    smooth_edges_v = smooth_edges / 3.0

    # 1. Limpieza Inteligente (Morphological Open/Close) - restored
    if cleanup_strength_v > 0:
        morph_k = min(3 + (int(cleanup_strength_v) // 3) * 2, 9)
        if morph_k % 2 == 0:
            morph_k += 1
        kernel_s = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (morph_k, morph_k))
        alpha_channel = cv2.morphologyEx(alpha_channel, cv2.MORPH_OPEN, kernel_s)
        alpha_channel = cv2.morphologyEx(alpha_channel, cv2.MORPH_CLOSE, kernel_s)

    # 2. Choke/Spread (Erosion / Dilation)
    if int(choke_spread_v) != 0:
        kernel_size = abs(int(choke_spread_v)) * 2 + 1
        kernel_cs = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        if choke_spread_v > 0:
            alpha_channel = cv2.dilate(alpha_channel, kernel_cs, iterations=1)
        else:
            alpha_channel = cv2.erode(alpha_channel, kernel_cs, iterations=1)

    # 3. Fill Holes (Morphological Close)
    if fill_holes_v > 0:
        close_k = (int(fill_holes_v) * 2) + 1
        kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_k, close_k))
        alpha_channel = cv2.morphologyEx(alpha_channel, cv2.MORPH_CLOSE, kernel_close)

    # 4. Connected Component Despeckle (remove small isolated blobs)
    if despeckle_area > 0:
        # Threshold to binary for CC analysis
        _, binary = cv2.threshold(alpha_channel, 1, 255, cv2.THRESH_BINARY)
        num_labels, labels_cc, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
        for j in range(1, num_labels):
            if stats[j, cv2.CC_STAT_AREA] < int(despeckle_area):
                alpha_channel[labels_cc == j] = 0

    # 5. Gaussian Edge Smoothing
    if smooth_edges_v > 0:
        k_size_e = int(smooth_edges_v * 2) * 2 + 1
        alpha_channel = cv2.GaussianBlur(alpha_channel, (k_size_e, k_size_e), 0)

    # Rebuild the layer output
    out = np.zeros((height, width, 4), dtype=np.uint8)
    out[:, :, 3] = alpha_channel
    return out.flatten()
`;

export const initEngine = async () => {
    if (pyodide) return;
    // @ts-ignore
    pyodide = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/"
    });
    // Ensure opencv-python is loaded
    await pyodide.loadPackage(["numpy", "Pillow", "scikit-image", "opencv-python"]);
    await pyodide.runPythonAsync(PYTHON_SCRIPT);
    pythonInitialized = true;
};

export const getPyodideInfo = () => {
    if (!pyodide) return null;
    return {
        version: pyodide.version,
        packages: Object.keys(pyodide.loadedPackages)
    };
};

export const resizeImage = async (imageData: ImageData, targetW: number, targetH: number): Promise<ImageData> => {
    if (!pyodide) throw new Error("Pyodide not initialized");
    const { width, height, data } = imageData;
    const resizeImagePy = pyodide.globals.get('resize_image_py');
    const resizedProxy = await resizeImagePy(data, width, height, targetW, targetH);
    const resizedArray = resizedProxy.toJs();
    resizedProxy.destroy();
    resizeImagePy.destroy();
    return new ImageData(new Uint8ClampedArray(resizedArray), targetW, targetH);
};

export const analyzePalette = async (imageData: ImageData, numColors: number, config: AdvancedConfig): Promise<PaletteColor[]> => {
    if (!pyodide) throw new Error("Pyodide not initialized");
    const { width, height, data } = imageData;
    const analyzePalettePy = pyodide.globals.get('analyze_palette_py');
    const hexColorsProxy = await analyzePalettePy(data, width, height, numColors, config.sampleSize);
    const hexColors: string[] = hexColorsProxy.toJs();
    hexColorsProxy.destroy();
    analyzePalettePy.destroy();
    return hexColors.map((hex, i) => ({
        id: `auto-${i}-${Date.now()}`,
        hex: hex,
        rgb: hexToRgb(hex),
        locked: false
    }));
};

export const performSeparation = async (imageData: ImageData, palette: PaletteColor[], config: AdvancedConfig): Promise<Layer[]> => {
    if (!pyodide) throw new Error("Pyodide not initialized");
    const { width, height, data } = imageData;
    const paletteHex = palette.map(p => p.hex);

    const separateColorsPy = pyodide.globals.get('separate_colors_py');

    // Build per-channel gradient arrays from palette
    const perChannelMin = palette.map(p => p.gradientMin !== undefined ? p.gradientMin : -1);
    const perChannelMax = palette.map(p => p.gradientMax !== undefined ? p.gradientMax : 0);
    const perChannelGamma = palette.map(p => p.gamma !== undefined ? p.gamma : 0);
    const useGradientList = palette.map(p => !!p.useGradient);

    const layersProxy = await separateColorsPy(
        data, width, height, paletteHex,
        config.kL, config.kC, config.kH,
        config.separationMethod, config.separationType,
        config.cleanupStrength, config.smoothEdges,
        config.gamma, config.useVectorAntiAliasing,
        config.vectorAASigma, config.vectorAAThreshold,
        config.useRasterAdaptive, config.minCoverage,
        config.denoiseStrength, config.denoiseSpatial,
        perChannelMin, perChannelMax, perChannelGamma,
        config.useSubstrateKnockout, config.substrateColorHex, config.substrateThreshold,
        useGradientList, config.useSuperSampling
    );

    const layersDataMapList = layersProxy.toJs();
    layersProxy.destroy();
    separateColorsPy.destroy();

    const resultLayers: Layer[] = [];

    for (const item of layersDataMapList) {
        let index, layerDataRaw;
        if (item instanceof Map) {
            index = item.get("index");
            layerDataRaw = item.get("data");
        } else {
            index = item.index;
            layerDataRaw = item.data;
        }

        const color = palette[index];
        const layerData = new Uint8ClampedArray(layerDataRaw);
        resultLayers.push({
            id: `layer-${color.id}-${Date.now()}`,
            color: color,
            data: new ImageData(layerData, width, height),
            visible: true
        });
    }

    return resultLayers;
};

export const applyHalftone = async (imageData: ImageData, config: AdvancedConfig, channelAngle?: number): Promise<ImageData> => {
    if (!pyodide) throw new Error("Pyodide not initialized");
    const { width, height, data } = imageData;
    let resultProxy;

    if (config.halftoneType === 'am') {
        const angle = channelAngle !== undefined ? channelAngle : config.halftoneAngle;
        const applyHalftoneAmPy = pyodide.globals.get('apply_halftone_am_py');
        resultProxy = await applyHalftoneAmPy(data, width, height, config.halftoneLpi, angle, config.outputDpi);
        applyHalftoneAmPy.destroy();
    } else {
        const applyHalftoneFmPy = pyodide.globals.get('apply_halftone_fm_py');
        resultProxy = await applyHalftoneFmPy(data, width, height);
        applyHalftoneFmPy.destroy();
    }

    const resultArray = resultProxy.toJs();
    resultProxy.destroy();
    return new ImageData(new Uint8ClampedArray(resultArray), width, height);
};

export const generateComposite = async (layers: Layer[], width: number, height: number, config: AdvancedConfig): Promise<ImageData> => {
    if (!pyodide) throw new Error("Pyodide not initialized");
    if (layers.length === 0) return new ImageData(width, height);

    const visibleLayers = layers.filter(l => l.visible);
    if (visibleLayers.length === 0) return new ImageData(width, height);

    const layerDataList = visibleLayers.map(l => l.data.data);
    const colorsHex = visibleLayers.map(l => l.color.hex);

    const generateCompositePy = pyodide.globals.get('generate_composite_py');
    const compProxy = await generateCompositePy(layerDataList, colorsHex, width, height, config.inkOpacity * 255);
    const compArray = compProxy.toJs();
    compProxy.destroy();
    generateCompositePy.destroy();
    return new ImageData(new Uint8ClampedArray(compArray), width, height);
};

export const refineSingleLayer = async (
    layerData: ImageData,
    params: { chokeSpread: number; cleanupStrength: number; fillHoles: number; despeckleArea: number; smoothEdges: number }
): Promise<ImageData> => {
    if (!pyodide) throw new Error("Pyodide not initialized");
    const { width, height, data } = layerData;
    const refinePy = pyodide.globals.get('refine_single_layer_py');
    const resultProxy = await refinePy(
        data, width, height,
        params.chokeSpread, params.cleanupStrength, params.fillHoles, params.despeckleArea, params.smoothEdges
    );
    const resultArray = resultProxy.toJs();
    resultProxy.destroy();
    refinePy.destroy();
    return new ImageData(new Uint8ClampedArray(resultArray), width, height);
};

export const mergeLayersData = (base: ImageData, others: ImageData[]): ImageData => {
    const width = base.width;
    const height = base.height;
    const len = width * height * 4;
    const result = new Uint8ClampedArray(len);
    result.set(base.data);

    for (const other of others) {
        for (let i = 0; i < len; i += 4) {
            const currentA = result[i + 3];
            const otherA = other.data[i + 3];
            result[i + 3] = Math.min(255, currentA + otherA);
            result[i] = 0; result[i + 1] = 0; result[i + 2] = 0;
        }
    }
    return new ImageData(result, width, height);
};

export const createGrayscaleFromAlpha = (layer: Layer): ImageData => {
    const { width, height, data } = layer.data;
    const newBuffer = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        newBuffer[i] = a;
        newBuffer[i + 1] = a;
        newBuffer[i + 2] = a;
        newBuffer[i + 3] = 255;
    }
    return new ImageData(newBuffer, width, height);
};

export const splitByLasso = (imageData: ImageData, points: { x: number, y: number }[]): [ImageData, ImageData] => {
    const { width, height } = imageData;
    const inside = new Uint8ClampedArray(imageData.data);
    const outside = new Uint8ClampedArray(imageData.data);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("No canvas context");

    ctx.beginPath();
    if (points.length > 0) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    const maskData = ctx.getImageData(0, 0, width, height).data;

    for (let i = 0; i < maskData.length; i += 4) {
        const isInside = maskData[i] > 128;
        if (isInside) {
            outside[i + 3] = 0;
        } else {
            inside[i + 3] = 0;
        }
    }
    return [new ImageData(inside, width, height), new ImageData(outside, width, height)];
};
