import { useState, useEffect, useMemo } from 'react';
import { GradientSettings } from '../types';
import { drawGradientToCanvas } from '../lib/gradient-renderer';

export const useGradientDataUrl = (settings: GradientSettings, width = 200, height = 200) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawGradientToCanvas(ctx, width, height, settings, true);
    setDataUrl(canvas.toDataURL());
  }, [settings, width, height]);

  return dataUrl;
};
