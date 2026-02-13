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

  // Vector Specific
  useVectorAntiAliasing: boolean;

  // Raster Specific
  useRasterAdaptive: boolean;

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
  sampleSize: 20000,
  inkOpacity: 0.95, 
  kL: 1.0,
  kC: 1.0,
  kH: 1.0,
  separationMethod: 'ciede2000',
  separationType: 'vector',
  
  outputDpi: 300,
  outputSizeInches: 3, // Changed from 12 to 3
  outputMeasurement: 'width',

  useVectorAntiAliasing: true,
  useRasterAdaptive: true,

  cleanupStrength: 0, // Changed from 3 to 0
  smoothEdges: 0,
  minCoverage: 0.2, // Changed from 0.5 to 0.2

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