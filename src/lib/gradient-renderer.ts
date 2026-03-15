
export const parseColor = (color: string) => {
  // Handle hex
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return { r, g, b };
  }
  // Handle hsl/rgb via browser parsing (fallback)
  const temp = document.createElement('div');
  temp.style.color = color;
  document.body.appendChild(temp);
  const style = window.getComputedStyle(temp).color;
  document.body.removeChild(temp);
  const match = style.match(/\d+/g);
  if (match) {
    return { r: parseInt(match[0]), g: parseInt(match[1]), b: parseInt(match[2]) };
  }
  return { r: 0, g: 0, b: 0 };
};

export const mixColors = (c1: { r: number, g: number, b: number }, c2: { r: number, g: number, b: number }, weight: number) => {
  return {
    r: Math.round(c1.r * (1 - weight) + c2.r * weight),
    g: Math.round(c1.g * (1 - weight) + c2.g * weight),
    b: Math.round(c1.b * (1 - weight) + c2.b * weight)
  };
};

export const drawGradientToCanvas = (
  ctx: CanvasRenderingContext2D, 
  width: number, 
  height: number, 
  settings: any,
  isExport = false,
  hideAxis = false
) => {
  ctx.clearRect(0, 0, width, height);

  if (settings.type === 'mesh') {
    const bufferScale = isExport ? 1.0 : 0.2;
    const bw = Math.floor(width * bufferScale);
    const bh = Math.floor(height * bufferScale);
    const bufferCanvas = document.createElement('canvas');
    bufferCanvas.width = bw; bufferCanvas.height = bh;
    const bctx = bufferCanvas.getContext('2d');
    if (!bctx) return;
    const imageData = bctx.createImageData(bw, bh);
    const data = imageData.data;
    const points = settings.meshPoints.map((p: any) => {
      const rgb = parseColor(p.color);
      return {
        x: (p.x / 100) * bw, y: (p.y / 100) * bh,
        r: rgb.r, g: rgb.g, b: rgb.b,
        weight: p.radius / 50
      };
    });
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        let totalWeight = 0; let r = 0, g = 0, b = 0;
        for (const p of points) {
          const dx = x - p.x; const dy = y - p.y; const distSq = dx * dx + dy * dy;
          if (distSq < 0.1) { r = p.r; g = p.g; b = p.b; totalWeight = 1; break; }
          const w = p.weight / Math.pow(distSq, 1.2); 
          r += p.r * w; g += p.g * w; b += p.b * w; totalWeight += w;
        }
        const idx = (y * bw + x) * 4;
        data[idx] = r / totalWeight; data[idx + 1] = g / totalWeight; data[idx + 2] = b / totalWeight; data[idx + 3] = 255;
      }
    }
    bctx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bufferCanvas, 0, 0, width, height);
  } else {
    let gradient: CanvasGradient;
    const cp = settings.controlPoints || { start: { x: 20, y: 20 }, end: { x: 80, y: 80 } };
    const x1 = (cp.start.x / 100) * width;
    const y1 = (cp.start.y / 100) * height;
    const x2 = (cp.end.x / 100) * width;
    const y2 = (cp.end.y / 100) * height;

    if (settings.type === 'linear') {
      gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    } else if (settings.type === 'radial') {
      const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      gradient = ctx.createRadialGradient(x1, y1, 0, x1, y1, radius);
    } else if (settings.type === 'conic') {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      // @ts-ignore - createConicGradient might not be in some older type definitions
      gradient = ctx.createConicGradient(angle, x1, y1);
    } else {
      // Fallback
      gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    }

    const sortedStops = [...settings.stops].sort((a, b) => a.position - b.position);
    
    for (let i = 0; i < sortedStops.length; i++) {
      const stop = sortedStops[i];
      const nextStop = sortedStops[i + 1];
      
      // Add the current stop
      gradient.addColorStop(Math.max(0, Math.min(1, stop.position / 100)), stop.color);
      
      // Add midpoint if there's a next stop
      if (nextStop) {
        const midpointPercent = stop.midpoint !== undefined ? stop.midpoint : 50;
        const midpointPos = stop.position + (nextStop.position - stop.position) * (midpointPercent / 100);
        
        const c1 = parseColor(stop.color);
        const c2 = parseColor(nextStop.color);
        
        // If midpoint is at the extreme, bias the mix to create a hard edge as requested
        let mixWeight = 0.5;
        if (midpointPercent <= 0.5) mixWeight = 1;
        else if (midpointPercent >= 99.5) mixWeight = 0;
        
        const mixed = mixColors(c1, c2, mixWeight);
        const mixedColor = `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
        
        gradient.addColorStop(Math.max(0, Math.min(1, midpointPos / 100)), mixedColor);
      }
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Draw axis line if not exporting and not hidden
    if (!isExport && !hideAxis) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Apply Noise
  if (settings.noise > 0) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    
    try {
      const noiseImageData = ctx.getImageData(0, 0, w, h);
      const data = noiseImageData.data;
      const intensity = settings.noise * 0.005; 
      
      // Calculate grain size based on resolution to keep it consistent
      // Reference width is 200px (matching the preview resolution)
      const grainSize = Math.max(1, Math.floor(w / 200));
      
      if (grainSize <= 1) {
        for (let i = 0; i < data.length; i += 4) {
          const base = (Math.random() - 0.5) * intensity;
          const additive = base * 8;
          data[i] = Math.max(0, Math.min(255, data[i] * (1 + base) + additive));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * (1 + base) + additive));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * (1 + base) + additive));
        }
      } else {
        for (let y = 0; y < h; y += grainSize) {
          for (let x = 0; x < w; x += grainSize) {
            const base = (Math.random() - 0.5) * intensity;
            const additive = base * 8;
            
            for (let gy = 0; gy < grainSize && y + gy < h; gy++) {
              if (y + gy >= h) break;
              for (let gx = 0; gx < grainSize && x + gx < w; gx++) {
                if (x + gx >= w) break;
                const i = ((y + gy) * w + (x + gx)) * 4;
                data[i] = Math.max(0, Math.min(255, data[i] * (1 + base) + additive));
                data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * (1 + base) + additive));
                data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * (1 + base) + additive));
              }
            }
          }
        }
      }
      ctx.putImageData(noiseImageData, 0, 0);
    } catch (e) {
      console.error('Noise application failed:', e);
    }
  }
};
