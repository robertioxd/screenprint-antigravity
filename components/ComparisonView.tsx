import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ComparisonViewProps {
  original: ImageData | null;
  composite: ImageData | null;
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ original, composite }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasOriginalRef = useRef<HTMLCanvasElement>(null);
  const canvasCompositeRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);

  // Draw Images to Canvases
  useEffect(() => {
    if (original && canvasOriginalRef.current) {
        const ctx = canvasOriginalRef.current.getContext('2d');
        if (ctx) {
            canvasOriginalRef.current.width = original.width;
            canvasOriginalRef.current.height = original.height;
            ctx.putImageData(original, 0, 0);
        }
    }
    if (composite && canvasCompositeRef.current) {
        const ctx = canvasCompositeRef.current.getContext('2d');
        if (ctx) {
            canvasCompositeRef.current.width = composite.width;
            canvasCompositeRef.current.height = composite.height;
            ctx.putImageData(composite, 0, 0);
        }
    }
  }, [original, composite]);

  const handleMouseDown = () => { isDragging.current = true; };
  const handleMouseUp = () => { isDragging.current = false; };
  
  const handleMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPosition(Math.min(100, Math.max(0, x)));
  }, []);

  useEffect(() => {
    const up = () => handleMouseUp();
    const move = (e: MouseEvent) => handleMouseMove(e);
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', move);
    return () => {
        window.removeEventListener('mouseup', up);
        window.removeEventListener('mousemove', move);
    };
  }, [handleMouseMove]);

  if (!original || !composite) return <div className="text-gray-500 py-12 text-center">No data for comparison</div>;

  return (
    <div className="w-full flex flex-col gap-6">
        <div 
            ref={containerRef}
            className="relative w-full h-[75vh] min-h-[500px] bg-gray-900 rounded-xl border border-gray-700 shadow-2xl overflow-hidden select-none cursor-ew-resize"
            onMouseDown={handleMouseDown}
        >
            {/* Background: Original */}
            <div className="absolute inset-0 flex items-center justify-center p-4">
                <canvas 
                    ref={canvasOriginalRef} 
                    className="max-w-full max-h-full object-contain shadow-lg"
                />
            </div>
            <div className="absolute top-4 left-4 bg-black/70 px-3 py-1.5 rounded-md text-xs text-white z-10 font-bold uppercase tracking-widest border border-white/10">Original</div>

            {/* Foreground: Composite (Clipped) */}
            <div 
                className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white/5"
                style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
            >
                <div className="w-full h-full flex items-center justify-center p-4">
                    <canvas 
                        ref={canvasCompositeRef} 
                        className="max-w-full max-h-full object-contain shadow-lg"
                    />
                </div>
            </div>
            <div 
                className="absolute top-4 right-4 bg-blue-600/90 px-3 py-1.5 rounded-md text-xs text-white z-10 font-bold uppercase tracking-widest border border-white/10"
                style={{ opacity: sliderPosition > 10 ? 1 : 0 }}
            >
                Simulated Composite
            </div>

            {/* Slider Handle */}
            <div 
                className="absolute top-0 bottom-0 w-1 bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)] z-20 flex items-center justify-center"
                style={{ left: `${sliderPosition}%` }}
            >
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center shadow-2xl border-2 border-white/20 transform -translate-x-1/2 cursor-grab active:cursor-grabbing hover:scale-110 transition-transform">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                        <path d="M18 8L22 12L18 16" />
                        <path d="M6 8L2 12L6 16" />
                    </svg>
                </div>
            </div>
        </div>
        <div className="flex justify-between items-center px-2">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">← Original</span>
            <p className="text-center text-xs text-gray-400 italic">
                Drag the blue slider to compare the digital original against the simulated separation result
            </p>
            <span className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Simulation →</span>
        </div>
    </div>
  );
};

export default ComparisonView;