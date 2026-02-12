import React, { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Scissors, Link, Edit2, Trash2 } from 'lucide-react';
import { Layer } from '../types';
import LayerPreview from './LayerPreview';
import Button from './Button';

interface LayerDetailModalProps {
  layer: Layer;
  index: number;
  totalLayers: number;
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onAction: (action: 'chop' | 'merge' | 'edit' | 'delete', layer: Layer) => void;
  isHalftone: boolean;
}

const LayerDetailModal: React.FC<LayerDetailModalProps> = ({ 
  layer, 
  index, 
  totalLayers, 
  onClose, 
  onNavigate, 
  onAction,
  isHalftone
}) => {
  
  // Handle Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') onNavigate('prev');
        if (e.key === 'ArrowRight') onNavigate('next');
        if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigate, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 animate-in fade-in duration-200" onClick={onClose}>
        
        {/* Close Button */}
        <div className="absolute top-4 right-4 z-50">
            <button 
                onClick={onClose}
                className="bg-gray-800 text-white p-2 rounded-full hover:bg-gray-700 transition-colors border border-gray-600"
            >
                <X className="w-6 h-6" />
            </button>
        </div>

        {/* Navigation Arrows */}
        <button 
            onClick={(e) => { e.stopPropagation(); onNavigate('prev'); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-gray-800/80 p-3 rounded-full hover:bg-gray-700 text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-gray-700 hover:border-blue-500"
            disabled={index === 0}
        >
            <ChevronLeft className="w-8 h-8" />
        </button>
        
        <button 
            onClick={(e) => { e.stopPropagation(); onNavigate('next'); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-gray-800/80 p-3 rounded-full hover:bg-gray-700 text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-gray-700 hover:border-blue-500"
            disabled={index === totalLayers - 1}
        >
            <ChevronRight className="w-8 h-8" />
        </button>

        {/* Main Content */}
        <div className="flex flex-col items-center gap-6 max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            
            {/* Header Info */}
            <div className="flex flex-col items-center gap-2">
                 <div className="flex items-center gap-3 bg-gray-800 px-5 py-2 rounded-full border border-gray-600 shadow-xl">
                    <div className="w-6 h-6 rounded-full shadow-sm ring-2 ring-white/20" style={{backgroundColor: layer.color.hex}}></div>
                    <div className="flex flex-col text-center">
                        <span className="text-white font-bold text-lg tracking-widest font-mono">{layer.color.hex}</span>
                        <span className="text-gray-400 text-[10px] uppercase font-bold">Layer {index + 1} of {totalLayers}</span>
                    </div>
                 </div>
            </div>

            {/* Canvas Preview */}
            <div className="relative max-h-[60vh] w-auto aspect-auto bg-white/5 rounded shadow-2xl border border-gray-700 overflow-hidden">
                <LayerPreview 
                    imageData={layer.data} 
                    width={layer.data.width} 
                    height={layer.data.height}
                    tint={!isHalftone ? layer.color.hex : undefined}
                    className="max-h-[60vh] w-auto"
                />
            </div>

            {/* Action Toolbar */}
            <div className="grid grid-cols-4 gap-4 w-full max-w-2xl mt-2">
                <div className="flex flex-col gap-1">
                    <Button 
                        variant="primary" 
                        onClick={() => onAction('chop', layer)}
                        className="flex flex-col py-4 h-auto gap-2 border-b-4 border-blue-800 hover:border-blue-900"
                    >
                        <Scissors className="w-6 h-6" />
                        <span className="text-xs font-bold uppercase tracking-wider">Chop</span>
                    </Button>
                    <span className="text-[10px] text-gray-500 text-center">Split into sublayers</span>
                </div>

                <div className="flex flex-col gap-1">
                    <Button 
                        variant="primary"
                        onClick={() => onAction('merge', layer)}
                        className="flex flex-col py-4 h-auto gap-2 bg-indigo-600 hover:bg-indigo-700 border-b-4 border-indigo-800 hover:border-indigo-900"
                    >
                        <Link className="w-6 h-6" />
                        <span className="text-xs font-bold uppercase tracking-wider">Merge</span>
                    </Button>
                     <span className="text-[10px] text-gray-500 text-center">Combine with others</span>
                </div>

                <div className="flex flex-col gap-1">
                    <Button 
                        variant="primary"
                        onClick={() => onAction('edit', layer)}
                        className="flex flex-col py-4 h-auto gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 border-b-4 border-fuchsia-800 hover:border-fuchsia-900"
                    >
                        <Edit2 className="w-6 h-6" />
                        <span className="text-xs font-bold uppercase tracking-wider">Edit</span>
                    </Button>
                     <span className="text-[10px] text-gray-500 text-center">Change Color</span>
                </div>

                <div className="flex flex-col gap-1">
                    <Button 
                        variant="danger"
                        onClick={() => onAction('delete', layer)}
                        className="flex flex-col py-4 h-auto gap-2 border-b-4 border-red-800 hover:border-red-900"
                    >
                        <Trash2 className="w-6 h-6" />
                        <span className="text-xs font-bold uppercase tracking-wider">Delete</span>
                    </Button>
                     <span className="text-[10px] text-gray-500 text-center">Remove Channel</span>
                </div>
            </div>

        </div>
    </div>
  );
};

export default LayerDetailModal;