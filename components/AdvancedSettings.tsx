import React from 'react';
import { AdvancedConfig } from '../types';
import { Settings2, Info, Calculator, Eye, Layers, Image as ImageIcon, Eraser, Scissors, Grid3X3, Sun, Wand2, Ghost, Sparkles, Feather, Droplets, Zap } from 'lucide-react';

interface AdvancedSettingsProps {
  config: AdvancedConfig;
  onChange: (config: AdvancedConfig) => void;
  isOpen: boolean;
  onToggle: () => void;
  onAIAnalyze?: () => void;
  aiLoading?: boolean;
  hasImage?: boolean;
}

const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({ config, onChange, isOpen, onToggle, onAIAnalyze, aiLoading, hasImage }) => {
  const updateField = (field: keyof AdvancedConfig, value: any) => {
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
        <div className="p-3 space-y-4 border-t border-gray-700 text-xs">

          {/* AI Auto-Config Button */}
          {onAIAnalyze && (
            <button
              onClick={onAIAnalyze}
              disabled={aiLoading || !hasImage}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-all duration-300 ${aiLoading
                ? 'bg-gray-700 text-gray-400 cursor-wait'
                : !hasImage
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-500 hover:from-purple-500 hover:via-blue-500 hover:to-cyan-400 text-white shadow-lg shadow-purple-900/30 hover:shadow-purple-800/50'
                }`}
            >
              <Zap className={`w-4 h-4 ${aiLoading ? 'animate-pulse' : ''}`} />
              {aiLoading ? 'Analizando con IA...' : '✨ AI Auto-Config'}
            </button>
          )}

          {/* SECCIÓN 0: PRE-PROCESAMIENTO */}
          <div className="space-y-4 pb-3 border-b border-gray-700">
            <label className="text-gray-400 font-bold uppercase flex items-center gap-1">
              Pre-procesamiento (Denoise)
              <span title="Filtro Bilateral: Suaviza ruido conservando bordes"><Droplets className="w-3 h-3 opacity-50" /></span>
            </label>

            <div className="space-y-1">
              <div className="flex justify-between text-gray-400">
                <span className="text-[10px]">Intensidad Color (SigmaColor)</span>
                <span className="text-blue-400 font-mono text-[10px]">{config.denoiseStrength}</span>
              </div>
              <input
                type="range" min="0" max="100" step="5"
                value={config.denoiseStrength}
                onChange={(e) => updateField('denoiseStrength', parseInt(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                title="Cuánto se mezclan colores similares. Valores altos = efecto cartoon."
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-gray-400">
                <span className="text-[10px]">Espacio (SigmaSpace)</span>
                <span className="text-blue-400 font-mono text-[10px]">{config.denoiseSpatial}</span>
              </div>
              <input
                type="range" min="0" max="20" step="1"
                value={config.denoiseSpatial}
                onChange={(e) => updateField('denoiseSpatial', parseInt(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                title="Distancia de mezcla. Valores altos afectan áreas más grandes."
              />
            </div>
          </div>

          {/* SECCIÓN 1: MOTOR DE SEPARACIÓN */}
          <div className="space-y-2 pb-3 border-b border-gray-700">
            <label className="text-gray-400 font-bold uppercase flex items-center gap-1">
              1. Configuración Específica
            </label>

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
                {config.useVectorAntiAliasing && (
                  <div className="mt-2 pl-5 space-y-2 border-l-2 border-gray-700 ml-1">
                    <div className="space-y-1">
                      <div className="flex justify-between text-gray-400">
                        <span className="text-[10px]">AA Radius (Sigma)</span>
                        <span className="text-blue-400 font-mono text-[10px]">{config.vectorAASigma}</span>
                      </div>
                      <input
                        type="range" min="0.1" max="5.0" step="0.1"
                        value={config.vectorAASigma}
                        onChange={(e) => updateField('vectorAASigma', parseFloat(e.target.value))}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-gray-400">
                        <span className="text-[10px]">AA Threshold (Cutoff)</span>
                        <span className="text-blue-400 font-mono text-[10px]">{config.vectorAAThreshold}</span>
                      </div>
                      <input
                        type="range" min="1" max="254" step="1"
                        value={config.vectorAAThreshold}
                        onChange={(e) => updateField('vectorAAThreshold', parseInt(e.target.value))}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {config.separationType === 'raster' && (
              <div className="bg-gray-800 p-2 rounded border border-gray-700 mb-2 space-y-3">
                {/* Spot Hardness */}
                <div className="space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span className="text-[10px]">Spot Hardness</span>
                    <span className="text-blue-400 font-mono text-[10px]">{(config.spotHardness ?? 0.5).toFixed(2)}</span>
                  </div>
                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={config.spotHardness ?? 0.5}
                    onChange={(e) => updateField('spotHardness', parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    title="0 = fotográfico, 1 = duro vectorial"
                  />
                </div>

                {/* Blend Levels (Singles, Pairs, Triplets, Quads+) */}
                <div className="space-y-2 bg-gray-900/50 p-2 rounded border border-gray-700">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Niveles de Mezcla (Blend Levels)</span>

                  {[
                    { key: 0, label: 'Singles', color: 'text-blue-400', accent: 'accent-blue-500' },
                    { key: 1, label: 'Pairs', color: 'text-green-400', accent: 'accent-green-500' },
                    { key: 2, label: 'Triplets', color: 'text-yellow-400', accent: 'accent-yellow-500' },
                    { key: 3, label: 'Quads+', color: 'text-orange-400', accent: 'accent-orange-500' }
                  ].map(({ key, label, color, accent }) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between items-center text-gray-400">
                        <label className="flex items-center gap-2 text-[10px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.blendEnabled[key]}
                            onChange={(e) => {
                              const newArr = [...config.blendEnabled] as [boolean, boolean, boolean, boolean];
                              newArr[key] = e.target.checked;
                              updateField('blendEnabled', newArr);
                            }}
                            className="rounded bg-gray-700 border-gray-600 outline-none accent-blue-500"
                          />
                          <span className={color}>{label}</span>
                        </label>
                        <span className="font-mono text-[9px]">{(config.blendTolerances[key] ?? 0).toFixed(3)}</span>
                      </div>
                      <input
                        type="range" min="0" max="0.5" step="0.005"
                        disabled={!config.blendEnabled[key]}
                        value={config.blendTolerances[key] ?? 0}
                        onChange={(e) => {
                          const newArr = [...config.blendTolerances] as [number, number, number, number];
                          newArr[key] = parseFloat(e.target.value);
                          updateField('blendTolerances', newArr);
                        }}
                        className={`w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer ${accent} ${!config.blendEnabled[key] ? 'opacity-30' : ''}`}
                      />
                    </div>
                  ))}
                </div>

                {/* Alpha Edge Mask */}
                <div className="space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span className="text-[10px]">Fuerza Alpha Edge</span>
                    <span className="text-purple-400 font-mono text-[10px]">{(config.alphaStrength ?? 1.0).toFixed(2)}</span>
                  </div>
                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={config.alphaStrength ?? 1.0}
                    onChange={(e) => updateField('alphaStrength', parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                {/* Alpha Threshold */}
                <div className="space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span className="text-[10px]">Umbral Alpha</span>
                    <span className="text-purple-400 font-mono text-[10px]">{(config.alphaThreshold ?? 0.05).toFixed(2)}</span>
                  </div>
                  <input
                    type="range" min="0" max="0.1" step="0.01"
                    value={config.alphaThreshold ?? 0.05}
                    onChange={(e) => updateField('alphaThreshold', parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                {/* Underbase Strength */}
                <div className="space-y-1 border-t border-gray-700 pt-2 mt-2">
                  <div className="flex justify-between text-gray-400">
                    <span className="text-[10px] flex items-center gap-1"><Layers className="w-3 h-3 text-orange-400" /> UB Fuerza</span>
                    <span className="text-orange-400 font-mono text-[10px]">{(config.ubStrength ?? 1.0).toFixed(2)}</span>
                  </div>
                  <input
                    type="range" min="0" max="2" step="0.05"
                    value={config.ubStrength ?? 1.0}
                    onChange={(e) => updateField('ubStrength', parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>

                {/* Underbase Gamma */}
                <div className="space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span className="text-[10px]">UB Gamma</span>
                    <span className="text-orange-400 font-mono text-[10px]">{(config.ubGamma ?? 1.5).toFixed(2)}</span>
                  </div>
                  <input
                    type="range" min="0.1" max="3.0" step="0.1"
                    value={config.ubGamma ?? 1.5}
                    onChange={(e) => updateField('ubGamma', parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>
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
                <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-yellow-400" /> Limpieza Inteligente</span>
                <span className="text-blue-400 font-mono">{config.cleanupStrength}/30</span>
              </div>
              <input
                type="range" min="0" max="30" step="1"
                value={config.cleanupStrength}
                onChange={(e) => updateField('cleanupStrength', parseInt(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                title="Elimina 'ruido' relativo al tamaño de la capa (0-10)"
              />
            </div>

            {/* SMOOTH EDGES */}
            <div className="space-y-1">
              <div className="flex justify-between text-gray-400">
                <span className="flex items-center gap-1"><Feather className="w-3 h-3 text-purple-400" /> Suavizado Bordes</span>
                <span className="text-blue-400 font-mono">{config.smoothEdges}/15</span>
              </div>
              <input
                type="range" min="0" max="15" step="1"
                value={config.smoothEdges}
                onChange={(e) => updateField('smoothEdges', parseInt(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                title="Gaussian Blur para suavizar bordes pixelados"
              />
            </div>

            {/* MIN COVERAGE */}
            <div className="space-y-1">
              <div className="flex justify-between text-gray-400">
                <span className="flex items-center gap-1"><Ghost className="w-3 h-3 text-red-400" /> Cobertura Mínima</span>
                <span className="text-blue-400 font-mono">{((config.minCoverage ?? 0.2)).toFixed(1)}%</span>
              </div>
              <input
                type="range" min="0" max="5" step="0.1"
                value={config.minCoverage ?? 0.2}
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

          {/* SECCIÓN 4: BASE BLANCA (UNDERBASE) */}
          <div className="space-y-3 pb-3 border-b border-gray-700">
            <label className="text-gray-400 font-bold uppercase flex items-center gap-1">
              4. Underbase (Base Blanca)
              <span title="Configuración de la capa base para prendas oscuras"><Layers className="w-3 h-3 opacity-50" /></span>
            </label>
            <div className="space-y-1">
              <div className="flex justify-between text-gray-400">
                <span className="text-[10px]">Choke (Erosión interior)</span>
                <span className="text-blue-400 font-mono text-[10px]">{config.underbaseChoke} px</span>
              </div>
              <input
                type="range" min="0" max="5" step="1"
                value={config.underbaseChoke}
                onChange={(e) => updateField('underbaseChoke', parseInt(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                title="Reduce el tamaño del underbase para evitar bordes blancos (1-2px recomendado)"
              />
            </div>
            <div className="space-y-1 mt-3">
              <div className="flex justify-between items-center text-gray-400">
                <span className="text-[10px]">Color de Previsualización</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.underbaseColorHex || '#FFFFFF'}
                    onChange={(e) => updateField('underbaseColorHex', e.target.value)}
                    className="h-5 w-5 p-0 border-0 rounded cursor-pointer shrink-0"
                    title="Color del Underbase (ej. Blanco, Gris, etc.)"
                  />
                  <span className="text-blue-400 font-mono text-[10px] uppercase">{config.underbaseColorHex || '#FFFFFF'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1 pt-2">
            <div className="flex justify-between items-center">
              <label className="text-gray-400 font-bold uppercase flex items-center gap-1">
                Opacidad Visual
              </label>
              <span className="text-blue-400 font-mono">{((config.inkOpacity ?? 0.90) * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.01"
              value={config.inkOpacity ?? 0.90}
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