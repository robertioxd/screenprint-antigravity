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
  // New Cleanup Parameters
  speckleSize: number; // Area in pixels to remove
  erosionAmount: number; // 0 to 5, strength of edge refinement
  // New Halftone Parameters
  halftoneType: 'fm' | 'am'; // FM = Dithering, AM = Lines/Dots
  halftoneLpi: number;
  halftoneAngle: number;
  // Gamma adjustment for soft separation
  gamma: number; 
}

export const DEFAULT_CONFIG: AdvancedConfig = {
  sampleSize: 20000,
  inkOpacity: 0.92,
  kL: 1.0,
  kC: 1.0,
  kH: 1.0,
  separationMethod: 'ciede2000',
  separationType: 'vector',
  speckleSize: 0,
  erosionAmount: 0,
  halftoneType: 'am',
  halftoneLpi: 45,
  halftoneAngle: 22.5,
  gamma: 1.0
};

export enum ProcessingStatus {
  IDLE,
  LOADING_ENGINE,
  ANALYZING,
  SEPARATING,
  CLEANING,
  HALFTONING,
  COMPOSITING,
  COMPLETE
}