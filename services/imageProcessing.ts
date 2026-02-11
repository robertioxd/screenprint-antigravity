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
from skimage import color
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

def separate_colors_py(image_data, width, height, palette_hex_list, kl, kc, kh):
    arr = np.array(image_data.to_py()).reshape(height, width, 4)
    rgb = arr[:, :, :3]
    
    palette_rgb = []
    for h_hex in palette_hex_list:
        h_hex = h_hex.lstrip('#')
        palette_rgb.append([int(h_hex[i:i+2], 16) for i in (0, 2, 4)])
    
    palette_arr = np.array(palette_rgb, dtype=np.uint8).reshape(1, -1, 3)
    palette_lab = color.rgb2lab(palette_arr).reshape(-1, 3)
    
    img_lab = color.rgb2lab(rgb)
    h, w, _ = img_lab.shape
    
    distances = np.zeros((h, w, len(palette_lab)), dtype=np.float32)
    
    for i in range(len(palette_lab)):
        ref_color_lab = palette_lab[i].reshape(1, 1, 3)
        # Apply CIEDE2000 with custom coefficients
        distances[:, :, i] = color.deltaE_ciede2000(ref_color_lab, img_lab, kL=kl, kC=kc, kH=kh)
    
    labels = np.argmin(distances, axis=2)
    
    result_layers = []
    for i in range(len(palette_hex_list)):
        mask = (labels == i)
        layer_rgba = np.zeros((h, w, 4), dtype=np.uint8)
        layer_rgba[..., :3] = 255
        layer_rgba[..., 3] = 0
        layer_rgba[mask, 0] = 0
        layer_rgba[mask, 1] = 0
        layer_rgba[mask, 2] = 0
        layer_rgba[mask, 3] = 255
        result_layers.append(layer_rgba.flatten())
        
    return result_layers

def apply_halftone_py(layer_data, width, height):
    arr = np.array(layer_data.to_py()).reshape(height, width, 4)
    ink_channel = 255 - arr[:, :, 0] 
    img = Image.fromarray(ink_channel, 'L')
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
        is_ink = (layer[..., 0] < 128) & (layer[..., 3] > 128)
        hex_c = colors_hex[i].lstrip('#')
        rgb_ink = np.array([int(hex_c[j:j+2], 16) for j in (0, 2, 4)], dtype=np.float32)
        current_colors = composite[is_ink]
        blended = (current_colors * (1 - alpha)) + (rgb_ink * alpha)
        composite[is_ink] = blended
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
    config.kH
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

export const applyHalftone = async (layerData: ImageData): Promise<ImageData> => {
  if (!pyodide) await initEngine();
  const resultProxy = await pyodide.globals.get('apply_halftone_py')(layerData.data, layerData.width, layerData.height);
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