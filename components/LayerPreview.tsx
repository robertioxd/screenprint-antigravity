import React, { useRef, useEffect, useState, memo } from 'react';

interface LayerPreviewProps {
  imageData: ImageData | null;
  width: number;
  height: number;
  label?: string;
  tint?: string; 
  onPixelSelect?: (hex: string) => void;
  className?: string;
  fitContain?: boolean;
}

interface LoupeState {
  visible: boolean;
  x: number; // Screen X
  y: number; // Screen Y
  pixelX: number; // Image X
  pixelY: number; // Image Y
  hex: string;
}

const LayerPreview: React.FC<LayerPreviewProps> = memo(({ imageData, width, height, label, tint, onPixelSelect, className, fitContain }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [loupe, setLoupe] = useState<LoupeState>({ visible: false, x: 0, y: 0, pixelX: 0, pixelY: 0, hex: '' });

  // Main Canvas Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!tint) {
        ctx.putImageData(imageData, 0, 0);
    } else {
        const tempImg = ctx.createImageData(width, height);
        const d = tempImg.data;
        const src = imageData.data;
        
        const rT = parseInt(tint.slice(1, 3), 16);
        const gT = parseInt(tint.slice(3, 5), 16);
        const bT = parseInt(tint.slice(5, 7), 16);

        for(let i=0; i<src.length; i+=4) {
            const alpha = src[i+3]; 
            d[i] = rT;
            d[i+1] = gT;
            d[i+2] = bT;
            d[i+3] = alpha; 
        }
        ctx.putImageData(tempImg, 0, 0);
    }
  }, [imageData, width, height, tint]);

  // Loupe Drawing Logic
  useEffect(() => {
    if (!loupe.visible || !onPixelSelect || !imageData || !loupeCanvasRef.current) return;
    
    const ctx = loupeCanvasRef.current.getContext('2d');
    if (!ctx) return;

    // Config
    const zoom = 16; // Magnification factor
    const gridSize = 11; // 11x11 pixels shown
    const halfGrid = Math.floor(gridSize / 2);
    
    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw zoomed pixels
    for (let dy = -halfGrid; dy <= halfGrid; dy++) {
      for (let dx = -halfGrid; dx <= halfGrid; dx++) {
        // Clamp coordinates to stay within image bounds
        const px = Math.min(width - 1, Math.max(0, loupe.pixelX + dx));
        const py = Math.min(height - 1, Math.max(0, loupe.pixelY + dy));

        if (px >= 0 && px < width && py >= 0 && py < height) {
           const idx = (py * width + px) * 4;
           const r = imageData.data[idx];
           const g = imageData.data[idx+1];
           const b = imageData.data[idx+2];
           
           ctx.fillStyle = `rgb(${r},${g},${b})`;
           ctx.fillRect(
             (dx + halfGrid) * zoom, 
             (dy + halfGrid) * zoom, 
             zoom, 
             zoom
           );
        }
      }
    }

    // Draw Reticle (Center highlight)
    const centerStart = halfGrid * zoom;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(centerStart, centerStart, zoom, zoom);
    
    // Inner contrast stroke
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.strokeRect(centerStart + 1, centerStart + 1, zoom - 2, zoom - 2);

  }, [loupe, imageData, width, height, onPixelSelect]);


  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPixelSelect || !imageData) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const xDisplay = e.clientX - rect.left;
    const yDisplay = e.clientY - rect.top;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Precise integer pixel coordinate
    const px = Math.floor(xDisplay * scaleX);
    const py = Math.floor(yDisplay * scaleY);

    if (px >= 0 && px < width && py >= 0 && py < height) {
        const index = (py * width + px) * 4;
        const r = imageData.data[index];
        const g = imageData.data[index + 1];
        const b = imageData.data[index + 2];
        const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        
        setLoupe({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            pixelX: px,
            pixelY: py,
            hex: hex
        });
    } else {
        setLoupe(prev => ({ ...prev, visible: false }));
    }
  };

  const handleMouseLeave = () => {
    setLoupe(prev => ({ ...prev, visible: false }));
  };

  const handleCanvasClick = () => {
    if (onPixelSelect && loupe.visible) {
        onPixelSelect(loupe.hex);
    }
  };

  // Determine background style
  let useDarkBg = false;
  if (tint) {
    const r = parseInt(tint.slice(1, 3), 16);
    const g = parseInt(tint.slice(3, 5), 16);
    const b = parseInt(tint.slice(5, 7), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luminance > 180) useDarkBg = true;
  }

  const bgStyle = useDarkBg 
    ? "bg-gray-800" 
    : "bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')] bg-white";

  const containerClasses = fitContain 
    ? `relative group border border-gray-600 rounded overflow-hidden shadow-sm ${bgStyle} flex items-center justify-center ${className || ''}`
    : `relative group border border-gray-600 rounded overflow-hidden shadow-sm ${bgStyle} ${className || ''}`;

  // Changed to 'cursor-crosshair' for better precision when picking
  const cursorClass = onPixelSelect ? 'cursor-crosshair' : 'cursor-default';

  const canvasClasses = fitContain
    ? `max-w-full max-h-full w-auto h-auto block ${cursorClass}`
    : `w-full h-auto block ${cursorClass}`;

  return (
    <>
        <div className={containerClasses}>
          {label && (
            <div className="absolute top-0 left-0 bg-black/70 text-white text-[10px] px-2 py-0.5 z-10 font-bold">
              {label}
            </div>
          )}
          <canvas 
            ref={canvasRef} 
            width={width} 
            height={height} 
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleCanvasClick}
            className={canvasClasses} 
          />
        </div>

        {/* PRECISION LOUPE */}
        {onPixelSelect && loupe.visible && (
            <div 
                className="fixed z-50 pointer-events-none flex flex-col items-center gap-1"
                style={{ 
                    // Centered on cursor: 
                    // left = x - half_width (w-28 = 112px, half = 56px)
                    // top = y - half_height (h-28 = 112px, half = 56px)
                    left: loupe.x - 56, 
                    top: loupe.y - 56, 
                }}
            >
                <div className="relative w-28 h-28 rounded-full border-4 border-white shadow-[0_10px_25px_-5px_rgba(0,0,0,0.5)] overflow-hidden bg-black">
                    <canvas 
                        ref={loupeCanvasRef}
                        width={176} // 11 pixels * 16 zoom
                        height={176}
                        className="w-full h-full object-cover"
                        style={{ imageRendering: 'pixelated' }}
                    />
                     {/* Crosshair Overlay in Loupe */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-30">
                        <div className="w-full h-px bg-white absolute"></div>
                        <div className="h-full w-px bg-white absolute"></div>
                    </div>
                </div>
                
                <div className="bg-gray-900 text-white text-xs font-mono font-bold px-2 py-1 rounded border border-gray-600 shadow-lg flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border border-gray-500" style={{ backgroundColor: loupe.hex }}></div>
                    {loupe.hex.toUpperCase()}
                </div>
            </div>
        )}
    </>
  );
});

export default LayerPreview;