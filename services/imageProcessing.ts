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
from PIL import Image, ImageDraw
from skimage import color, morphology, filters
import math
import js
import gc

def resize_image_py(image_data, w, h, target_w, target_h):
    # Use uint8 directly to save memory during conversion
    arr = np.array(image_data.to_py(), dtype=np.uint8).reshape(h, w, 4)
    img = Image.fromarray(arr)
    
    # Lanczos is high quality but expensive. 
    # Since we are reducing size usually, it is worth it, but we can optimize data flow.
    img_resized = img.resize((int(target_w), int(target_h)), Image.Resampling.LANCZOS)
    
    resized_arr = np.array(img_resized)
    return resized_arr.flatten()

def analyze_palette_py(image_data, width, height, k, sample_size):
    # Reshape as view to avoid copy if possible, otherwise efficient copy
    arr = np.array(image_data.to_py(), dtype=np.uint8).reshape(height, width, 4)
    pixels = arr.reshape(-1, 4)
    
    # Fast filtering using boolean indexing
    mask = pixels[:, 3] > 50
    valid_pixels = pixels[mask]
    
    if valid_pixels.shape[0] == 0:
        return ["#000000"]
    
    # Sampling
    n_pixels = valid_pixels.shape[0]
    sample_size = int(sample_size)
    if n_pixels > sample_size:
        indices = np.random.choice(n_pixels, sample_size, replace=False)
        sample = valid_pixels[indices, :3]
    else:
        sample = valid_pixels[:, :3]
    
    # Convert to Float32 for KMeans speed (lower precision is fine for palette)
    sample_float = sample.astype(np.float32) / 255.0
    sample_lab = color.rgb2lab(sample_float.reshape(1, -1, 3)).reshape(-1, 3).astype(np.float32)
    
    # Custom K-Means implementation optimized for Float32
    n_samples = sample_lab.shape[0]
    k = min(int(k), n_samples)
    
    init_indices = np.random.choice(n_samples, k, replace=False)
    centroids = sample_lab[init_indices]
    
    for _ in range(10): # Reduced iterations from 15 to 10 for speed
        diff = sample_lab[:, np.newaxis, :] - centroids[np.newaxis, :, :]
        dist_sq = np.sum(diff**2, axis=2)
        labels = np.argmin(dist_sq, axis=1)
        
        new_centroids = np.zeros_like(centroids)
        for i in range(k):
            mask_c = (labels == i)
            if np.any(mask_c):
                new_centroids[i] = np.mean(sample_lab[mask_c], axis=0)
            else:
                new_centroids[i] = sample_lab[np.random.choice(n_samples)]
        
        if np.allclose(centroids, new_centroids, atol=0.1):
            break
        centroids = new_centroids
    
    # Final assignment
    diff = sample_lab[:, np.newaxis, :] - centroids[np.newaxis, :, :]
    dist_sq = np.sum(diff**2, axis=2)
    final_labels = np.argmin(dist_sq, axis=1)
    
    counts = np.bincount(final_labels, minlength=k)
    sorted_idx = np.argsort(-counts)
    sorted_centroids = centroids[sorted_idx]
    
    # Convert back
    rgb_centroids = color.lab2rgb(sorted_centroids.reshape(1, -1, 3).astype(np.float64)).reshape(-1, 3)
    rgb_centroids = np.clip(rgb_centroids, 0, 1)
    u8_centroids = (rgb_centroids * 255).astype(np.uint8)
    
    hex_colors = []
    for i in range(k):
        r, g, b = u8_centroids[i]
        hex_colors.append(f"#{r:02x}{g:02x}{b:02x}")
    
    return hex_colors

def separate_colors_py(image_data, width, height, palette_hex_list, kl, kc, kh, method, sep_type, cleanup_strength, smooth_edges, gamma_val, use_aa, use_adaptive, min_coverage):
    # Optimize input loading: Use uint8 directly
    arr = np.array(image_data.to_py(), dtype=np.uint8)
    pixels = arr.reshape(-1, 4)
    rgb = pixels[:, :3] 
    
    palette_rgb = []
    for h_hex in palette_hex_list:
        h_hex = h_hex.lstrip('#')
        palette_rgb.append([int(h_hex[i:i+2], 16) for i in (0, 2, 4)])
    
    palette_arr_uint8 = np.array(palette_rgb, dtype=np.uint8)
    
    # Pre-calc palette in LAB (Float32 for performance)
    if method == 'ciede2000':
        palette_lab_source = palette_arr_uint8.reshape(1, -1, 3)
        # conversion requires float64 intermediate in skimage but we cast back immediately
        palette_lab = color.rgb2lab(palette_lab_source).reshape(-1, 3).astype(np.float32)
    else:
        palette_float = palette_arr_uint8.astype(np.float32)

    # Adaptive Threshold Params
    max_dist = 40.0
    dist_slope = 10.0
    
    if sep_type == 'raster' and use_adaptive and len(palette_rgb) > 1:
        p_dists = []
        n_p = len(palette_rgb)
        # Use simpler euclidean for adaptive threshold estimation to save time
        # It approximates the "density" of the palette
        p_float_est = palette_arr_uint8.astype(np.float32)
        for a in range(n_p):
            for b in range(a+1, n_p):
                 d = np.sqrt(np.sum((p_float_est[a] - p_float_est[b])**2))
                 # Approximate LAB scale for heuristic
                 p_dists.append(d * 0.4) 
                     
        if len(p_dists) > 0:
            avg_dist = np.mean(p_dists)
            max_dist = avg_dist * 0.8
            dist_slope = avg_dist * 0.2

    num_pixels = rgb.shape[0]
    num_colors = len(palette_rgb)
    
    # Allocate result buffer (Float32 is enough)
    layer_raw_values = np.zeros((num_colors, num_pixels), dtype=np.float32)

    # Increased chunk size for vectorization efficiency, 
    # but kept safe for browser memory (was 50000, now 100000)
    chunk_size = 100000 
    
    for start in range(0, num_pixels, chunk_size):
        end = min(start + chunk_size, num_pixels)
        chunk_rgb = rgb[start:end]
        
        # Use Float32 for chunk calculations to halve memory bandwidth
        chunk_dists = np.zeros((chunk_rgb.shape[0], num_colors), dtype=np.float32)

        if method == 'ciede2000':
            # Convert chunk to LAB once
            chunk_rgb_reshaped = chunk_rgb.reshape(-1, 1, 3)
            # Ensure float32 LAB
            chunk_lab = color.rgb2lab(chunk_rgb_reshaped).astype(np.float32)
            
            for i in range(num_colors):
                ref = palette_lab[i].reshape(1, 1, 3)
                # Skimage deltaE_ciede2000 is heavy.
                # Optimization: The input is already float32.
                d = color.deltaE_ciede2000(ref, chunk_lab, kL=kl, kC=kc, kH=kh)
                chunk_dists[:, i] = d.reshape(-1)
            
            # Explicit delete to help GC in constrained loop
            del chunk_lab
            
        else:
            # Euclidean (Fast Mode)
            chunk_float = chunk_rgb.astype(np.float32)
            diff = chunk_float[:, np.newaxis, :] - palette_float[np.newaxis, :, :]
            # Avoid sqrt if we can compare squared, but we need linear distance for raster
            chunk_dists = np.sqrt(np.sum(diff**2, axis=2))
            del chunk_float

        # --- SEPARATION LOGIC ---
        if sep_type == 'vector':
            labels = np.argmin(chunk_dists, axis=1)
            # Vectorized assignment
            for i in range(num_colors):
                # Creating mask is fast
                mask = (labels == i)
                layer_raw_values[i, start:end][mask] = 255.0
        else:
            # Raster - Vectorized Math
            min_dists = np.min(chunk_dists, axis=1, keepdims=True)
            
            # Broadcasting operations instead of loop where possible?
            # Doing it per color is still cleaner for memory than creating (N, Colors) temp array
            for i in range(num_colors):
                d = chunk_dists[:, i]
                
                # In-place operations to save memory
                # proximity = 1.0 - (d / max_dist)
                d *= (1.0 / max_dist) # Scale d
                np.subtract(1.0, d, out=d) # d becomes proximity
                np.clip(d, 0, 1, out=d)
                
                # Recalculate d (original was lost? no, we need original for prob_factor)
                # Actually, reconstructing logic for speed:
                # We need original 'd' for the second factor. 
                # Let's revert to clean vectorized logic, optimization above is risky for readability
                
                # Re-fetch raw D from chunk_dists (it wasn't modified in place in the source array)
                raw_d = chunk_dists[:, i]
                min_d = min_dists[:, 0]
                
                # Logic: alpha = (1 - d/max) * (1 - (d-min)/slope)
                term1 = 1.0 - (raw_d / max_dist)
                term2 = 1.0 - (raw_d - min_d) / dist_slope
                
                # Clip terms
                np.clip(term1, 0, 1, out=term1)
                np.clip(term2, 0, 1, out=term2)
                
                alpha = term1 * term2
                
                if gamma_val != 1.0:
                    np.power(alpha, gamma_val, out=alpha)
                
                # Snap extremes
                alpha[alpha > 0.85] = 1.0
                alpha[alpha < 0.05] = 0.0
                
                layer_raw_values[i, start:end] = alpha * 255.0

        del chunk_dists
        del chunk_rgb

    # Explicit GC
    gc.collect()

    result_layers = []
    
    for i in range(num_colors):
        # reuse memory view
        alpha_flat = layer_raw_values[i]
        alpha_channel = alpha_flat.reshape(height, width).astype(np.uint8)

        # 1. MIN COVERAGE check
        if min_coverage > 0:
            # Fast numpy count
            nz_count = np.count_nonzero(alpha_channel > 20)
            coverage_pct = (nz_count / (width * height)) * 100.0
            if coverage_pct < min_coverage:
                 continue # Skip completely empty/low layers

        if np.any(alpha_channel):
            # 2. CLEANUP
            if cleanup_strength > 0:
                total_area = np.count_nonzero(alpha_channel)
                min_area = int(total_area * cleanup_strength / 1000.0)
                if min_area > 4:
                    binary_mask = alpha_channel > 50
                    cleaned_mask = morphology.remove_small_objects(binary_mask, min_size=min_area)
                    alpha_channel = np.where(cleaned_mask, alpha_channel, 0)

            # 3. SMOOTH
            if smooth_edges > 0:
                sigma = smooth_edges * 0.3
                # Filters convert to float internally, result is float
                alpha_smooth = filters.gaussian(alpha_channel, sigma=sigma, preserve_range=True)
                alpha_channel = alpha_smooth.astype(np.uint8)

            # Construct Output RGBA
            layer_out = np.zeros((height, width, 4), dtype=np.uint8)
            layer_out[:, :, 3] = alpha_channel
            result_layers.append(layer_out.flatten())
    
    return result_layers

def apply_halftone_am_py(layer_data, width, height, lpi, angle_deg, dpi):
    # Optimize: Use Float32 for grid generation to save memory on large images
    arr = np.array(layer_data.to_py(), dtype=np.uint8).reshape(height, width, 4)
    # Extract alpha and normalize
    ink_density = arr[:, :, 3].astype(np.float32) * (1.0/255.0)
    
    wavelength = float(dpi) / float(lpi)
    freq = 2.0 * math.pi / wavelength
    
    theta = math.radians(angle_deg)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    
    # Optimization: Create indices as float32 directly
    y, x = np.indices((height, width), dtype=np.float32)
    
    # Vectorized rotation
    # x_rot = x * cos - y * sin
    # y_rot = x * sin + y * cos
    x_rot = x * cos_t 
    x_rot -= y * sin_t
    
    y_rot = x * sin_t
    y_rot += y * cos_t
    
    # Release x, y grids immediately
    del x
    del y
    
    # Calculate spot function in-place-ish
    x_rot *= freq
    y_rot *= freq
    np.cos(x_rot, out=x_rot)
    np.cos(y_rot, out=y_rot)
    
    spot_func = x_rot
    spot_func += y_rot
    spot_func /= 2.0
    
    # screen_threshold = (spot_func + 1.0) / 2.0
    spot_func += 1.0
    spot_func /= 2.0
    
    # Thresholding
    # halftoned = ink_density > (1.0 - screen_threshold)
    # optimization: ink_density + screen_threshold > 1.0
    
    spot_func += ink_density
    halftoned = spot_func > 1.0
    
    # Clean up large float arrays
    del spot_func
    del x_rot
    del y_rot
    
    # Refined Cleanup
    halftoned = np.logical_or(halftoned, ink_density > 0.85)
    halftoned = np.logical_and(halftoned, ink_density > 0.05)
    
    # Morphology requires boolean or uint8. Halftoned is boolean.
    halftoned = morphology.remove_small_objects(halftoned, min_size=3)
    halftoned = morphology.remove_small_holes(halftoned, area_threshold=3)
    
    out = np.zeros((height, width, 4), dtype=np.uint8)
    # Fill white bg
    out[..., :3] = 255
    out[..., 3] = 0
    
    # Fill black dots
    mask = halftoned
    out[mask, 3] = 255
    out[mask, :3] = 0
    
    return out.flatten()

def apply_halftone_fm_py(layer_data, width, height):
    arr = np.array(layer_data.to_py(), dtype=np.uint8).reshape(height, width, 4)
    alpha = arr[:, :, 3]
    
    # Look-up table logic or simpler numpy ops for thresholding
    # Keep > 90% solid
    alpha[alpha > 230] = 255
    # Keep < 5% clear
    alpha[alpha < 13] = 0
    
    grayscale_input = 255 - alpha
    img = Image.fromarray(grayscale_input, 'L')
    # Floyd Steinberg is fast in PIL
    dithered = img.convert('1', dither=Image.FLOYDSTEINBERG)
    dithered_arr = np.array(dithered, dtype=np.uint8)
    
    out = np.zeros((height, width, 4), dtype=np.uint8)
    out[..., :3] = 255
    out[..., 3] = 0
    
    ink_mask = (dithered_arr == 0)
    out[ink_mask, :3] = 0
    out[ink_mask, 3] = 255
    
    return out.flatten()

def generate_composite_py(layers_list, colors_hex, width, height, alpha):
    # Use float32 for blending accumulation
    composite = np.full((height, width, 3), 255.0, dtype=np.float32)
    
    for i, layer_proxy in enumerate(layers_list):
        # Convert directly to uint8 array
        layer_flat = np.array(layer_proxy.to_py(), dtype=np.uint8)
        # Extract alpha channel only (every 4th byte starting at offset 3)
        # Reshape logic:
        layer_alpha = layer_flat.reshape(height, width, 4)[:, :, 3]
        
        # Check if layer is empty to skip processing
        if not np.any(layer_alpha):
            continue
            
        effective_alpha = layer_alpha.astype(np.float32) * (alpha / 255.0)
        
        hex_c = colors_hex[i].lstrip('#')
        r = int(hex_c[0:2], 16)
        g = int(hex_c[2:4], 16)
        b = int(hex_c[4:6], 16)
        
        # Vectorized blending: src * alpha + dst * (1 - alpha)
        # Optimization: src is solid color.
        # dst = dst - alpha * (dst - src)
        
        effective_alpha_broad = effective_alpha.reshape(height, width, 1)
        
        # Calculate (dst - src)
        diff = composite - np.array([r, g, b], dtype=np.float32)
        
        # Update composite
        composite -= diff * effective_alpha_broad
        
    composite_final = np.clip(composite, 0, 255).astype(np.uint8)
    rgba = np.dstack((composite_final, np.full((height, width), 255, dtype=np.uint8)))
    return rgba.flatten()
`;

export const initEngine = async () => {
  if (pythonInitialized) return;
  if (!(window as any).loadPyodide) throw new Error("Pyodide not loaded");
  pyodide = await (window as any).loadPyodide();
  await pyodide.loadPackage(["numpy", "pillow", "scikit-image", "scipy"]);
  await pyodide.runPythonAsync(PYTHON_SCRIPT);
  pythonInitialized = true;
};

export const getPyodideInfo = () => {
    if (!pyodide) return { version: 'Unknown', packages: [] as string[] };
    return {
        version: pyodide.version,
        packages: Object.keys(pyodide.loadedPackages || {}) as string[]
    }
}

export const resizeImage = async (imageData: ImageData, targetWidth: number, targetHeight: number): Promise<ImageData> => {
    if (!pyodide) await initEngine();
    const resultProxy = await pyodide.globals.get('resize_image_py')(
        imageData.data, 
        imageData.width, 
        imageData.height,
        targetWidth,
        targetHeight
    );
    const u8 = new Uint8ClampedArray(resultProxy.toJs());
    resultProxy.destroy();
    return new ImageData(u8, targetWidth, targetHeight);
}

export const analyzePalette = async (imageData: ImageData, k: number = 6, config: AdvancedConfig): Promise<PaletteColor[]> => {
  if (!pyodide) await initEngine();
  const resultProxy = await pyodide.globals.get('analyze_palette_py')(imageData.data, imageData.width, imageData.height, k, config.sampleSize);
  const hexColors: string[] = resultProxy.toJs();
  resultProxy.destroy();
  
  return hexColors.map((hex, idx) => ({
    id: `auto-${idx}-${Date.now()}`,
    hex,
    rgb: hexToRgb(hex)
  }));
};

export const performSeparation = async (imageData: ImageData, palette: PaletteColor[], config: AdvancedConfig): Promise<Layer[]> => {
  if (!pyodide) await initEngine();
  const hexList = palette.map(p => p.hex);
  const layersProxy = await pyodide.globals.get('separate_colors_py')(
    imageData.data, 
    imageData.width, 
    imageData.height, 
    hexList,
    config.kL,
    config.kC,
    config.kH,
    config.separationMethod,
    config.separationType,
    config.cleanupStrength,
    config.smoothEdges,
    config.gamma,
    config.useVectorAntiAliasing,
    config.useRasterAdaptive,
    config.minCoverage
  );
  const layersDataList = layersProxy.toJs();
  layersProxy.destroy();
  
  return layersDataList.map((flatData: any, idx: number) => {
    const u8 = new Uint8ClampedArray(flatData);
    return {
      id: palette[idx].id,
      color: palette[idx],
      visible: true,
      data: new ImageData(u8, imageData.width, imageData.height)
    };
  });
};

export const applyHalftone = async (layerData: ImageData, config?: AdvancedConfig): Promise<ImageData> => {
  if (!pyodide) await initEngine();
  let resultProxy;
  if (config && config.halftoneType === 'am') {
      resultProxy = await pyodide.globals.get('apply_halftone_am_py')(
          layerData.data, 
          layerData.width, 
          layerData.height,
          config.halftoneLpi,
          config.halftoneAngle,
          config.outputDpi || 300 // Pass DPI to python
      );
  } else {
      resultProxy = await pyodide.globals.get('apply_halftone_fm_py')(
          layerData.data, 
          layerData.width, 
          layerData.height
      );
  }
  const u8 = new Uint8ClampedArray(resultProxy.toJs());
  resultProxy.destroy();
  return new ImageData(u8, layerData.width, layerData.height);
};

export const generateComposite = async (layers: Layer[], width: number, height: number, config: AdvancedConfig): Promise<ImageData> => {
    if (!pyodide) await initEngine();
    if (layers.length === 0) return new ImageData(width, height);
    const resultProxy = await pyodide.globals.get('generate_composite_py')(
      layers.map(l => l.data.data), 
      layers.map(l => l.color.hex), 
      width, 
      height,
      config.inkOpacity
    );
    const u8 = new Uint8ClampedArray(resultProxy.toJs());
    resultProxy.destroy();
    return new ImageData(u8, width, height);
}

// --- NEW HELPER FUNCTIONS FOR LAYER MANIPULATION ---

export const mergeLayersData = (target: ImageData, sources: ImageData[]): ImageData => {
    const width = target.width;
    const height = target.height;
    const result = new Uint8ClampedArray(target.data.length);
    
    // Clone target first
    result.set(target.data);

    for (const source of sources) {
        const srcData = source.data;
        for (let i = 0; i < srcData.length; i += 4) {
            // Merge Alpha (Density)
            // Logic: Add densities, clamp at 255. 
            // Screen print logic: More ink is just more ink, but you can't have > 100% ink on a spot theoretically for the film.
            const alphaT = result[i + 3];
            const alphaS = srcData[i + 3];
            
            const mergedAlpha = Math.min(255, alphaT + alphaS);
            
            result[i] = 0; // Black RGB
            result[i + 1] = 0; 
            result[i + 2] = 0;
            result[i + 3] = mergedAlpha;
        }
    }
    return new ImageData(result, width, height);
}

export const createGrayscaleFromAlpha = (layer: Layer): ImageData => {
    const w = layer.data.width;
    const h = layer.data.height;
    const newData = new Uint8ClampedArray(w * h * 4);
    const src = layer.data.data;
    
    for(let i=0; i<src.length; i+=4) {
        const alpha = src[i+3];
        // Invert alpha for grayscale (White = No Ink, Black = Ink)
        // Separation engine expects RGB input. 
        // 0 alpha (Transparent) -> White (255,255,255)
        // 255 alpha (Solid) -> Black (0,0,0)
        
        const val = 255 - alpha;
        newData[i] = val;
        newData[i+1] = val;
        newData[i+2] = val;
        newData[i+3] = 255; // Full opaque for the 'source' image
    }
    return new ImageData(newData, w, h);
}

/**
 * Splits a layer into two based on a polygon path.
 * @param source ImageData to split
 * @param points Array of {x, y} coordinates relative to the image size
 * @returns [insideLayer, outsideLayer]
 */
export const splitByLasso = (source: ImageData, points: {x: number, y: number}[]): [ImageData, ImageData] => {
    const width = source.width;
    const height = source.height;

    // 1. Create a Mask Canvas
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const ctx = maskCanvas.getContext('2d');
    
    if (!ctx) throw new Error("Could not create mask canvas");

    // Draw the polygon
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height); // Default black
    
    ctx.fillStyle = 'white';
    ctx.beginPath();
    if (points.length > 0) {
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
    }
    ctx.fill();

    const maskData = ctx.getImageData(0, 0, width, height).data;

    // 2. Prepare result arrays
    const insideData = new Uint8ClampedArray(source.data.length);
    const outsideData = new Uint8ClampedArray(source.data.length);

    // 3. Iterate pixels
    for (let i = 0; i < source.data.length; i += 4) {
        // Mask is black/white. We only check Red channel (maskData[i])
        // If mask > 128, it's inside (White)
        const isInside = maskData[i] > 128;

        if (isInside) {
            // Move pixel to Inside Layer
            insideData[i] = source.data[i];
            insideData[i+1] = source.data[i+1];
            insideData[i+2] = source.data[i+2];
            insideData[i+3] = source.data[i+3];
            
            // Outside layer pixel remains 0 (Transparent)
        } else {
            // Keep pixel in Outside Layer
            outsideData[i] = source.data[i];
            outsideData[i+1] = source.data[i+1];
            outsideData[i+2] = source.data[i+2];
            outsideData[i+3] = source.data[i+3];
        }
    }

    return [
        new ImageData(insideData, width, height),
        new ImageData(outsideData, width, height)
    ];
};