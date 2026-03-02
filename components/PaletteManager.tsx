import React, { useState, useMemo } from 'react';
import { PaletteColor, ProcessingStatus } from '../types';
import Button from './Button';
import { hexToRgb } from '../services/imageProcessing';
import { findClosestPantone } from '../services/pantoneMatcher';
import { Plus, Trash2, RefreshCw, Palette, SlidersHorizontal, GripVertical, Layers, Waves } from 'lucide-react';

interface PaletteManagerProps {
  palette: PaletteColor[];
  setPalette: (colors: PaletteColor[]) => void;
  onAnalyze: (numColors: number) => void;
  status: ProcessingStatus;
  separationType: 'vector' | 'raster';
}

const PaletteManager: React.FC<PaletteManagerProps> = ({ palette, setPalette, onAnalyze, status, separationType }) => {
  const [newColorHex, setNewColorHex] = useState('#000000');
  const [maxColors, setMaxColors] = useState<number>(6);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleToggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const handleRemove = (id: string) => {
    setPalette(palette.filter(c => c.id !== id));
  };

  const handleAdd = () => {
    const rgb = hexToRgb(newColorHex);
    const newColor: PaletteColor = {
      id: `manual-${Date.now()}`,
      hex: newColorHex,
      rgb: rgb,
      locked: true
    };
    setPalette([...palette, newColor]);
  };

  const handleUpdateHex = (id: string, newHex: string) => {
    const updated = palette.map(c => {
      if (c.id === id) {
        return { ...c, hex: newHex, rgb: hexToRgb(newHex) };
      }
      return c;
    });
    setPalette(updated);
  };

  const handleUpdateGradient = (id: string, field: 'gradientMin' | 'gradientMax' | 'gamma', value: number) => {
    const updated = palette.map(c => {
      if (c.id === id) {
        return { ...c, [field]: value };
      }
      return c;
    });
    setPalette(updated);
  };

  const handleToggleUnderbase = (id: string) => {
    const updated = palette.map(c => ({
      ...c,
      // Only the selected ID becomes the underbase; clear it for others
      isUnderbase: c.id === id ? !c.isUnderbase : false
    }));
    setPalette(updated);
  };

  const handleToggleGradient = (id: string) => {
    const updated = palette.map(c => {
      if (c.id === id) {
        return { ...c, useGradient: !c.useGradient };
      }
      return c;
    });
    setPalette(updated);
  };

  const handleClearGradient = (id: string) => {
    const updated = palette.map(c => {
      if (c.id === id) {
        const { gradientMin, gradientMax, gamma, ...rest } = c;
        return rest;
      }
      return c;
    });
    setPalette(updated);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Small delay to allow drag image to render before hiding original
    setTimeout(() => {
      if (e.target instanceof HTMLElement) {
        e.target.style.opacity = '0.5';
      }
    }, 0);
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDragOverIndex(null);
      return;
    }

    const newPalette = [...palette];
    const draggedItem = newPalette[draggedIndex];
    newPalette.splice(draggedIndex, 1);
    newPalette.splice(targetIndex, 0, draggedItem);
    setPalette(newPalette);

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.target instanceof HTMLElement) {
      e.target.style.opacity = '1';
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col shadow-inner">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
          <Palette className="w-4 h-4" /> Tinta / Palette
        </h2>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-900 rounded border border-gray-600 px-2 py-0.5 h-7">
            <span className="text-[9px] text-gray-500 font-bold uppercase mr-2">Max</span>
            <select
              value={maxColors}
              onChange={(e) => setMaxColors(parseInt(e.target.value))}
              className="bg-transparent text-xs font-mono text-blue-400 focus:outline-none cursor-pointer appearance-none text-right font-bold"
              title="Maximum colors to detect"
            >
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                <option key={num} value={num} className="bg-gray-800 text-white">{num}</option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAnalyze(maxColors)}
            isLoading={status === ProcessingStatus.ANALYZING}
            title="Extract dominant colors using K-Means"
            className="text-[10px] py-1 h-7"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Auto
          </Button>
        </div>
      </div>

      <div className="max-h-60 overflow-y-auto space-y-2 pr-2 mb-4 custom-scrollbar">
        {palette.length === 0 && (
          <div className="text-gray-500 text-center py-4 italic text-xs">
            No colors detected.
          </div>
        )}
        {palette.map((color, index) => (
          <div
            key={color.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnter={(e) => handleDragEnter(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`rounded border transition-all ${dragOverIndex === index ? 'border-blue-500 bg-blue-900/30' : 'border-gray-600 bg-gray-750'
              } ${draggedIndex === index ? 'opacity-50 border-dashed' : ''}`}
          >
            <div className="flex items-center gap-2 p-1.5 list-none">
              <div className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-white px-1 -ml-1 flex items-center justify-center shrink-0">
                <GripVertical className="w-4 h-4" />
              </div>
              <div
                className="w-6 h-6 rounded border border-gray-500 shadow-sm shrink-0 relative"
                style={{ backgroundColor: color.hex }}
              >
                {color.isUnderbase && (
                  <div className="absolute -top-1 -right-1 bg-blue-500 rounded-full p-0.5 shadow-sm border border-gray-800">
                    <Layers className="w-2 h-2 text-white" />
                  </div>
                )}
                {color.useGradient && (
                  <div className="absolute -bottom-1 -right-1 bg-purple-500 rounded-full p-0.5 shadow-sm border border-gray-800">
                    <Waves className="w-2 h-2 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <input
                  type="text"
                  value={color.hex}
                  onChange={(e) => handleUpdateHex(color.id, e.target.value)}
                  className="bg-transparent text-[11px] font-mono text-gray-200 focus:outline-none w-full uppercase"
                />
                {(() => {
                  const { match, deltaE } = findClosestPantone(color.hex);
                  let accuracyLabel = "Buena";
                  let accuracyColor = "text-yellow-500/80";

                  if (deltaE <= 2.0) {
                    accuracyLabel = "Exacta";
                    accuracyColor = "text-green-400/90";
                  } else if (deltaE > 5.0) {
                    accuracyLabel = "Aprox.";
                    accuracyColor = "text-orange-400/80";
                  }

                  return (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span title="Pantone Solid Coated" className="text-[9px] font-bold text-gray-400 uppercase tracking-wider bg-gray-800 px-1 py-0.5 rounded border border-gray-600 truncate max-w-[100px]">
                        {match.name}
                      </span>
                      <span title={`Precisión (Delta E 2000: ${deltaE.toFixed(2)})`} className={`text-[8px] font-bold uppercase ${accuracyColor} whitespace-nowrap`}>
                        {accuracyLabel}
                      </span>
                    </div>
                  );
                })()}
              </div>
              <button
                onClick={() => handleToggleUnderbase(color.id)}
                className={`p-1 transition-colors rounded ${color.isUnderbase ? 'text-blue-400 bg-gray-700 border border-blue-500/30' : 'text-gray-500 hover:text-blue-400'}`}
                title={color.isUnderbase ? "Eliminar como Underbase" : "Establecer como Underbase (Base Blanca)"}
              >
                <Layers className="w-3 h-3" />
              </button>
              {separationType === 'raster' && (
                <button
                  onClick={() => handleToggleExpand(color.id)}
                  className={`p-1 transition-colors rounded ${expandedId === color.id ? 'text-blue-400 bg-gray-700' : 'text-gray-500 hover:text-blue-400'}`}
                  title="Gradient Settings"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => handleRemove(color.id)}
                className="text-gray-500 hover:text-red-400 p-1 transition-colors ml-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

            {/* Per-channel gradient controls (Raster only) */}
            {separationType === 'raster' && expandedId === color.id && (
              <div className="px-3 pb-3 pt-1 border-t border-gray-700 space-y-2 animate-in slide-in-from-top-1 duration-150">
                {/* Solid / Gradient Mode Switch */}
                <div className="flex items-center gap-1 mb-2">
                  <button
                    onClick={() => { if (color.useGradient) handleToggleGradient(color.id); }}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${!color.useGradient ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-700'}`}
                  >
                    ■ Sólido
                  </button>
                  <button
                    onClick={() => { if (!color.useGradient) handleToggleGradient(color.id); }}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${color.useGradient ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-700'}`}
                  >
                    <Waves className="w-3 h-3" /> Gradiente
                  </button>
                </div>

                {/* Gradient sliders — only visible when useGradient is true */}
                {color.useGradient && (
                  <>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] text-gray-500 font-bold uppercase">Rango de Captura</span>
                      {(color.gradientMin !== undefined || color.gradientMax !== undefined || color.gamma !== undefined) && (
                        <button
                          onClick={() => handleClearGradient(color.id)}
                          className="text-[9px] text-red-400 hover:text-red-300 uppercase font-bold"
                        >Reset Auto</button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-gray-400">
                        <span className="text-[10px]">Solidez (Min)</span>
                        <span className="text-purple-400 font-mono text-[10px]">{color.gradientMin ?? 'Auto'}</span>
                      </div>
                      <input
                        type="range" min="0" max="100" step="1"
                        value={color.gradientMin ?? 10}
                        onChange={(e) => handleUpdateGradient(color.id, 'gradientMin', parseInt(e.target.value))}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        title="Distancia donde la tinta es 100% sólida"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-gray-400">
                        <span className="text-[10px]">Alcance (Max)</span>
                        <span className="text-purple-400 font-mono text-[10px]">{color.gradientMax ?? 'Auto'}</span>
                      </div>
                      <input
                        type="range" min="5" max="200" step="1"
                        value={color.gradientMax ?? 110}
                        onChange={(e) => handleUpdateGradient(color.id, 'gradientMax', parseInt(e.target.value))}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        title="Distancia donde la tinta desaparece (0% opacidad)"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-gray-400">
                        <span className="text-[10px]">Gamma</span>
                        <span className="text-purple-400 font-mono text-[10px]">{(color.gamma ?? 1.25).toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0.1" max="3.0" step="0.05"
                        value={color.gamma ?? 1.25}
                        onChange={(e) => handleUpdateGradient(color.id, 'gamma', parseFloat(e.target.value))}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        title="Ganancia de la curva del gradiente"
                      />
                    </div>
                  </>
                )}

                {/* Info text when solid mode */}
                {!color.useGradient && (
                  <p className="text-[9px] text-gray-500 italic text-center py-1">
                    Modo Sólido: este color se asigna como ganador absoluto (sin degradado).
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-gray-700">
        <label className="block text-[10px] text-gray-500 mb-2 uppercase font-bold tracking-wider">Add Manual Ink</label>
        <div className="flex gap-2">
          <input
            type="color"
            value={newColorHex}
            onChange={(e) => setNewColorHex(e.target.value)}
            className="h-8 w-8 p-0 border-0 rounded cursor-pointer shrink-0"
          />
          <input
            type="text"
            value={newColorHex}
            onChange={(e) => setNewColorHex(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 text-xs font-mono"
          />
          <Button variant="secondary" onClick={handleAdd} className="px-2 py-1">
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PaletteManager;