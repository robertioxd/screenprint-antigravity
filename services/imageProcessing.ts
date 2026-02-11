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

def analyze_palette_py(image_data, width, height, k, sample_size):
    arr = np.array(image_data.to_py()).reshape(height, width, 4)
    rgb = arr[:, :, :3].astype(np.float32) / 255.0
    
    h, w, _ = rgb.shape
    sample_size = int(sample_size)
    actual_sample = min(h * w, sample_size)
    indices_h = np.random.randint(0, h, actual_sample)
    indices_w = np.random.randint(0, w, actual_sample)
    rgb_sample = rgb[indices_h, indices_w]

    img_for_init = Image.fromarray((rgb * 255).astype(np.uint8))
    quantized = img_for_init.quantize(colors=k, method=2)
    palette_raw = quantized.getpalette()[:k*3]
    
    hex_colors = []
    for i in range(0, len(palette_raw), 3):
        r, g, b = palette_raw[i], palette_raw[i+1], palette_raw[i+2]
        hex_colors.append(f"#{r:02x}{g:02x}{b:02x}")
    
    return hex_colors

def separate_colors_py(image_data, width, height, palette_hex_list, kl, kc, kh, method, sep_type, speckle_size, erosion_amount, gamma_val):
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
            # Improved Soft Masking with Falloff and Gamma
            max_dist = 40.0 if method == 'ciede2000' else 100.0
            
            # Find the best match distance per pixel to normalize intensity
            min_dists = np.min(chunk_dists, axis=1)
            
            for i in range(num_colors):
                d = chunk_dists[:, i]
                # Normalized proximity [0..1], 1 is exact match
                proximity = np.clip(1.0 - (d / max_dist), 0, 1)
                
                # Probability factor: Only allow significant color if it's actually the closest or very close to closest
                # This prevents "bleeding" into other unrelated clusters
                prob_factor = np.clip(1.0 - (d - min_dists) / 10.0, 0, 1)
                
                alpha_norm = proximity * prob_factor
                
                # Apply Gamma Correction: pow(x, gamma)
                # gamma > 1.0 makes it "tighter" (less grey), < 1.0 makes it "softer"
                if gamma_val != 1.0:
                    alpha_norm = np.power(alpha_norm, gamma_val)
                
                layer_raw_values[i, start:end] = alpha_norm * 255.0

    result_layers = []
    
    for i in range(num_colors):
        alpha_channel = layer_raw_values[i].reshape(height, width).astype(np.uint8)
        
        if speckle_size > 0:
            binary_mask = alpha_channel > 30
            cleaned_mask = morphology.remove_small_objects(binary_mask, min_size=speckle_size)
            alpha_channel = np.where(cleaned_mask, alpha_channel, 0)

        if erosion_amount > 0:
            selem = morphology.disk(erosion_amount)
            alpha_channel = morphology.erosion(alpha_channel, selem)

        # Output RGBA (Ink on transparent)
        layer_out = np.zeros((height, width, 4), dtype=np.uint8)
        layer_out[:, :, 3] = alpha_channel
        result_layers.append(layer_out.flatten())
        
    return result_layers

def apply_halftone_am_py(layer_data, width, height, lpi, angle_deg):
    arr = np.array(layer_data.to_py()).reshape(height, width, 4)
    alpha = arr[:, :, 3].astype(np.float32) / 255.0
    gray = 1.0 - alpha
    theta = math.radians(angle_deg)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    wavelength = 300.0 / lpi 
    y, x = np.indices((height, width))
    x_rot = x * cos_t + y * sin_t
    y_rot = -x * sin_t + y * cos_t
    x_phase = (x_rot % wavelength) - (wavelength / 2.0)
    y_phase = (y_rot % wavelength) - (wavelength / 2.0)
    dist_sq = x_phase**2 + y_phase**2
    max_dist_sq = (wavelength**2) / 2.0
    screen_val = 1.0 - (dist_sq / max_dist_sq) 
    ink_density = 1.0 - gray
    dist_norm = np.sqrt(dist_sq) / (wavelength / 2.0 * 1.414) 
    halftoned = ink_density > dist_norm
    out = np.zeros((height, width, 4), dtype=np.uint8)
    out[..., :3] = 255
    out[..., 3] = 0
    ink_mask = (halftoned)
    out[ink_mask, 0] = 0
    out[ink_mask, 1] = 0
    out[ink_mask, 2] = 0
    out[ink_mask, 3] = 255
    return out.flatten()

def apply_halftone_fm_py(layer_data, width, height):
    arr = np.array(layer_data.to_py()).reshape(height, width, 4)
    alpha = arr[:, :, 3]
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
  await pyodide.loadPackage(["numpy", "pillow", "scikit-image"]);
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
    config.speckleSize,
    config.erosionAmount,
    config.gamma
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
          config.halftoneAngle
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