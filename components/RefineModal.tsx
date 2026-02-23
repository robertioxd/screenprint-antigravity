import React, { useState } from 'react';
import { X, Sparkles, Eraser, Feather, Target } from 'lucide-react';
import { Layer } from '../types';
import Button from './Button';
import DonutSpinner from './DonutSpinner';

interface RefineModalProps {
    layer: Layer;
    onClose: () => void;
    onApply: (params: RefineParams) => Promise<void>;
}

export interface RefineParams {
    chokeSpread: number;
    cleanupStrength: number;
    fillHoles: number;
    despeckleArea: number;
    smoothEdges: number;
}

const RefineModal: React.FC<RefineModalProps> = ({ layer, onClose, onApply }) => {
    const [params, setParams] = useState<RefineParams>({
        chokeSpread: 0,
        cleanupStrength: 0,
        fillHoles: 0,
        despeckleArea: 50,
        smoothEdges: 0,
    });
    const [isProcessing, setIsProcessing] = useState(false);

    const handleApply = async () => {
        setIsProcessing(true);
        try {
            await onApply(params);
        } finally {
            setIsProcessing(false);
        }
    };

    const update = (field: keyof RefineParams, value: number) => {
        setParams(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full ring-2 ring-white/20" style={{ backgroundColor: layer.color.hex }}></div>
                        <h2 className="text-white font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-400" /> Refine Channel
                        </h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Description */}
                <div className="px-5 py-3 bg-gray-800/50 border-b border-gray-700">
                    <p className="text-gray-400 text-xs leading-relaxed">
                        Ajusta la limpieza <strong className="text-white">solo para este canal</strong> sin afectar los demás.
                        Ideal para eliminar ruido "sal y pimienta" de un canal ruidoso.
                    </p>
                </div>

                {/* Sliders */}
                <div className="px-5 py-5 space-y-5">
                    {/* Limpieza Inteligente */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-gray-300 font-bold uppercase tracking-wider flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-blue-400" /> Limpieza Inteligente
                            </label>
                            <span className="text-blue-400 font-mono text-xs font-bold">{params.cleanupStrength}</span>
                        </div>
                        <input
                            type="range" min="0" max="30" step="1"
                            value={params.cleanupStrength}
                            onChange={(e) => update('cleanupStrength', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <p className="text-[10px] text-gray-500">Operación Open/Close conservando densidad. Borra ruido fino sin engrosar.</p>
                    </div>

                    {/* Choke / Spread */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-gray-300 font-bold uppercase tracking-wider flex items-center gap-2">
                                <Eraser className="w-3.5 h-3.5 text-blue-400" /> Grosor de Tinta
                            </label>
                            <span className="text-blue-400 font-mono text-xs font-bold">{params.chokeSpread > 0 ? '+' : ''}{params.chokeSpread}</span>
                        </div>
                        <input
                            type="range" min="-15" max="15" step="1"
                            value={params.chokeSpread}
                            onChange={(e) => update('chokeSpread', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <div className="flex justify-between w-full px-1">
                            <span className="text-[9px] text-gray-500 uppercase">Reducir (Choke)</span>
                            <span className="text-[9px] text-gray-500 uppercase">Engrosar (Spread)</span>
                        </div>
                    </div>

                    {/* Fill Holes */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-gray-300 font-bold uppercase tracking-wider flex items-center gap-2">
                                <Target className="w-3.5 h-3.5 text-purple-400" /> Rellenar Huecos
                            </label>
                            <span className="text-purple-400 font-mono text-xs font-bold">{params.fillHoles}</span>
                        </div>
                        <input
                            type="range" min="0" max="30" step="1"
                            value={params.fillHoles}
                            onChange={(e) => update('fillHoles', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                        <p className="text-[10px] text-gray-500">Cierra huecos y líneas rotas. Útil antes del Despeckle.</p>
                    </div>

                    {/* Despeckle Area */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-gray-300 font-bold uppercase tracking-wider flex items-center gap-2">
                                <Target className="w-3.5 h-3.5 text-amber-400" /> Despeckle (Área Mín.)
                            </label>
                            <span className="text-amber-400 font-mono text-xs font-bold">{params.despeckleArea}px</span>
                        </div>
                        <input
                            type="range" min="0" max="500" step="10"
                            value={params.despeckleArea}
                            onChange={(e) => update('despeckleArea', parseInt(e.target.value))}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <p className="text-[10px] text-gray-500">Elimina blobs aislados menores a este tamaño (en píxeles). Preserva formas coherentes.</p>
                    </div>

                    {/* Smooth Edges */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-gray-300 font-bold uppercase tracking-wider flex items-center gap-2">
                                <Feather className="w-3.5 h-3.5 text-emerald-400" /> Suavizar Bordes
                            </label>
                            <span className="text-emerald-400 font-mono text-xs font-bold">{params.smoothEdges}</span>
                        </div>
                        <input
                            type="range" min="0" max="15" step="1"
                            value={params.smoothEdges}
                            onChange={(e) => update('smoothEdges', parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <p className="text-[10px] text-gray-500">Gaussian blur en los bordes del canal. Produce transiciones suaves.</p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="px-5 py-4 border-t border-gray-700 flex gap-3">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        className="flex-1"
                        disabled={isProcessing}
                    >
                        Cancelar
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleApply}
                        isLoading={isProcessing}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 border-b-4 border-amber-800"
                        disabled={isProcessing}
                    >
                        {isProcessing ? (
                            <><DonutSpinner size={16} /> Procesando...</>
                        ) : (
                            <><Sparkles className="w-4 h-4" /> Aplicar Refine</>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default RefineModal;
