export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface PaletteColor {
  id: string;
  hex: string;
  rgb: RGB;
  locked?: boolean;
  // Per-channel gradient range (Raster mode only)
  gradientMin?: number;  // 0-100: Distance where ink is 100% solid
  gradientMax?: number;  // 0-200: Distance where ink fades to 0%
  gamma?: number;        // 0.1-3.0: Per-channel gamma curve
}

export interface Layer {
  id: string;
  color: PaletteColor;
  data: ImageData;
  visible: boolean;
}

export interface AdvancedConfig {
  sampleSize: number;
  inkOpacity: number;
  kL: number;
  kC: number;
  kH: number;
  separationMethod: 'ciede2000' | 'euclidean';
  separationType: 'vector' | 'raster';
  
  // Output Size & Resolution
  outputDpi: number;
  outputSizeInches: number;
  outputMeasurement: 'width' | 'height';

  // Pre-processing (OpenCV)
  denoiseStrength: number; // Bilateral Filter Sigma Color
  denoiseSpatial: number;  // Bilateral Filter Sigma Space

  // Vector Specific
  useVectorAntiAliasing: boolean;
  vectorAASigma: number;
  vectorAAThreshold: number;

  // Raster Specific
  useRasterAdaptive: boolean;

  // Substrate Knockout
  useSubstrateKnockout: boolean;
  substrateColorHex: string;  // Color of the garment/paper
  substrateThreshold: number; // 0-100: How aggressively to knock out

  // Cleanup Parameters
  cleanupStrength: number; // 0-10: Relative area-based removal
  smoothEdges: number;     // 0-5: Gaussian blur edge refinement
  minCoverage: number;     // 0-5%: Drops layers with low content

  // Halftone Parameters
  halftoneType: 'fm' | 'am'; // FM = Dithering, AM = Lines/Dots
  halftoneLpi: number;
  halftoneAngle: number;
  // Gamma adjustment for soft separation
  gamma: number; 
}

export const DEFAULT_CONFIG: AdvancedConfig = {
  sampleSize: 25000,
  inkOpacity: 0.90, 
  kL: 1.0,
  kC: 1.0,
  kH: 1.0,
  separationMethod: 'ciede2000',
  separationType: 'vector',
  
  outputDpi: 300,
  outputSizeInches: 3, 
  outputMeasurement: 'width',

  denoiseStrength: 10, // New default for Bilateral
  denoiseSpatial: 5,   // New default for Bilateral

  useVectorAntiAliasing: true,
  vectorAASigma: 1.0,
  vectorAAThreshold: 127,

  useRasterAdaptive: true,

  useSubstrateKnockout: false,
  substrateColorHex: '#ffffff',
  substrateThreshold: 50,

  cleanupStrength: 1, 
  smoothEdges: 0,
  minCoverage: 0.2,

  halftoneType: 'am',
  halftoneLpi: 45, 
  halftoneAngle: 22.5,
  gamma: 1.25 
};

export enum ProcessingStatus {
  IDLE,
  LOADING_ENGINE,
  ANALYZING,
  RESIZING,
  SEPARATING,
  CLEANING,
  HALFTONING,
  COMPOSITING,
  COMPLETE
}