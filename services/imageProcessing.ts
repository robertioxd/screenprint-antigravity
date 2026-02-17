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

    # OpenCV K-Means (Much faster and robust than manual numpy implementation)
    sample_float = np.float32(sample)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    flags = cv2.KMEANS_PP_CENTERS # K-Means++ initialization
    compactness, labels, centers = cv2.kmeans(sample_float, int(k), None, criteria, 10, flags)
    
    # Sort centroids by frequency (simulated)
    # OpenCV kmeans doesn't return counts, so we do a quick count on labels
    labels = labels.flatten()
    counts = np.bincount(labels, minlength=int(k))
    sorted_idx = np.argsort(-counts)
    sorted_centers = centers[sorted_idx]
    
    hex_colors = []
    for center in sorted_centers:
        r, g, b = np.clip(center, 0, 255).astype(np.uint8)
        hex_colors.append(f"#{r:02x}{g:02x}{b:02x}")
    
    return hex_colors

def separate_colors_py(image_data, width, height, palette_hex_list, kl, kc, kh, method, sep_type, cleanup_strength, smooth_edges, gamma_val, use_aa, aa_sigma, aa_threshold, use_adaptive, min_coverage, denoise_strength, denoise_spatial):
    # 1. Load Data
    arr = np.array(image_data.to_py(), dtype=np.uint8).reshape(height, width, 4)
    rgb = arr[:, :, :3]
    
    # CRITICAL: Extract Source Alpha Channel for Masking
    # Normalize alpha to 0.0 - 1.0 range to use as a multiplier later
    source_alpha = arr[:, :, 3].astype(np.float32) / 255.0
    source_alpha_flat = source_alpha.reshape(-1)
    
    # 2. Pre-processing: Bilateral Filter (OpenCV)
    # Preserves edges while removing noise. Critical for Simulated Process.
    if denoise_strength > 0:
        # cv2.bilateralFilter parameters: src, d, sigmaColor, sigmaSpace
        # d = Diameter of pixel neighborhood. -1 calculates from sigmaSpace.
        # sigmaColor: Filter sigma in the color space.
        # sigmaSpace: Filter sigma in the coordinate space.
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
    
    if method == 'ciede2000':
        palette_lab = color.rgb2lab(palette_arr_uint8.reshape(1, -1, 3)).reshape(-1, 3).astype(np.float32)
    else:
        palette_float = palette_arr_uint8.astype(np.float32)

    # Adaptive Threshold Logic
    max_dist = 60.0 
    dist_slope = 30.0
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
        else:
            chunk_float = chunk_rgb.astype(np.float32)
            diff = chunk_float[:, np.newaxis, :] - palette_float[np.newaxis, :, :]
            chunk_dists = np.sqrt(np.sum(diff**2, axis=2))

        if sep_type == 'vector':
            labels = np.argmin(chunk_dists, axis=1)
            for i in range(num_colors):
                mask = (labels == i)
                # Apply source alpha to vector selection (if transparent, it's 0)
                # We use > 0.5 threshold for alpha in vector mode
                alpha_mask = (chunk_alpha > 0.5)
                combined_mask = np.logical_and(mask, alpha_mask)
                layer_raw_values[i, start:end][combined_mask] = 255.0
        else:
            min_dists = np.min(chunk_dists, axis=1, keepdims=True)
            for i in range(num_colors):
                raw_d = chunk_dists[:, i]
                min_d = min_dists[:, 0]
                proximity = 1.0 - (raw_d / max_dist)
                np.clip(proximity, 0, 1, out=proximity)
                dist_diff = raw_d - min_d
                exclusivity = 1.0 - (dist_diff / dist_slope)
                np.clip(exclusivity, 0, 1, out=exclusivity)
                alpha = proximity * exclusivity
                if gamma_val != 1.0:
                    np.power(alpha, gamma_val, out=alpha)
                
                # CRITICAL: Apply Source Alpha Mask
                # If the original pixel was transparent, the ink amount is multiplied by 0
                alpha = alpha * chunk_alpha

                # Hard clip for printing cleanliness
                alpha[alpha < 0.05] = 0.0
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
            # Cleanup (Morphology)
            if cleanup_strength > 0:
                # Use OpenCV morphology for speed
                scale_factor = max(1.0, (width * height) / 2000000.0)
                # Remove small noise (Opening)
                kernel_size = int((cleanup_strength ** 0.5) * scale_factor) + 1
                if kernel_size > 1:
                    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
                    # Open = Erosion followed by Dilation (removes noise)
                    alpha_channel = cv2.morphologyEx(alpha_channel, cv2.MORPH_OPEN, kernel)
                    # Close = Dilation followed by Erosion (fills holes)
                    alpha_channel = cv2.morphologyEx(alpha_channel, cv2.MORPH_CLOSE, kernel)

            # Vector Anti-Aliasing (Optimized)
            if sep_type == 'vector' and use_aa:
                # Gaussian Blur using OpenCV
                blurred = cv2.GaussianBlur(alpha_channel, (0, 0), sigmaX=float(aa_sigma))
                # Threshold
                _, alpha_channel = cv2.threshold(blurred, int(aa_threshold), 255, cv2.THRESH_BINARY)

            # General Smoothing (Soft Edges)
            if smooth_edges > 0:
                k_size = int(smooth_edges * 2) * 2 + 1 # Must be odd
                alpha_channel = cv2.GaussianBlur(alpha_channel, (k_size, k_size), 0)

            layer_out = np.zeros((height, width, 4), dtype=np.uint8)
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
    const layersProxy = await separateColorsPy(
        data, width, height, paletteHex, 
        config.kL, config.kC, config.kH, 
        config.separationMethod, config.separationType, 
        config.cleanupStrength, config.smoothEdges, 
        config.gamma, config.useVectorAntiAliasing,
        config.vectorAASigma, config.vectorAAThreshold,
        config.useRasterAdaptive, config.minCoverage,
        config.denoiseStrength, config.denoiseSpatial
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

export const applyHalftone = async (imageData: ImageData, config: AdvancedConfig): Promise<ImageData> => {
     if (!pyodide) throw new Error("Pyodide not initialized");
     const { width, height, data } = imageData;
     let resultProxy;
     
     if (config.halftoneType === 'am') {
         const applyHalftoneAmPy = pyodide.globals.get('apply_halftone_am_py');
         resultProxy = await applyHalftoneAmPy(data, width, height, config.halftoneLpi, config.halftoneAngle, config.outputDpi);
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
            result[i] = 0; result[i+1] = 0; result[i+2] = 0;
        }
    }
    return new ImageData(result, width, height);
};

export const createGrayscaleFromAlpha = (layer: Layer): ImageData => {
    const { width, height, data } = layer.data;
    const newBuffer = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i+3];
        newBuffer[i] = a;
        newBuffer[i+1] = a;
        newBuffer[i+2] = a;
        newBuffer[i+3] = 255;
    }
    return new ImageData(newBuffer, width, height);
};

export const splitByLasso = (imageData: ImageData, points: {x: number, y: number}[]): [ImageData, ImageData] => {
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
            outside[i+3] = 0; 
        } else {
            inside[i+3] = 0;
        }
    }
    return [new ImageData(inside, width, height), new ImageData(outside, width, height)];
};
