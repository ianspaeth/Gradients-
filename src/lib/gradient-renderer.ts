
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
        x: (p.x / 100) * bw, 
        y: (p.y / 100) * bh,
        r: rgb.r, g: rgb.g, b: rgb.b,
        hex: p.color,
        // Increased base weight for more continuous coverage
        weight: p.radius / 8
      };
    });

    // Group points by color for cohesion logic
    const colorGroups = new Map<string, any[]>();
    points.forEach(p => {
      if (!colorGroups.has(p.hex)) colorGroups.set(p.hex, []);
      colorGroups.get(p.hex)!.push(p);
    });

    // Adaptive exponent based on node density
    // Lower exponent = more expansive reach and better mixing
    const exponent = Math.max(0.4, Math.min(1.0, 0.45 + (points.length * 0.012)));

    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        let totalWeight = 0; 
        let r = 0, g = 0, b = 0;
        
        // Sample from the center of the buffer pixel for better alignment
        const centerX = x + 0.5;
        const centerY = y + 0.5;

        // Color Cohesion Logic: Group weights by color to ensure "full color" between same-colored nodes
        for (const [hex, groupPoints] of colorGroups) {
          let groupSumW = 0;
          let groupMaxW = 0;
          let isSingularity = false;

          for (const p of groupPoints) {
            const dx = centerX - p.x; 
            const dy = centerY - p.y; 
            const distSq = dx * dx + dy * dy;
            
            if (distSq < 0.01) { 
              isSingularity = true;
              break; 
            }
            
            // Softer IDW formula with adaptive exponent and larger softening constant (25)
            // This creates much broader, more continuous "blobs" of color
            const w = p.weight / Math.pow(distSq + 25, exponent); 
            groupSumW += w;
            if (w > groupMaxW) groupMaxW = w;
          }

          if (isSingularity) {
            const rgb = parseColor(hex);
            r = rgb.r; g = rgb.g; b = rgb.b;
            totalWeight = 1;
            break;
          }

          // Bridge Boost: If multiple nodes of same color overlap, boost the weight in the "bridge" area
          // This ensures no falloff between same-colored nodes
          const bridgeFactor = groupMaxW > 0 ? groupSumW / groupMaxW : 1;
          const boost = 1 + (bridgeFactor - 1) * 0.65;
          const effectiveWeight = groupSumW * boost;

          const rgb = parseColor(hex);
          r += rgb.r * effectiveWeight;
          g += rgb.g * effectiveWeight;
          b += rgb.b * effectiveWeight;
          totalWeight += effectiveWeight;
        }
        
        const idx = (y * bw + x) * 4;
        const invWeight = 1 / Math.max(0.0001, totalWeight);
        data[idx] = r * invWeight; 
        data[idx + 1] = g * invWeight; 
        data[idx + 2] = b * invWeight; 
        data[idx + 3] = 255;
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
      // To ensure "High-Resolution Previews" and "Resolution-Independent Noise",
      // we process the noise at the actual physical resolution of the canvas.
      // This prevents pixelation and ensures consistent scaling across all devices.
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      
      // Intensity scaling: 
      // We use a more refined intensity mapping for professional-grade grain.
      // The noise is applied as a delta to the existing color values.
      const intensity = (settings.noise / 100) * 39.78; 
      
      for (let i = 0; i < data.length; i += 4) {
        // Monochromatic noise base for consistent visual weight
        const mono = (Math.random() - 0.5) * intensity;
        
        // Add subtle chromatic variance for a natural, film-like texture
        const rVar = (Math.random() - 0.5) * (intensity * 0.15);
        const gVar = (Math.random() - 0.5) * (intensity * 0.15);
        const bVar = (Math.random() - 0.5) * (intensity * 0.15);

        data[i] = Math.max(0, Math.min(255, data[i] + mono + rVar));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + mono + gVar));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + mono + bVar));
      }
      
      // Use putImageData to write directly back to the canvas.
      // putImageData is coordinate-system independent (uses physical pixels),
      // which fixes the "jumping" issue caused by scaled context transforms.
      ctx.putImageData(imageData, 0, 0);
    } catch (e) {
      console.error('Noise application failed:', e);
    }
  }
};

export const generateVectorSvg = (width: number, height: number, settings: any, dpi: number = 72) => {
  const { type, stops, meshPoints, controlPoints, noise } = settings;
  
  // If noise is present, we fallback to raster because noise is inherently raster-based grain
  if (noise > 0) return null;

  // Helper for IDW color calculation (shared by mesh logic)
  const calculateMeshColor = (x: number, y: number, points: any[]) => {
    let totalWeight = 0;
    let r = 0, g = 0, b = 0;
    
    // Group points by color for cohesion logic
    const colorGroups = new Map<string, any[]>();
    points.forEach(p => {
      if (!colorGroups.has(p.hex)) colorGroups.set(p.hex, []);
      colorGroups.get(p.hex)!.push(p);
    });

    // Adaptive exponent matching the main renderer
    const exponent = Math.max(0.4, Math.min(1.0, 0.45 + (points.length * 0.012)));

    for (const [hex, groupPoints] of colorGroups) {
      let groupSumW = 0;
      let groupMaxW = 0;
      let isSingularity = false;

      for (const p of groupPoints) {
        const dx = x - p.x;
        const dy = y - p.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < 0.01) {
          isSingularity = true;
          break;
        }
        
        // Matching softer IDW formula with larger softening constant (25)
        const w = p.weight / Math.pow(distSq + 25, exponent);
        groupSumW += w;
        if (w > groupMaxW) groupMaxW = w;
      }

      if (isSingularity) {
        const rgb = parseColor(hex);
        return { r: rgb.r, g: rgb.g, b: rgb.b };
      }

      // Matching Bridge Boost logic
      const bridgeFactor = groupMaxW > 0 ? groupSumW / groupMaxW : 1;
      const boost = 1 + (bridgeFactor - 1) * 0.65;
      const effectiveWeight = groupSumW * boost;

      const rgb = parseColor(hex);
      r += rgb.r * effectiveWeight;
      g += rgb.g * effectiveWeight;
      b += rgb.b * effectiveWeight;
      totalWeight += effectiveWeight;
    }
    const invWeight = 1 / Math.max(0.0001, totalWeight);
    return { r: Math.round(r * invWeight), g: Math.round(g * invWeight), b: Math.round(b * invWeight) };
  };

  if (type === 'linear' || type === 'radial') {
    const cp = controlPoints || { start: { x: 20, y: 20 }, end: { x: 80, y: 80 } };
    const x1 = cp.start.x;
    const y1 = cp.start.y;
    const x2 = cp.end.x;
    const y2 = cp.end.y;
    
    let gradientDef = '';
    if (type === 'linear') {
      gradientDef = `<linearGradient id="grad" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">`;
    } else {
      const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      gradientDef = `<radialGradient id="grad" cx="${x1}%" cy="${y1}%" r="${radius}%" fx="${x1}%" fy="${y1}%">`;
    }
    
    const sortedStops = [...stops].sort((a, b) => a.position - b.position);
    let stopsHtml = '';
    
    for (let i = 0; i < sortedStops.length; i++) {
      const stop = sortedStops[i];
      stopsHtml += `<stop offset="${stop.position}%" stop-color="${stop.color}" />`;
      
      const nextStop = sortedStops[i + 1];
      if (nextStop) {
        const midpointPercent = stop.midpoint !== undefined ? stop.midpoint : 50;
        const midpointPos = stop.position + (nextStop.position - stop.position) * (midpointPercent / 100);
        
        const c1 = parseColor(stop.color);
        const c2 = parseColor(nextStop.color);
        
        let mixWeight = 0.5;
        if (midpointPercent <= 0.5) mixWeight = 1;
        else if (midpointPercent >= 99.5) mixWeight = 0;
        
        const mixed = mixColors(c1, c2, mixWeight);
        const mixedColor = `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
        stopsHtml += `<stop offset="${midpointPos}%" stop-color="${mixedColor}" />`;
      }
    }
    
    gradientDef += stopsHtml + (type === 'linear' ? '</linearGradient>' : '</radialGradient>');

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${gradientDef}
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)" />
</svg>`;
  }
  
  if (type === 'mesh') {
    const points = meshPoints.map((p: any) => {
      const rgb = parseColor(p.color);
      return {
        x: (p.x / 100) * width,
        y: (p.y / 100) * height,
        r: rgb.r, g: rgb.g, b: rgb.b,
        weight: p.radius / 8
      };
    });

    // 1. Generate SVG 2.0 <meshGradient> for Adobe Illustrator
    // We use a 15x15 grid which provides a high-fidelity editable mesh in AI
    const aiGridSize = 15; 
    const aiCellW = width / aiGridSize;
    const aiCellH = height / aiGridSize;
    
    const aiVertices: string[][] = [];
    for (let j = 0; j <= aiGridSize; j++) {
      aiVertices[j] = [];
      for (let i = 0; i <= aiGridSize; i++) {
        const c = calculateMeshColor(i * aiCellW, j * aiCellH, points);
        aiVertices[j][i] = `rgb(${c.r},${c.g},${c.b})`;
      }
    }

    let meshRows = '';
    for (let j = 0; j < aiGridSize; j++) {
      let patches = '';
      for (let i = 0; i < aiGridSize; i++) {
        if (i === 0) {
          patches += `<meshPatch><stop stop-color="${aiVertices[j][i]}"/><stop stop-color="${aiVertices[j][i+1]}"/><stop stop-color="${aiVertices[j+1][i+1]}"/><stop stop-color="${aiVertices[j+1][i]}"/></meshPatch>`;
        } else {
          patches += `<meshPatch><stop stop-color="${aiVertices[j][i+1]}"/><stop stop-color="${aiVertices[j+1][i+1]}"/></meshPatch>`;
        }
      }
      meshRows += `<meshRow>${patches}</meshRow>`;
    }

    // 2. Generate the browser-compatible rect grid (as fallback)
    const browserGridSize = Math.max(20, Math.min(80, dpi)); 
    const bCellW = width / browserGridSize;
    const bCellH = height / browserGridSize;
    let rects = '';
    for (let gy = 0; gy < browserGridSize; gy++) {
      for (let gx = 0; gx < browserGridSize; gx++) {
        const c = calculateMeshColor((gx + 0.5) * bCellW, (gy + 0.5) * bCellH, points);
        rects += `<rect x="${gx * bCellW}" y="${gy * bCellH}" width="${bCellW + 0.2}" height="${bCellH + 0.2}" fill="rgb(${c.r},${c.g},${c.b})" />`;
      }
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <meshGradient id="ai_mesh" x="0" y="0" type="bilinear">${meshRows}</meshGradient>
  </defs>
  <!-- Group for Adobe Illustrator (Editable Mesh Tool Object) -->
  <g id="Illustrator_Mesh" style="display: none;">
    <rect width="100%" height="100%" fill="url(#ai_mesh)" />
  </g>
  <!-- Group for Browser Preview (Vector Rects) -->
  <g id="Browser_Preview" shape-rendering="crispEdges">
    ${rects}
  </g>
</svg>`;
  }

  if (type === 'conic') {
    const cp = controlPoints || { start: { x: 20, y: 20 }, end: { x: 80, y: 80 } };
    const x1 = (cp.start.x / 100) * width;
    const y1 = (cp.start.y / 100) * height;
    const x2 = (cp.end.x / 100) * width;
    const y2 = (cp.end.y / 100) * height;
    const startAngle = Math.atan2(y2 - y1, x2 - x1);
    
    const sortedStops = [...stops].sort((a, b) => a.position - b.position);
    const numSegments = 360; // One segment per degree
    const radius = Math.max(width, height) * 1.5;
    
    let paths = '';
    for (let i = 0; i < numSegments; i++) {
      const angle1 = startAngle + (i / numSegments) * Math.PI * 2;
      const angle2 = startAngle + ((i + 1) / numSegments) * Math.PI * 2;
      
      const pos = (i / numSegments) * 100;
      let color = 'rgb(0,0,0)';
      
      for (let j = 0; j < sortedStops.length; j++) {
        const s = sortedStops[j];
        const next = sortedStops[j + 1];
        if (pos >= s.position && (!next || pos < next.position)) {
          if (!next) {
            color = s.color;
          } else {
            const midpointPercent = s.midpoint !== undefined ? s.midpoint : 50;
            const range = next.position - s.position;
            const localPos = (pos - s.position) / range;
            
            let weight = 0;
            if (localPos < midpointPercent / 100) {
              weight = localPos / (midpointPercent / 100) * 0.5;
            } else {
              weight = 0.5 + (localPos - midpointPercent / 100) / (1 - midpointPercent / 100) * 0.5;
            }
            
            const c1 = parseColor(s.color);
            const c2 = parseColor(next.color);
            const mixed = mixColors(c1, c2, weight);
            color = `rgb(${mixed.r},${mixed.g},${mixed.b})`;
          }
          break;
        }
      }
      
      const px1 = x1 + Math.cos(angle1) * radius;
      const py1 = y1 + Math.sin(angle1) * radius;
      const px2 = x1 + Math.cos(angle2) * radius;
      const py2 = y1 + Math.sin(angle2) * radius;
      
      paths += `<path d="M ${x1} ${y1} L ${px1} ${py1} L ${px2} ${py2} Z" fill="${color}" stroke="${color}" stroke-width="0.5" />`;
    }
    
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${sortedStops[0].color}" />
  <g shape-rendering="geometricPrecision">
    ${paths}
  </g>
</svg>`;
  }

  return null;
};

export const drawVectorToPdf = (pdf: any, width: number, height: number, settings: any) => {
  const { type, stops, meshPoints, controlPoints, noise } = settings;
  
  // If noise is present, we fallback to raster because noise is inherently raster-based grain
  if (noise > 0) return false;

  if (type === 'linear' || type === 'radial') {
    // jsPDF's context2d is a reliable way to handle gradients if supported by the version
    // We use the internal context2d which maps to PDF vector commands
    const ctx = pdf.context2d;
    if (ctx) {
      const cp = controlPoints || { start: { x: 20, y: 20 }, end: { x: 80, y: 80 } };
      const x1 = (cp.start.x / 100) * width;
      const y1 = (cp.start.y / 100) * height;
      const x2 = (cp.end.x / 100) * width;
      const y2 = (cp.end.y / 100) * height;
      
      let gradient: any;
      if (type === 'linear') {
        gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      } else {
        const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        gradient = ctx.createRadialGradient(x1, y1, 0, x1, y1, radius);
      }
      
      const sortedStops = [...stops].sort((a, b) => a.position - b.position);
      for (let i = 0; i < sortedStops.length; i++) {
        const stop = sortedStops[i];
        gradient.addColorStop(stop.position / 100, stop.color);
        
        const nextStop = sortedStops[i + 1];
        if (nextStop) {
          const midpointPercent = stop.midpoint !== undefined ? stop.midpoint : 50;
          const midpointPos = stop.position + (nextStop.position - stop.position) * (midpointPercent / 100);
          
          const c1 = parseColor(stop.color);
          const c2 = parseColor(nextStop.color);
          
          let mixWeight = 0.5;
          if (midpointPercent <= 0.5) mixWeight = 1;
          else if (midpointPercent >= 99.5) mixWeight = 0;
          
          const mixed = mixColors(c1, c2, mixWeight);
          const mixedColor = `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
          gradient.addColorStop(midpointPos / 100, mixedColor);
        }
      }
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      return true;
    }
  }
  
  if (type === 'mesh') {
    const gridSize = 40; // 40x40 grid for PDF to keep file size reasonable
    const cellW = width / gridSize;
    const cellH = height / gridSize;
    
    const points = meshPoints.map((p: any) => {
      const rgb = parseColor(p.color);
      return {
        x: (p.x / 100) * width,
        y: (p.y / 100) * height,
        r: rgb.r, g: rgb.g, b: rgb.b,
        hex: p.color,
        weight: p.radius / 8
      };
    });

    // Group points by color for cohesion logic
    const colorGroups = new Map<string, any[]>();
    points.forEach(p => {
      if (!colorGroups.has(p.hex)) colorGroups.set(p.hex, []);
      colorGroups.get(p.hex)!.push(p);
    });

    const exponent = Math.max(0.4, Math.min(1.0, 0.45 + (points.length * 0.012)));

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const x = (gx + 0.5) * cellW;
        const y = (gy + 0.5) * cellH;
        
        let totalWeight = 0;
        let r = 0, g = 0, b = 0;
        
        for (const [hex, groupPoints] of colorGroups) {
          let groupSumW = 0;
          let groupMaxW = 0;
          let isSingularity = false;

          for (const p of groupPoints) {
            const dx = x - p.x;
            const dy = y - p.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq < 0.01) {
              isSingularity = true;
              break;
            }
            
            const w = p.weight / Math.pow(distSq + 25, exponent);
            groupSumW += w;
            if (w > groupMaxW) groupMaxW = w;
          }

          if (isSingularity) {
            const rgb = parseColor(hex);
            r = rgb.r; g = rgb.g; b = rgb.b;
            totalWeight = 1;
            break;
          }

          const bridgeFactor = groupMaxW > 0 ? groupSumW / groupMaxW : 1;
          const boost = 1 + (bridgeFactor - 1) * 0.65;
          const effectiveWeight = groupSumW * boost;

          const rgb = parseColor(hex);
          r += rgb.r * effectiveWeight;
          g += rgb.g * effectiveWeight;
          b += rgb.b * effectiveWeight;
          totalWeight += effectiveWeight;
        }
        
        const invWeight = 1 / Math.max(0.0001, totalWeight);
        const finalR = Math.round(r * invWeight);
        const finalG = Math.round(g * invWeight);
        const finalB = Math.round(b * invWeight);
        
        pdf.setFillColor(finalR, finalG, finalB);
        // Add a tiny overlap to avoid gaps
        pdf.rect(gx * cellW, gy * cellH, cellW + 0.1, cellH + 0.1, 'F');
      }
    }
    return true;
  }

  if (type === 'conic') {
    const cp = controlPoints || { start: { x: 20, y: 20 }, end: { x: 80, y: 80 } };
    const x1 = (cp.start.x / 100) * width;
    const y1 = (cp.start.y / 100) * height;
    const x2 = (cp.end.x / 100) * width;
    const y2 = (cp.end.y / 100) * height;
    const startAngle = Math.atan2(y2 - y1, x2 - x1);
    
    const sortedStops = [...stops].sort((a, b) => a.position - b.position);
    const numSegments = 180; // 180 segments for PDF conic
    const radius = Math.max(width, height) * 1.5;
    
    // Fill background first
    const bgRgb = parseColor(sortedStops[0].color);
    pdf.setFillColor(bgRgb.r, bgRgb.g, bgRgb.b);
    pdf.rect(0, 0, width, height, 'F');

    for (let i = 0; i < numSegments; i++) {
      const angle1 = startAngle + (i / numSegments) * Math.PI * 2;
      const angle2 = startAngle + ((i + 1) / numSegments) * Math.PI * 2;
      
      const pos = (i / numSegments) * 100;
      let color = { r: 0, g: 0, b: 0 };
      
      for (let j = 0; j < sortedStops.length; j++) {
        const s = sortedStops[j];
        const next = sortedStops[j + 1];
        if (pos >= s.position && (!next || pos < next.position)) {
          if (!next) {
            color = parseColor(s.color);
          } else {
            const midpointPercent = s.midpoint !== undefined ? s.midpoint : 50;
            const range = next.position - s.position;
            const localPos = (pos - s.position) / range;
            
            let weight = 0;
            if (localPos < midpointPercent / 100) {
              weight = localPos / (midpointPercent / 100) * 0.5;
            } else {
              weight = 0.5 + (localPos - midpointPercent / 100) / (1 - midpointPercent / 100) * 0.5;
            }
            
            const c1 = parseColor(s.color);
            const c2 = parseColor(next.color);
            color = mixColors(c1, c2, weight);
          }
          break;
        }
      }
      
      const px1 = x1 + Math.cos(angle1) * radius;
      const py1 = y1 + Math.sin(angle1) * radius;
      const px2 = x1 + Math.cos(angle2) * radius;
      const py2 = y1 + Math.sin(angle2) * radius;
      
      pdf.setFillColor(color.r, color.g, color.b);
      pdf.setDrawColor(color.r, color.g, color.b);
      pdf.triangle(x1, y1, px1, py1, px2, py2, 'FD');
    }
    return true;
  }

  return false;
};
