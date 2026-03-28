import React, { useRef, useEffect } from 'react';
import { GradientSettings } from '../types';
import { drawGradientToCanvas } from '../lib/gradient-renderer';

interface MiniGradientProps {
  settings: GradientSettings;
  className?: string;
  width?: number;
  height?: number;
}

export const MiniGradient: React.FC<MiniGradientProps> = ({ 
  settings, 
  className,
  width: propWidth = 200,
  height: propHeight = 200
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const ratio = settings.ratio || { width: 1, height: 1 };
  const width = ratio.width >= ratio.height ? propWidth : propWidth * (ratio.width / ratio.height);
  const height = ratio.height >= ratio.width ? propHeight : propHeight * (ratio.height / ratio.width);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    drawGradientToCanvas(ctx, width, height, settings, true);
  }, [settings, width, height]);

  return (
    <canvas 
      ref={canvasRef} 
      className={className}
      style={{ width, height }}
    />
  );
};
