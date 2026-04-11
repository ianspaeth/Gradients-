import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { GradientSettings, MeshPoint, ColorStop } from '../types';
import { cn } from '../lib/utils';
import { drawGradientToCanvas, generateVectorSvg, parseColor } from '../lib/gradient-renderer';

export interface GradientPreviewHandle {
  getExportDataUrl: (dpi: number) => string;
  getExportBlob: (dpi: number) => Promise<Blob | null>;
  getExportSvg: (dpi: number) => string;
}

interface GradientPreviewProps {
  settings: GradientSettings;
  onUpdateMeshPoint?: (id: string, updates: Partial<MeshPoint>) => void;
  onUpdateStop?: (id: string, updates: Partial<ColorStop>) => void;
  onUpdateStopMidpoint?: (id: string, midpoint: number) => void;
  onUpdateControlPoint?: (point: 'start' | 'end', updates: { x: number; y: number }) => void;
  onSelectNode?: (id: string | null, type: 'mesh' | 'stop' | 'control') => void;
  onAddNode?: (x: number, y: number) => void;
  onInteractionEnd?: () => void;
  onHoldChange?: (isHolding: boolean) => void;
  selectedNode?: { id: string; type: 'mesh' | 'stop' | 'control' } | null;
  isOverlayOpen?: boolean;
  hideTooltip?: boolean;
  hideNodes?: boolean;
  className?: string;
}

export const GradientPreview = forwardRef<GradientPreviewHandle, GradientPreviewProps>(({ 
  settings, 
  onUpdateMeshPoint, 
  onUpdateStop,
  onUpdateStopMidpoint,
  onUpdateControlPoint,
  onSelectNode,
  onAddNode,
  onInteractionEnd,
  onHoldChange,
  selectedNode,
  isOverlayOpen,
  hideTooltip,
  hideNodes,
  className 
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [draggingNode, setDraggingNode] = useState<{ 
    id: string; 
    type: 'mesh' | 'stop' | 'control' | 'midpoint'; 
    hasMoved: boolean;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);

  // Use ResizeObserver to track the available space in the container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const drawGradient = (ctx: CanvasRenderingContext2D, width: number, height: number, isExport = false) => {
    drawGradientToCanvas(ctx, width, height, settings, isExport, hideNodes);
  };

  useImperativeHandle(ref, () => ({
    getExportDataUrl: (dpi: number) => {
      const canvas = document.createElement('canvas');
      // Assume 1 unit in ratio = 1 inch at the given DPI
      // To keep it reasonable, let's say base size is 4 inches for the long edge
      const baseSizeInches = 4;
      const maxRatio = Math.max(settings.ratio.width, settings.ratio.height);
      const scale = baseSizeInches / maxRatio;
      
      canvas.width = settings.ratio.width * scale * dpi;
      canvas.height = settings.ratio.height * scale * dpi;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawGradient(ctx, canvas.width, canvas.height, true);
        return canvas.toDataURL('image/png', 1.0);
      }
      return '';
    },
    getExportBlob: (dpi: number) => {
      return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const baseSizeInches = 4;
        const maxRatio = Math.max(settings.ratio.width, settings.ratio.height);
        const scale = baseSizeInches / maxRatio;
        
        canvas.width = settings.ratio.width * scale * dpi;
        canvas.height = settings.ratio.height * scale * dpi;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawGradient(ctx, canvas.width, canvas.height, true);
          canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
        } else {
          resolve(null);
        }
      });
    },
    getExportSvg: (dpi: number) => {
      const baseSizeInches = 4;
      const maxRatio = Math.max(settings.ratio.width, settings.ratio.height);
      const scale = baseSizeInches / maxRatio;
      
      const width = settings.ratio.width * scale * dpi;
      const height = settings.ratio.height * scale * dpi;

      // Try to generate a true vector SVG first
      const vectorSvg = generateVectorSvg(width, height, settings, dpi);
      if (vectorSvg) return vectorSvg;
      
      // Fallback to high-res raster embedding if vectorization is not possible (e.g. noise is present)
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      
      drawGradient(ctx, width, height, true);
      const dataUrl = canvas.toDataURL('image/png');
      
      return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image width="${width}" height="${height}" xlink:href="${dataUrl}" />
</svg>`;
    }
  }));

  const updateCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    
    // Use rounded values to avoid subpixel issues on mobile
    const displayWidth = Math.round(rect.width);
    const displayHeight = Math.round(rect.height);

    // Only update if dimensions actually changed to avoid thrashing
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = displayWidth * dpr;
    const targetHeight = displayHeight * dpr;

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    
    // Reset transform before scaling
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    
    drawGradient(ctx, displayWidth, displayHeight);
  }, [settings, draggingNode, hideNodes, containerSize]);

  useEffect(() => {
    updateCanvas();
  }, [updateCanvas]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isOverlayOpen) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    let closestNode: { id: string; type: 'mesh' | 'stop' | 'control' | 'midpoint' } | null = null;
    let minDistance = 15;

    // 1. Check midpoints first (highest priority as requested)
    if (settings.type !== 'mesh') {
      const sortedStops = [...settings.stops].sort((a, b) => a.position - b.position);
      for (let i = 0; i < sortedStops.length - 1; i++) {
        const s1 = sortedStops[i];
        const s2 = sortedStops[i + 1];
        const m = s1.midpoint ?? 50;
        const mx = s1.x + (s2.x - s1.x) * (m / 100);
        const my = s1.y + (s2.y - s1.y) * (m / 100);
        const dist = Math.sqrt(Math.pow(mx - x, 2) + Math.pow(my - y, 2));
        if (dist < minDistance) {
          minDistance = dist;
          closestNode = { id: s1.id, type: 'midpoint' };
        }
      }
    }

    // 2. Check stops
    if (settings.type !== 'mesh') {
      settings.stops.forEach(s => {
        const dist = Math.sqrt(Math.pow(s.x - x, 2) + Math.pow(s.y - y, 2));
        if (dist < minDistance) {
          minDistance = dist;
          closestNode = { id: s.id, type: 'stop' };
        }
      });
    }

    // 2. Check mesh points
    if (settings.type === 'mesh') {
      settings.meshPoints.forEach(p => {
        const dist = Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2));
        if (dist < minDistance) {
          minDistance = dist;
          closestNode = { id: p.id, type: 'mesh' };
        }
      });
    }

    // 3. Check control points last (lower priority if overlapping with a stop)
    if (settings.type !== 'mesh') {
      const cp = settings.controlPoints || { start: { x: 20, y: 20 }, end: { x: 80, y: 80 } };
      const distStart = Math.sqrt(Math.pow(cp.start.x - x, 2) + Math.pow(cp.start.y - y, 2));
      const distEnd = Math.sqrt(Math.pow(cp.end.x - x, 2) + Math.pow(cp.end.y - y, 2));
      
      // Only pick control point if it's significantly closer than any stop found so far
      // or if no stop was found within the threshold.
      if (distStart < minDistance - 2) {
        minDistance = distStart;
        closestNode = { id: 'start', type: 'control' };
      }
      if (distEnd < minDistance - 2) {
        minDistance = distEnd;
        closestNode = { id: 'end', type: 'control' };
      }
    }

    if (closestNode) {
      let offsetX = 0;
      let offsetY = 0;

      if (closestNode.type === 'mesh') {
        const p = settings.meshPoints.find(p => p.id === closestNode!.id);
        if (p) { offsetX = x - p.x; offsetY = y - p.y; }
      } else if (closestNode.type === 'stop') {
        const s = settings.stops.find(s => s.id === closestNode!.id);
        if (s) { offsetX = x - s.x; offsetY = y - s.y; }
      } else if (closestNode.type === 'control') {
        const cp = settings.controlPoints || { start: { x: 20, y: 20 }, end: { x: 80, y: 80 } };
        const p = closestNode.id === 'start' ? cp.start : cp.end;
        offsetX = x - p.x; offsetY = y - p.y;
      } else if (closestNode.type === 'midpoint') {
        const s1 = settings.stops.find(s => s.id === closestNode!.id);
        if (s1) {
          const sortedStops = [...settings.stops].sort((a, b) => a.position - b.position);
          const idx = sortedStops.findIndex(s => s.id === s1.id);
          const s2 = sortedStops[idx + 1];
          if (s2) {
            const m = s1.midpoint ?? 50;
            const mx = s1.x + (s2.x - s1.x) * (m / 100);
            const my = s1.y + (s2.y - s1.y) * (m / 100);
            offsetX = x - mx; offsetY = y - my;
          }
        }
      }

      setDraggingNode({ ...closestNode, hasMoved: false, startX: x, startY: y, offsetX, offsetY });
      canvas.setPointerCapture(e.pointerId);
    } else {
      setLastPointerPos({ x, y });
      holdTimerRef.current = setTimeout(() => {
        onHoldChange?.(true);
        holdTimerRef.current = null;
      }, 200); // Short delay to distinguish tap from hold
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (holdTimerRef.current) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        if (lastPointerPos) {
          const dist = Math.sqrt(Math.pow(x - lastPointerPos.x, 2) + Math.pow(y - lastPointerPos.y, 2));
          if (dist > 2) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
          }
        }
      }
    }

    if (!draggingNode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(-20, Math.min(120, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(-20, Math.min(120, ((e.clientY - rect.top) / rect.height) * 100));

    // Threshold for movement (2% of canvas size)
    if (!draggingNode.hasMoved) {
      const dist = Math.sqrt(Math.pow(x - draggingNode.startX, 2) + Math.pow(y - draggingNode.startY, 2));
      if (dist > 1.5) {
        setDraggingNode(prev => prev ? { ...prev, hasMoved: true } : null);
        onSelectNode?.(null, 'mesh'); // Close pop-up on drag start
      }
      return; // Don't move until threshold is met
    }

    const targetX = Math.max(0, Math.min(100, x - draggingNode.offsetX));
    const targetY = Math.max(0, Math.min(100, y - draggingNode.offsetY));

    if (draggingNode.type === 'mesh' && onUpdateMeshPoint) {
      onUpdateMeshPoint(draggingNode.id, { x: targetX, y: targetY });
    } else if (draggingNode.type === 'control' && onUpdateControlPoint) {
      onUpdateControlPoint(draggingNode.id as 'start' | 'end', { x: targetX, y: targetY });
    } else if (draggingNode.type === 'midpoint' && onUpdateStopMidpoint) {
      const s1 = settings.stops.find(s => s.id === draggingNode.id);
      if (s1) {
        const sortedStops = [...settings.stops].sort((a, b) => a.position - b.position);
        const idx = sortedStops.findIndex(s => s.id === s1.id);
        const s2 = sortedStops[idx + 1];
        if (s2) {
          const dx = s2.x - s1.x;
          const dy = s2.y - s1.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq > 0) {
            const t = Math.max(0, Math.min(1, ((targetX - s1.x) * dx + (targetY - s1.y) * dy) / lenSq));
            let midpointValue = t * 100;
            
            // Snap to 50% (halfway)
            const snapThreshold = 4; // 4% threshold for snapping
            if (Math.abs(midpointValue - 50) < snapThreshold) {
              midpointValue = 50;
            }
            
            onUpdateStopMidpoint(draggingNode.id, midpointValue);
          }
        }
      }
    } else if (draggingNode.type === 'stop' && onUpdateStop) {
      const cp = settings.controlPoints || { start: { x: 20, y: 20 }, end: { x: 80, y: 80 } };
      const dx = cp.end.x - cp.start.x;
      const dy = cp.end.y - cp.start.y;
      const lenSq = dx * dx + dy * dy;
      
      if (lenSq > 0) {
        const t = Math.max(0, Math.min(1, ((targetX - cp.start.x) * dx + (targetY - cp.start.y) * dy) / lenSq));
        const pos = t * 100;
        const nx = cp.start.x + t * dx;
        const ny = cp.start.y + t * dy;
        onUpdateStop(draggingNode.id, { position: pos, x: nx, y: ny });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      
      if (selectedNode) {
        onSelectNode?.(null, 'mesh');
      } else if (lastPointerPos && onAddNode && !isOverlayOpen) {
        onAddNode(lastPointerPos.x, lastPointerPos.y);
      }
    }
    
    onHoldChange?.(false);
    if (draggingNode) {
      if (!draggingNode.hasMoved) {
        onSelectNode?.(draggingNode.id, draggingNode.type);
      } else {
        onInteractionEnd?.();
      }
      setDraggingNode(null);
      const canvas = canvasRef.current;
      if (canvas) canvas.releasePointerCapture(e.pointerId);
    }
  };

  const renderMidpoint = (s1: ColorStop, s2: ColorStop) => {
    const m = s1.midpoint ?? 50;
    const mx = s1.x + (s2.x - s1.x) * (m / 100);
    const my = s1.y + (s2.y - s1.y) * (m / 100);
    
    return (
      <div
        key={`mid-${s1.id}`}
        className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-black/20 rotate-45 z-[60] shadow-md pointer-events-none"
        style={{ left: `${mx}%`, top: `${my}%` }}
      />
    );
  };

  const renderNode = (node: any, type: 'mesh' | 'stop' | 'control') => {
    const isSelected = selectedNode?.id === node.id && selectedNode?.type === type;
    const isDragging = draggingNode?.id === node.id && draggingNode?.type === type;
    const isControl = type === 'control';
    
    return (
      <div
        key={node.id}
        className={cn(
          "absolute -translate-x-1/2 -translate-y-1/2 shadow-xl cursor-move pointer-events-none",
          !isDragging && "transition-transform duration-200",
          "before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-12 before:h-12 before:rounded-full",
          isControl ? "w-6 h-6 rounded-lg border-2 border-white bg-black/50" : "w-8 h-8 rounded-full border-4 border-white",
          isSelected ? "scale-125 z-50" : "scale-100 z-40"
        )}
        style={{ 
          left: `${node.x}%`, 
          top: `${node.y}%`, 
          backgroundColor: isControl ? undefined : node.color,
          boxShadow: isSelected && !isControl ? `0 0 20px ${node.color}` : undefined
        }}
      >
        {isControl && (
          <div className="w-full h-full flex items-center justify-center text-[8px] font-black text-white">
            {node.id === 'start' ? 'A' : 'B'}
          </div>
        )}
      </div>
    );
  };

  // Calculate the best fit for the gradient within the container
  const containerAspect = containerSize.width / containerSize.height;
  const contentAspect = settings.ratio.width / settings.ratio.height;
  const isWiderThanContainer = contentAspect > containerAspect;

  return (
    <div ref={containerRef} className={cn("relative overflow-hidden flex items-center justify-center touch-none", className)}>
      <div 
        className="relative shadow-2xl overflow-hidden border-2 border-white/10 rounded-none box-border"
        style={{ 
          aspectRatio: `${settings.ratio.width} / ${settings.ratio.height}`,
          width: isWiderThanContainer ? '100%' : 'auto',
          height: isWiderThanContainer ? 'auto' : '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          display: 'block'
        }}
      >
        <canvas 
          ref={canvasRef} 
          className="block touch-none w-full h-full cursor-crosshair absolute inset-0"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        
        {/* Render Nodes */}
        {!hideNodes && (
          settings.type === 'mesh' ? (
            settings.meshPoints.map(p => renderNode(p, 'mesh'))
          ) : (
            <>
              {settings.controlPoints && (
                <>
                  {renderNode({ id: 'start', x: settings.controlPoints.start.x, y: settings.controlPoints.start.y }, 'control')}
                  {renderNode({ id: 'end', x: settings.controlPoints.end.x, y: settings.controlPoints.end.y }, 'control')}
                </>
              )}
              {settings.stops.map(s => renderNode(s, 'stop'))}
              {settings.stops
                .sort((a, b) => a.position - b.position)
                .map((s, i, arr) => {
                  if (i < arr.length - 1) {
                    return renderMidpoint(s, arr[i + 1]);
                  }
                  return null;
                })}
            </>
          )
        )}
      </div>
    </div>
  );
});
