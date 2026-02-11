import React, { useRef, useEffect } from 'react';

interface LayerPreviewProps {
  imageData: ImageData | null;
  width: number;
  height: number;
  label?: string;
  tint?: string; 
  onPixelSelect?: (hex: string) => void;
}

const LayerPreview: React.FC<LayerPreviewProps> = ({ imageData, width, height, label, tint, onPixelSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
            // Check alpha channel for ink presence
            // In our system, the python script returns ink in the Alpha channel
            const alpha = src[i+3]; 
            
            d[i] = rT;
            d[i+1] = gT;
            d[i+2] = bT;
            d[i+3] = alpha; 
        }
        ctx.putImageData(tempImg, 0, 0);
    }

  }, [imageData, width, height, tint]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPixelSelect || !imageData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const xDisplay = e.clientX - rect.left;
    const yDisplay = e.clientY - rect.top;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor(xDisplay * scaleX);
    const y = Math.floor(yDisplay * scaleY);
    if (x >= 0 && x < width && y >= 0 && y < height) {
        const index = (y * width + x) * 4;
        const r = imageData.data[index];
        const g = imageData.data[index + 1];
        const b = imageData.data[index + 2];
        const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        onPixelSelect(hex);
    }
  };

  // Determine if the background should be dark for visibility
  // If tint exists and is very light (luminance > 200), use dark background
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

  return (
    <div className={`relative group border border-gray-600 rounded overflow-hidden shadow-sm ${bgStyle}`}>
      {label && (
        <div className="absolute top-0 left-0 bg-black/70 text-white text-[10px] px-2 py-0.5 z-10 font-bold">
          {label}
        </div>
      )}
      <canvas 
        ref={canvasRef} 
        width={width} 
        height={height} 
        onClick={handleCanvasClick}
        className={`w-full h-auto block ${onPixelSelect ? 'cursor-crosshair' : 'cursor-default'}`}
      />
    </div>
  );
};

export default LayerPreview;