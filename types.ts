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
}

export const DEFAULT_CONFIG: AdvancedConfig = {
  sampleSize: 20000,
  inkOpacity: 0.92,
  kL: 1.0,
  kC: 1.0,
  kH: 1.0
};

export enum ProcessingStatus {
  IDLE,
  LOADING_ENGINE,
  ANALYZING,
  SEPARATING,
  HALFTONING,
  COMPOSITING,
  COMPLETE
}