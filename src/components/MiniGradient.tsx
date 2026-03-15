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
  width = 100,
  height = 100
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
