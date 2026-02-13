import React from 'react';
import { AdvancedConfig } from '../types';
import { Settings2, Info, Calculator, Eye, Layers, Image as ImageIcon, Eraser, Scissors, Grid3X3, Sun, Wand2, Ghost, Sparkles, Feather } from 'lucide-react';

interface AdvancedSettingsProps {
  config: AdvancedConfig;
  onChange: (config: AdvancedConfig) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({ config, onChange, isOpen, onToggle }) => {
  const updateField = (field: keyof AdvancedConfig, value: number | string | boolean) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-850 transition-all">
      <button 
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-sm font-semibold text-gray-300 hover:bg-gray-800 transition-colors uppercase tracking-wider"
      >
        <span className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-blue-400" />
          Configuración Avanzada
        </span>
        <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div className="p-4 space-y-4 border-t border-gray-700 text-xs">
          
          {/* SECCIÓN 1: MOTOR DE SEPARACIÓN */}
          <div className="space-y-2 pb-3 border-b border-gray-700">
             <label className="text-gray-400 font-bold uppercase flex items-center gap-1">
                1. Motor de Separación
              </label>
              
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button 
                    onClick={() => updateField('separationType', 'vector')}
                    className={`p-2 rounded border flex flex-col items-center gap-1 transition-all ${config.separationType === 'vector' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                >
                    <Layers className="w-4 h-4" />
                    <span className="text-[10px] font-bold">Vector (Sólido)</span>
                </button>
                <button 
                    onClick={() => updateField('separationType', 'raster')}
                    className={`p-2 rounded border flex flex-col items-center gap-1 transition-all ${config.separationType === 'raster' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                >
                    <ImageIcon className="w-4 h-4" />
                    <span className="text-[10px] font-bold">Raster (Soft)</span>
                </button>
              </div>

              {/* Sub-settings based on Type */}
              {config.separationType === 'vector' ? (
                 <div className="bg-gray-800 p-2 rounded border border-gray-700 mb-2">
                    <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-gray-400 flex items-center gap-1.5">
                            <Wand2 className="w-3 h-3 text-blue-400" /> 
                            Anti-Aliasing
                        </span>
                        <div className="relative inline-block w-8 h-4 align-middle select-none transition duration-200 ease-in">
                            <input 
                                type="checkbox" 
                                checked={config.useVectorAntiAliasing} 
                                onChange={(e) => updateField('useVectorAntiAliasing', e.target.checked)} 
                                className="toggle-checkbox absolute block w-4 h-4 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 checked:border-blue-600 right-4 border-gray-300"
                            />
                            <label className={`toggle-label block overflow-hidden h-4 rounded-full cursor-pointer ${config.useVectorAntiAliasing ? 'bg-blue-600' : 'bg-gray-600'}`}></label>
                        </div>
                    </label>
                    <p className="text-[9px] text-gray-500 mt-1 pl-5">Suaviza los bordes dentados (Gaussian Blur).</p>
                 </div>
              ) : (
                <div className="bg-gray-800 p-2 rounded border border-gray-700 mb-2 space-y-3">
                    <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-gray-400 flex items-center gap-1.5">
                            <Calculator className="w-3 h-3 text-green-400" /> 
                            Adaptive Threshold
                        </span>
                        <div className="relative inline-block w-8 h-4 align-middle select-none transition duration-200 ease-in">
                            <input 
                                type="checkbox" 
                                checked={config.useRasterAdaptive} 
                                onChange={(e) => updateField('useRasterAdaptive', e.target.checked)} 
                                className="toggle-checkbox absolute block w-4 h-4 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 checked:border-green-600 right-4 border-gray-300"
                            />
                            <label className={`toggle-label block overflow-hidden h-4 rounded-full cursor-pointer ${config.useRasterAdaptive ? 'bg-green-600' : 'bg-gray-600'}`}></label>
                        </div>
                    </label>
                 </div>
              )}

              <div className="grid grid-cols-2 gap-2 mb-3">
                <button 
                    onClick={() => updateField('separationMethod', 'ciede2000')}
                    className={`p-2 rounded border flex flex-col items-center gap-1 transition-all ${config.separationMethod === 'ciede2000' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                >
                    <Eye className="w-4 h-4" />
                    <span className="text-[10px] font-bold">CIEDE2000</span>
                </button>
                <button 
                    onClick={() => updateField('separationMethod', 'euclidean')}
                    className={`p-2 rounded border flex flex-col items-center gap-1 transition-all ${config.separationMethod === 'euclidean' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                >
                    <Calculator className="w-4 h-4" />
                    <span className="text-[10px] font-bold">Euclidiano</span>
                </button>
              </div>

              {config.separationType === 'raster' && (
                <div className="space-y-1">
                  <div className="flex justify-between text-gray-400">
                      <span className="flex items-center gap-1"><Sun className="w-3 h-3"/> Ganancia / Gamma</span>
                      <span className="text-blue-400 font-mono">{config.gamma.toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="3.0" step="0.05" 
                    value={config.gamma}
                    onChange={(e) => updateField('gamma', parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    title="Ajusta la intensidad de los degradados"
                  />
                </div>
              )}
          </div>

          {/* SECCIÓN 2: LIMPIEZA (POST-PROCESO) */}
          <div className="space-y-4 pb-3 border-b border-gray-700">
             <label className="text-gray-400 font-bold uppercase flex items-center gap-1">
                2. Limpieza y Refinamiento
                <span title="Post-proceso para eliminar ruido y limpiar bordes."><Eraser className="w-3 h-3 opacity-50" /></span>
             </label>

             {/* CLEANUP STRENGTH */}
             <div className="space-y-1">
                <div className="flex justify-between text-gray-400">
                    <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-yellow-400"/> Limpieza Inteligente</span>
                    <span className="text-blue-400 font-mono">{config.cleanupStrength}/10</span>
                </div>
                <input 
                  type="range" min="0" max="10" step="1" 
                  value={config.cleanupStrength}
                  onChange={(e) => updateField('cleanupStrength', parseInt(e.target.value))}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  title="Elimina 'ruido' relativo al tamaño de la capa (0-10)"
                />
             </div>

             {/* SMOOTH EDGES */}
             <div className="space-y-1">
                <div className="flex justify-between text-gray-400">
                    <span className="flex items-center gap-1"><Feather className="w-3 h-3 text-purple-400"/> Suavizado Bordes</span>
                    <span className="text-blue-400 font-mono">{config.smoothEdges}/5</span>
                </div>
                <input 
                  type="range" min="0" max="5" step="1" 
                  value={config.smoothEdges}
                  onChange={(e) => updateField('smoothEdges', parseInt(e.target.value))}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  title="Gaussian Blur para suavizar bordes pixelados"
                />
             </div>

             {/* MIN COVERAGE */}
             <div className="space-y-1">
                <div className="flex justify-between text-gray-400">
                    <span className="flex items-center gap-1"><Ghost className="w-3 h-3 text-red-400"/> Cobertura Mínima</span>
                    <span className="text-blue-400 font-mono">{config.minCoverage.toFixed(1)}%</span>
                </div>
                <input 
                    type="range" min="0" max="5" step="0.1" 
                    value={config.minCoverage}
                    onChange={(e) => updateField('minCoverage', parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    title="Descarta capas que tengan menos del X% de cobertura total"
                />
            </div>
          </div>

          {/* SECCIÓN 3: HALFTONING */}
          <div className="space-y-3 pb-3 border-b border-gray-700">
             <label className="text-gray-400 font-bold uppercase flex items-center gap-1">
                3. Trama (Halftone)
                <span title="Configuración de puntos para serigrafía."><Grid3X3 className="w-3 h-3 opacity-50" /></span>
             </label>

            <div className="flex gap-2 mb-2">
                <button 
                    onClick={() => updateField('halftoneType', 'am')}
                    className={`flex-1 p-1.5 rounded text-[10px] font-bold border ${config.halftoneType === 'am' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                >
                    AM (Punto)
                </button>
                <button 
                    onClick={() => updateField('halftoneType', 'fm')}
                    className={`flex-1 p-1.5 rounded text-[10px] font-bold border ${config.halftoneType === 'fm' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                >
                    FM (Difusión)
                </button>
            </div>

            {config.halftoneType === 'am' && (
                <>
                    <div className="space-y-1">
                        <div className="flex justify-between text-gray-400">
                            <span>LPI (Líneas/Pulgada)</span>
                            <span className="text-blue-400 font-mono">{config.halftoneLpi}</span>
                        </div>
                        
                        <input 
                            type="range" min="15" max="150" step="1" 
                            value={config.halftoneLpi}
                            onChange={(e) => updateField('halftoneLpi', parseInt(e.target.value))}
                            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between text-gray-400">
                            <span>Ángulo (Grados)</span>
                            <span className="text-blue-400 font-mono">{config.halftoneAngle}°</span>
                        </div>
                        <input 
                        type="range" min="0" max="90" step="7.5" 
                        value={config.halftoneAngle}
                        onChange={(e) => updateField('halftoneAngle', parseFloat(e.target.value))}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                </>
            )}
          </div>

          <div className="space-y-1 pt-2">
            <div className="flex justify-between items-center">
              <label className="text-gray-400 font-bold uppercase flex items-center gap-1">
                Opacidad Visual
              </label>
              <span className="text-blue-400 font-mono">{(config.inkOpacity * 100).toFixed(0)}%</span>
            </div>
            <input 
              type="range" min="0" max="1" step="0.01" 
              value={config.inkOpacity}
              onChange={(e) => updateField('inkOpacity', parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedSettings;