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

def resize_image_py(image_data, w, h, target_w, target_h):
    arr = np.array(image_data.to_py()).reshape(h, w, 4)
    img = Image.fromarray(arr)
    # Use Lanczos filter for high quality resampling
    img_resized = img.resize((int(target_w), int(target_h)), Image.Resampling.LANCZOS)
    
    # Convert back to flat uint8 array
    resized_arr = np.array(img_resized)
    return resized_arr.flatten()

def analyze_palette_py(image_data, width, height, k, sample_size):
    arr = np.array(image_data.to_py()).reshape(height, width, 4)
    pixels = arr.reshape(-1, 4)
    
    # 1. Filter out transparent pixels (Alpha < 50)
    mask = pixels[:, 3] > 50
    valid_pixels = pixels[mask]
    
    if valid_pixels.shape[0] == 0:
        return ["#000000"]
    
    # 2. Sample pixels for performance
    n_pixels = valid_pixels.shape[0]
    sample_size = int(sample_size)
    if n_pixels > sample_size:
        indices = np.random.choice(n_pixels, sample_size, replace=False)
        sample = valid_pixels[indices, :3]
    else:
        sample = valid_pixels[:, :3]
    
    # 3. Convert to LAB Color Space (Perceptually Uniform)
    sample_float = sample.astype(np.float32) / 255.0
    sample_lab = color.rgb2lab(sample_float.reshape(1, -1, 3)).reshape(-1, 3)
    
    # 4. K-Means Clustering in LAB
    n_samples = sample_lab.shape[0]
    k = min(int(k), n_samples)
    
    # Initialize centroids randomly
    init_indices = np.random.choice(n_samples, k, replace=False)
    centroids = sample_lab[init_indices]
    
    for _ in range(15): # Max iterations
        # Compute distances (N, K)
        diff = sample_lab[:, np.newaxis, :] - centroids[np.newaxis, :, :]
        dist_sq = np.sum(diff**2, axis=2)
        
        # Assign to nearest
        labels = np.argmin(dist_sq, axis=1)
        
        new_centroids = np.zeros_like(centroids)
        for i in range(k):
            mask_c = (labels == i)
            if np.any(mask_c):
                new_centroids[i] = np.mean(sample_lab[mask_c], axis=0)
            else:
                # Re-init empty cluster
                new_centroids[i] = sample_lab[np.random.choice(n_samples)]
        
        if np.allclose(centroids, new_centroids, atol=0.1):
            break
        centroids = new_centroids
    
    # 5. Sort by dominance (pixel count)
    diff = sample_lab[:, np.newaxis, :] - centroids[np.newaxis, :, :]
    dist_sq = np.sum(diff**2, axis=2)
    final_labels = np.argmin(dist_sq, axis=1)
    
    counts = np.bincount(final_labels, minlength=k)
    sorted_idx = np.argsort(-counts)
    sorted_centroids = centroids[sorted_idx]
    
    # 6. Convert Centroids back to Hex
    rgb_centroids = color.lab2rgb(sorted_centroids.reshape(1, -1, 3)).reshape(-1, 3)
    rgb_centroids = np.clip(rgb_centroids, 0, 1)
    u8_centroids = (rgb_centroids * 255).astype(np.uint8)
    
    hex_colors = []
    for i in range(k):
        r, g, b = u8_centroids[i]
        hex_colors.append(f"#{r:02x}{g:02x}{b:02x}")
    
    return hex_colors

def separate_colors_py(image_data, width, height, palette_hex_list, kl, kc, kh, method, sep_type, cleanup_strength, smooth_edges, gamma_val, use_aa, use_adaptive, min_coverage):
    # Load and preprocess
    arr = np.array(image_data.to_py())
    pixels = arr.reshape(-1, 4)
    rgb = pixels[:, :3] # (N, 3) uint8 view
    
    palette_rgb = []
    for h_hex in palette_hex_list:
        h_hex = h_hex.lstrip('#')
        palette_rgb.append([int(h_hex[i:i+2], 16) for i in (0, 2, 4)])
    
    palette_arr_uint8 = np.array(palette_rgb, dtype=np.uint8)
    
    # Pre-calc LAB palette if needed
    if method == 'ciede2000':
        palette_lab_source = palette_arr_uint8.reshape(1, -1, 3)
        palette_lab = color.rgb2lab(palette_lab_source).reshape(-1, 3)
    else:
        palette_float = palette_arr_uint8.astype(np.float32)

    # --- ADAPTIVE THRESHOLD CALCULATION (For Raster) ---
    max_dist = 40.0
    dist_slope = 10.0
    
    if sep_type == 'raster' and use_adaptive and len(palette_rgb) > 1:
        # Calculate pairwise distances in palette
        p_dists = []
        n_p = len(palette_rgb)
        if method == 'ciede2000':
            for a in range(n_p):
                for b in range(a+1, n_p):
                    d = color.deltaE_ciede2000(palette_lab[a].reshape(1,1,3), palette_lab[b].reshape(1,1,3), kL=kl, kC=kc, kH=kh)
                    p_dists.append(d)
        else:
             # Euclidean pairwise
             p_float = palette_arr_uint8.astype(np.float32)
             for a in range(n_p):
                for b in range(a+1, n_p):
                     d = np.sqrt(np.sum((p_float[a] - p_float[b])**2))
                     p_dists.append(d)
                     
        if len(p_dists) > 0:
            avg_dist = np.mean(p_dists)
            max_dist = avg_dist * 0.6
            dist_slope = avg_dist * 0.15 # Scale slope relative to distance

    num_pixels = rgb.shape[0]
    num_colors = len(palette_rgb)
    layer_raw_values = np.zeros((num_colors, num_pixels), dtype=np.float32)

    chunk_size = 50000 
    
    for start in range(0, num_pixels, chunk_size):
        end = min(start + chunk_size, num_pixels)
        chunk_rgb = rgb[start:end]
        M = chunk_rgb.shape[0]
        
        chunk_dists = np.zeros((M, num_colors), dtype=np.float32)

        if method == 'ciede2000':
            chunk_rgb_reshaped = chunk_rgb.reshape(-1, 1, 3)
            chunk_lab = color.rgb2lab(chunk_rgb_reshaped)
            for i in range(num_colors):
                ref = palette_lab[i].reshape(1, 1, 3)
                d = color.deltaE_ciede2000(ref, chunk_lab, kL=kl, kC=kc, kH=kh)
                chunk_dists[:, i] = d.reshape(-1)
        else:
            chunk_float = chunk_rgb.astype(np.float32)
            diff = chunk_float[:, np.newaxis, :] - palette_float[np.newaxis, :, :]
            chunk_dists = np.sqrt(np.sum(diff**2, axis=2))

        # --- SEPARATION LOGIC ---
        if sep_type == 'vector':
            labels = np.argmin(chunk_dists, axis=1)
            for i in range(num_colors):
                layer_raw_values[i, start:end] = np.where(labels == i, 255.0, 0.0)
                
        else: # 'raster' - SOFT MASKING
            min_dists = np.min(chunk_dists, axis=1)
            
            for i in range(num_colors):
                d = chunk_dists[:, i]
                proximity = np.clip(1.0 - (d / max_dist), 0, 1)
                prob_factor = np.clip(1.0 - (d - min_dists) / dist_slope, 0, 1)
                alpha_norm = proximity * prob_factor
                
                if gamma_val != 1.0:
                    alpha_norm = np.power(alpha_norm, gamma_val)
                
                # SOLID SNAPPING (Keep this consistent with Halftoning)
                alpha_norm = np.where(alpha_norm > 0.85, 1.0, alpha_norm)
                alpha_norm = np.where(alpha_norm < 0.05, 0.0, alpha_norm)
                
                layer_raw_values[i, start:end] = alpha_norm * 255.0

    result_layers = []
    
    for i in range(num_colors):
        # Flattened alpha array for this color
        alpha_flat = layer_raw_values[i]
        alpha_channel = alpha_flat.reshape(height, width).astype(np.uint8)

        # 1. MIN COVERAGE (Drops "ghost" layers)
        # Calculate percentage of significant pixels (> 20 intensity)
        if min_coverage > 0:
            coverage_pct = np.sum(alpha_channel > 20) / (width * height) * 100.0
            if coverage_pct < min_coverage:
                alpha_channel[:] = 0

        # Check if layer is empty before proceeding
        if np.any(alpha_channel):

            # 2. CLEANUP STRENGTH (Intelligent Speckle Removal)
            if cleanup_strength > 0:
                # Calculate total area of ink
                total_area = np.sum(alpha_channel > 0)
                # Threshold for removing objects based on relative area (0.1% to 5% per 1000 range approx)
                min_area = int(total_area * cleanup_strength / 1000.0)
                
                if min_area > 4:
                    binary_mask = alpha_channel > 50
                    cleaned_mask = morphology.remove_small_objects(binary_mask, min_size=min_area)
                    # Restore gradients only where mask is valid
                    alpha_channel = np.where(cleaned_mask, alpha_channel, 0)

            # 3. SMOOTH EDGES (Gaussian Blur + Re-threshold)
            if smooth_edges > 0:
                sigma = smooth_edges * 0.3 # Range 0-5 -> 0.0 - 1.5 sigma
                alpha_float = alpha_channel.astype(np.float32) / 255.0
                alpha_smooth = filters.gaussian(alpha_float, sigma=sigma)
                # Re-normalize/Clip
                alpha_channel = (alpha_smooth * 255).clip(0, 255).astype(np.uint8)

            # --- VECTOR ANTI-ALIASING (Specific to Vector mode, applied separately/additionally) ---
            if sep_type == 'vector' and use_aa:
                 pass 

        # Output RGBA (Ink on transparent)
        layer_out = np.zeros((height, width, 4), dtype=np.uint8)
        layer_out[:, :, 3] = alpha_channel
        result_layers.append(layer_out.flatten())
        
    return result_layers

def apply_halftone_am_py(layer_data, width, height, lpi, angle_deg, dpi):
    arr = np.array(layer_data.to_py()).reshape(height, width, 4)
    alpha = arr[:, :, 3].astype(np.float32) / 255.0
    
    ink_density = alpha
    
    # Calculate screen pattern based on DPI and LPI
    # Wavelength is the number of pixels per halftone cell
    wavelength = float(dpi) / float(lpi)
    
    theta = math.radians(angle_deg)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    
    y, x = np.indices((height, width))
    x_rot = x * cos_t - y * sin_t
    y_rot = x * sin_t + y * cos_t
    
    freq = 2.0 * math.pi / wavelength
    spot_func = (np.cos(x_rot * freq) + np.cos(y_rot * freq)) / 2.0
    screen_threshold = (spot_func + 1.0) / 2.0
    
    # Thresholding
    halftoned = ink_density > (1.0 - screen_threshold)
    
    # --- REFINED CLEANUP ---
    # 1. Aggressive Solid Snapping: Force >85% opacity to solid
    halftoned = np.logical_or(halftoned, ink_density > 0.85)
    
    # 2. Aggressive Clear Snapping: Force <5% opacity to clear
    halftoned = np.logical_and(halftoned, ink_density > 0.05)
    
    # 3. Morphological Despeckling
    halftoned = morphology.remove_small_objects(halftoned, min_size=3)
    halftoned = morphology.remove_small_holes(halftoned, area_threshold=3)
    
    out = np.zeros((height, width, 4), dtype=np.uint8)
    out[..., :3] = 255 # White background
    out[..., 3] = 0    # Transparent
    
    out[halftoned, 0] = 0
    out[halftoned, 1] = 0
    out[halftoned, 2] = 0
    out[halftoned, 3] = 255 # Opaque ink
    
    return out.flatten()

def apply_halftone_fm_py(layer_data, width, height):
    arr = np.array(layer_data.to_py()).reshape(height, width, 4)
    alpha = arr[:, :, 3]
    
    # Pre-clean input for FM to prevent noise in solids/clears
    alpha = np.where(alpha > 230, 255, alpha) # >90% -> 100%
    alpha = np.where(alpha < 13, 0, alpha)    # <5% -> 0%
    
    grayscale_input = 255 - alpha
    img = Image.fromarray(grayscale_input, 'L')
    dithered = img.convert('1', dither=Image.FLOYDSTEINBERG)
    dithered_arr = np.array(dithered, dtype=np.uint8) * 255
    
    out = np.zeros((height, width, 4), dtype=np.uint8)
    out[..., :3] = 255
    out[..., 3] = 0
    
    ink_mask = (dithered_arr == 0)
    out[ink_mask, 0] = 0
    out[ink_mask, 1] = 0
    out[ink_mask, 2] = 0
    out[ink_mask, 3] = 255
    return out.flatten()

def generate_composite_py(layers_list, colors_hex, width, height, alpha):
    composite = np.ones((height, width, 3), dtype=np.float32) * 255.0
    for i, layer_proxy in enumerate(layers_list):
        layer_flat = np.array(layer_proxy.to_py())
        layer = layer_flat.reshape(height, width, 4)
        layer_alpha = layer[:, :, 3].astype(np.float32) / 255.0
        effective_alpha = layer_alpha * alpha
        hex_c = colors_hex[i].lstrip('#')
        rgb_ink = np.array([int(hex_c[j:j+2], 16) for j in (0, 2, 4)], dtype=np.float32)
        rgb_ink_broad = rgb_ink.reshape(1, 1, 3)
        effective_alpha_broad = effective_alpha.reshape(height, width, 1)
        composite = composite * (1.0 - effective_alpha_broad) + rgb_ink_broad * effective_alpha_broad
    composite_final = composite.clip(0, 255).astype(np.uint8)
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