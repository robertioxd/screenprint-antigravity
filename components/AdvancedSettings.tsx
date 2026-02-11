import React from 'react';
import { AdvancedConfig } from '../types';
import { Settings2, Info } from 'lucide-react';

interface AdvancedSettingsProps {
  config: AdvancedConfig;
  onChange: (config: AdvancedConfig) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({ config, onChange, isOpen, onToggle }) => {
  const updateField = (field: keyof AdvancedConfig, value: number) => {
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
          {/* Ink Opacity */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-gray-400 font-bold uppercase flex items-center gap-1">
                Opacidad de Tinta
                <span title="Simula el blending de las tintas sobre el tejido."><Info className="w-3 h-3 opacity-50" /></span>
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

          {/* Sample Size */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-gray-400 font-bold uppercase flex items-center gap-1">
                Muestreo de Píxeles
                <span title="Cantidad de píxeles usados para detectar la paleta."><Info className="w-3 h-3 opacity-50" /></span>
              </label>
              <span className="text-blue-400 font-mono">{config.sampleSize.toLocaleString()}</span>
            </div>
            <input 
              type="range" min="5000" max="100000" step="5000" 
              value={config.sampleSize}
              onChange={(e) => updateField('sampleSize', parseInt(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          {/* CIEDE2000 Coeffs */}
          <div className="space-y-3 pt-2 border-t border-gray-700">
            <h4 className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Factores CIEDE2000</h4>
            
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-gray-400">Sensibilidad L (Luz)</label>
                  <span className="text-blue-400 font-mono">{config.kL.toFixed(1)}</span>
                </div>
                <input 
                  type="range" min="0.1" max="5" step="0.1" 
                  value={config.kL}
                  onChange={(e) => updateField('kL', parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-gray-400">Sensibilidad C (Croma)</label>
                  <span className="text-blue-400 font-mono">{config.kC.toFixed(1)}</span>
                </div>
                <input 
                  type="range" min="0.1" max="5" step="0.1" 
                  value={config.kC}
                  onChange={(e) => updateField('kC', parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-gray-400">Sensibilidad H (Tono)</label>
                  <span className="text-blue-400 font-mono">{config.kH.toFixed(1)}</span>
                </div>
                <input 
                  type="range" min="0.1" max="5" step="0.1" 
                  value={config.kH}
                  onChange={(e) => updateField('kH', parseFloat(e.target.value))}
                  className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedSettings;