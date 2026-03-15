import React, { useRef, useEffect, useState } from 'react';
import { Pipette, X } from 'lucide-react';

interface ImageColorPickerProps {
  imageUrl: string;
  onColorPick: (color: string) => void;
  onClose: () => void;
  mode?: 'point' | 'background';
}

export const ImageColorPicker: React.FC<ImageColorPickerProps> = ({ imageUrl, onColorPick, onClose, mode = 'point' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);
  const [hoverColor, setHoverColor] = useState<string>('#ffffff');

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const maxWidth = 500;
      const maxHeight = 400;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (maxHeight / height) * width;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x: e.clientX, y: e.clientY });

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const pixelX = x * scaleX;
    const pixelY = y * scaleY;

    const pixel = ctx.getImageData(pixelX, pixelY, 1, 1).data;
    const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`;
    setHoverColor(hex);

    // Update magnifier canvas
    const magCanvas = magnifierCanvasRef.current;
    if (magCanvas) {
      const magCtx = magCanvas.getContext('2d', { alpha: false });
      if (magCtx) {
        magCtx.imageSmoothingEnabled = false;
        const size = 10; // 10x10 pixels area
        const zoom = 10; // 10x zoom
        magCanvas.width = size * zoom;
        magCanvas.height = size * zoom;
        
        magCtx.clearRect(0, 0, magCanvas.width, magCanvas.height);
        magCtx.drawImage(
          canvas,
          pixelX - size / 2, pixelY - size / 2, size, size,
          0, 0, magCanvas.width, magCanvas.height
        );
        
        // Draw crosshair in magnifier
        magCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        magCtx.lineWidth = 1;
        magCtx.strokeRect(magCanvas.width / 2 - zoom / 2, magCanvas.height / 2 - zoom / 2, zoom, zoom);
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const pixel = ctx.getImageData(x * scaleX, y * scaleY, 1, 1).data;
    const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`;
    onColorPick(hex);
  };

  return (
    <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="p-4 border-bottom border-neutral-100 flex items-center justify-between bg-neutral-50">
        <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 uppercase tracking-wider">
          <Pipette size={16} className="text-indigo-600" />
          Color Picker
        </div>
        <button 
          onClick={onClose}
          className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-4 flex flex-col items-center gap-4">
        <div 
          className="relative cursor-none rounded-xl overflow-hidden border border-neutral-200 shadow-inner group"
          onPointerLeave={() => setMousePos(null)}
        >
          <canvas 
            ref={canvasRef} 
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            className="block max-w-full h-auto"
          />
          
          {/* Magnifier Overlay */}
          {mousePos && (
            <div 
              className="fixed pointer-events-none z-[100] flex flex-col items-center gap-2"
              style={{ 
                left: mousePos.x, 
                top: mousePos.y,
                transform: 'translate(-50%, -120%)'
              }}
            >
              <div className="relative p-1 bg-white rounded-lg shadow-2xl border border-neutral-200">
                <canvas 
                  ref={magnifierCanvasRef}
                  className="rounded-md border border-neutral-100"
                  style={{ width: 100, height: 100 }}
                />
                <div 
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-r border-b border-neutral-200 rotate-45"
                />
              </div>
              <div className="px-2 py-1 bg-neutral-900 text-white text-[10px] font-mono rounded-md shadow-lg flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hoverColor }} />
                {hoverColor.toUpperCase()}
              </div>
            </div>
          )}

          <div className="absolute inset-0 pointer-events-none border-2 border-transparent group-hover:border-indigo-500/30 transition-colors" />
        </div>
        <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest text-center">
          {mode === 'background' ? 'Click to set as background color' : 'Click to add as new color point'}
        </p>
      </div>
    </div>
  );
};
