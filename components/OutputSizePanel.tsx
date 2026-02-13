import React, { useMemo } from 'react';
import { Ruler, ScanLine, ArrowRightLeft, ArrowUpDown } from 'lucide-react';
import { AdvancedConfig } from '../types';

interface OutputSizePanelProps {
  config: AdvancedConfig;
  onChange: (config: AdvancedConfig) => void;
  originalWidth: number;
  originalHeight: number;
}

const OutputSizePanel: React.FC<OutputSizePanelProps> = ({ config, onChange, originalWidth, originalHeight }) => {
  const aspectRatio = originalWidth / originalHeight;

  const updateField = (field: keyof AdvancedConfig, value: number | string) => {
    onChange({ ...config, [field]: value });
  };

  const calculatedDims = useMemo(() => {
    let w, h;
    if (config.outputMeasurement === 'width') {
        w = Math.round(config.outputSizeInches * config.outputDpi);
        h = Math.round(w / aspectRatio);
    } else {
        h = Math.round(config.outputSizeInches * config.outputDpi);
        w = Math.round(h * aspectRatio);
    }
    return { w, h };
  }, [config.outputSizeInches, config.outputDpi, config.outputMeasurement, aspectRatio]);

  return (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col shadow-inner space-y-3">
        <div className="flex justify-between items-center border-b border-gray-700 pb-2">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Ruler className="w-4 h-4"/> Salida / Output
            </h2>
            <div className="text-[10px] text-blue-400 font-mono font-bold bg-blue-900/30 px-2 py-0.5 rounded">
                {calculatedDims.w} x {calculatedDims.h} px
            </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
            {/* Dimension Input */}
            <div className="space-y-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase flex justify-between">
                    <span>Tamaño (Inches)</span>
                    <button 
                        onClick={() => updateField('outputMeasurement', config.outputMeasurement === 'width' ? 'height' : 'width')}
                        className="text-blue-400 hover:text-white transition-colors"
                        title="Toggle Width/Height"
                    >
                        {config.outputMeasurement === 'width' ? <ArrowRightLeft size={12}/> : <ArrowUpDown size={12}/>}
                    </button>
                </label>
                <div className="flex items-center bg-gray-900 rounded border border-gray-600 px-2 h-8">
                    <span className="text-xs text-gray-400 mr-2 font-bold w-4">{config.outputMeasurement === 'width' ? 'W' : 'H'}</span>
                    <input 
                        type="number" 
                        min="1" 
                        max="100" 
                        step="0.5"
                        value={config.outputSizeInches} 
                        onChange={(e) => updateField('outputSizeInches', parseFloat(e.target.value))}
                        className="bg-transparent text-sm font-mono text-white focus:outline-none w-full text-right"
                    />
                    <span className="text-[10px] text-gray-500 ml-1">in</span>
                </div>
            </div>

            {/* DPI Input */}
            <div className="space-y-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase">Resolución (DPI)</label>
                <div className="flex items-center bg-gray-900 rounded border border-gray-600 px-2 h-8">
                    <ScanLine size={14} className="text-gray-400 mr-2"/>
                    <input 
                        type="number" 
                        min="72" 
                        max="1200" 
                        step="10"
                        value={config.outputDpi} 
                        onChange={(e) => updateField('outputDpi', parseInt(e.target.value))}
                        className="bg-transparent text-sm font-mono text-white focus:outline-none w-full text-right"
                    />
                </div>
            </div>
        </div>

        <div className="text-[10px] text-gray-500 flex justify-between px-1">
             <span>Aspect Ratio:</span>
             <span className="font-mono text-gray-300">{(aspectRatio).toFixed(2)} : 1</span>
        </div>
    </div>
  );
};

export default OutputSizePanel;