import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, RotateCcw, Layers, Circle, Sparkles, Settings2, Image as ImageIcon, X, Download, Trash2, Bookmark, BookmarkCheck, History, Undo2, Redo2, Compass, ArrowLeftRight } from 'lucide-react';
import { GradientPreview, GradientPreviewHandle } from './components/GradientPreview';
import { MiniGradient } from './components/MiniGradient';
import { useGradientDataUrl } from './hooks/useGradientDataUrl';
import { ImageColorPicker } from './components/ImageColorPicker';
import { GradientSettings, ColorStop, MeshPoint } from './types';
import { cn } from './lib/utils';
import { extractColorsFromImage } from './lib/imageUtils';

const INITIAL_STOPS: ColorStop[] = [
  { id: '1', color: '#6366f1', position: 0, midpoint: 50, x: 20, y: 20 },
  { id: '2', color: '#a855f7', position: 100, midpoint: 50, x: 80, y: 80 },
];

const INITIAL_MESH_POINTS: MeshPoint[] = [
  { id: 'm1', color: '#6366f1', x: 20, y: 20, radius: 60 },
  { id: 'm2', color: '#a855f7', x: 80, y: 80, radius: 60 },
  { id: 'm3', color: '#ec4899', x: 50, y: 50, radius: 40 },
];

const hslToHex = (h: number, s: number, l: number) => {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const hsbToHex = (h: number, s: number, b: number) => {
  s /= 100;
  b /= 100;
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  const toHex = (n: number) => Math.round(255 * f(n)).toString(16).padStart(2, '0');
  return `#${toHex(5)}${toHex(3)}${toHex(1)}`;
};

const hexToHsb = (hex: string) => {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, v = max;

  let d = max - min;
  s = max === 0 ? 0 : d / max;

  if (max === min) {
    h = 0;
  } else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: h = 0;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    b: Math.round(v * 100)
  };
};

const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const generateRandomColor = () => {
  const h = Math.floor(Math.random() * 360);
  const s = 60 + Math.floor(Math.random() * 30);
  const l = 50 + Math.floor(Math.random() * 20);
  return hslToHex(h, s, l);
};

const generateRandomSettings = (): GradientSettings => {
  const type = 'mesh';
  const stops: ColorStop[] = [
    { id: '1', color: generateRandomColor(), position: 0, midpoint: 50, x: 20, y: 20 },
    { id: '2', color: generateRandomColor(), position: 100, midpoint: 50, x: 80, y: 80 },
  ];
  const meshPoints: MeshPoint[] = [
    { id: 'm1', color: generateRandomColor(), x: 20, y: 20, radius: 60 },
    { id: 'm2', color: generateRandomColor(), x: 80, y: 80, radius: 60 },
    { id: 'm3', color: generateRandomColor(), x: 50, y: 50, radius: 40 },
  ];
  
  return {
    type,
    angle: Math.floor(Math.random() * 360),
    stops,
    meshPoints,
    backgroundColor: '#ffffff',
    noise: 0,
    ratio: { width: 1, height: 1 },
    exportDpi: 300,
    controlPoints: {
      start: { x: 20, y: 20 },
      end: { x: 80, y: 80 },
    }
  };
};

export default function App() {
  const [settings, setSettings] = useState<GradientSettings>(generateRandomSettings());
  const [history, setHistory] = useState<GradientSettings[]>([settings]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ id: string; type: 'mesh' | 'stop' } | null>(null);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [colorMode, setColorMode] = useState<'hex' | 'rgb' | 'hsb'>('hsb');
  const [isHolding, setIsHolding] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const previewWidth = settings.ratio.width >= settings.ratio.height ? 200 : 200 * (settings.ratio.width / settings.ratio.height);
  const previewHeight = settings.ratio.height >= settings.ratio.width ? 200 : 200 * (settings.ratio.height / settings.ratio.width);
  const currentGradientDataUrl = useGradientDataUrl(settings, previewWidth, previewHeight);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [confirmDpi, setConfirmDpi] = useState(300);
  const [savedGradients, setSavedGradients] = useState<{ id: string; name: string; settings: GradientSettings }[]>([]);
  const [colorHistory, setColorHistory] = useState<string[]>([]);
  const [hasAddedNode, setHasAddedNode] = useState(false);
  const [hsbState, setHsbState] = useState<{ id: string, hsb: { h: number, s: number, b: number } } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<GradientPreviewHandle>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Backdrop and Click Handling
  const closeAllOverlays = () => {
    setSelectedNode(null);
    setShowGlobalSettings(false);
    setShowLibrary(false);
    setShowExportConfirm(false);
    setUploadedImageUrl(null);
  };

  const pushToHistory = (newSettings: GradientSettings) => {
    const currentSettings = JSON.stringify(newSettings);
    const lastSettings = JSON.stringify(history[historyIndex]);
    if (currentSettings === lastSettings) return;

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(currentSettings));
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setSettings(JSON.parse(JSON.stringify(history[prevIndex])));
      setSelectedNode(null);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setSettings(JSON.parse(JSON.stringify(history[nextIndex])));
      setSelectedNode(null);
    }
  };

  // Load saved gradients on mount
  useEffect(() => {
    const saved = localStorage.getItem('studio-gradients');
    if (saved) {
      try {
        setSavedGradients(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved gradients', e);
      }
    }
    
    const savedColors = localStorage.getItem('studio-colors');
    if (savedColors) {
      try {
        setColorHistory(JSON.parse(savedColors));
      } catch (e) {
        console.error('Failed to parse saved colors', e);
      }
    }
  }, []);

  // Save to localStorage whenever savedGradients changes
  useEffect(() => {
    localStorage.setItem('studio-gradients', JSON.stringify(savedGradients));
  }, [savedGradients]);

  useEffect(() => {
    localStorage.setItem('studio-colors', JSON.stringify(colorHistory));
  }, [colorHistory]);

  const addToColorHistory = (color: string) => {
    setColorHistory(prev => {
      const filtered = prev.filter(c => c.toLowerCase() !== color.toLowerCase());
      const next = [color, ...filtered].slice(0, 12);
      return next;
    });
  };

  const saveCurrentGradient = () => {
    const id = Math.random().toString(36).substr(2, 9);
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = now.toLocaleString('en-GB', { month: 'short' });
    const year = now.getFullYear();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    const name = `${day} ${month} ${year}, ${time}`;
    
    setSavedGradients(prev => [...prev, { id, name, settings: JSON.parse(JSON.stringify(settings)) }]);
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 2000);
  };

  const renameSavedGradient = (id: string, newName: string) => {
    setSavedGradients(prev => prev.map(g => g.id === id ? { ...g, name: newName } : g));
  };

  const deleteSavedGradient = (id: string) => {
    setSavedGradients(prev => prev.filter(g => g.id !== id));
  };

  const loadSavedGradient = (savedSettings: GradientSettings) => {
    const newSettings = JSON.parse(JSON.stringify(savedSettings));
    setSettings(newSettings);
    pushToHistory(newSettings);
    setSelectedNode(null);
    setShowLibrary(false);
  };

  const primaryColor = settings.type === 'mesh' 
    ? settings.meshPoints[0]?.color || '#6366f1'
    : settings.stops[0]?.color || '#6366f1';

  const addStop = useCallback((color: string = '#ec4899', x?: number, y?: number) => {
    const newId = Math.random().toString(36).substr(2, 9);
    const lastStop = settings.stops[settings.stops.length - 1];
    const newPosition = Math.min(100, lastStop.position + 10);
    
    setSettings(prev => {
      const next = {
        ...prev,
        stops: [...prev.stops, { 
          id: newId, 
          color, 
          position: newPosition,
          midpoint: 50,
          x: x ?? (Math.random() * 80 + 10),
          y: y ?? (Math.random() * 80 + 10)
        }].sort((a, b) => a.position - b.position),
      };
      pushToHistory(next);
      return next;
    });
    setHasAddedNode(true);
  }, [settings.stops, history, historyIndex]);

  const removeStop = useCallback((id: string) => {
    if (settings.stops.length <= 2) return;
    setSettings(prev => {
      const next = {
        ...prev,
        stops: prev.stops.filter(s => s.id !== id),
      };
      pushToHistory(next);
      return next;
    });
    if (selectedNode?.id === id) setSelectedNode(null);
  }, [settings.stops.length, selectedNode, history, historyIndex]);

  const updateStop = useCallback((id: string, updates: Partial<ColorStop>) => {
    setSettings(prev => ({
      ...prev,
      stops: prev.stops.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
  }, []);

  const updateStopMidpoint = useCallback((id: string, midpoint: number) => {
    setSettings(prev => ({
      ...prev,
      stops: prev.stops.map(s => s.id === id ? { ...s, midpoint } : s),
    }));
  }, []);

  const addMeshPoint = useCallback((color: string = '#6366f1', x?: number, y?: number) => {
    const newId = Math.random().toString(36).substr(2, 9);
    setSettings(prev => {
      const next = {
        ...prev,
        meshPoints: [...prev.meshPoints, { 
          id: newId, 
          color, 
          x: x ?? (Math.random() * 100), 
          y: y ?? (Math.random() * 100), 
          radius: 50 
        }],
      };
      pushToHistory(next);
      return next;
    });
    setHasAddedNode(true);
  }, [history, historyIndex]);

  const removeMeshPoint = useCallback((id: string) => {
    if (settings.meshPoints.length <= 1) return;
    setSettings(prev => {
      const next = {
        ...prev,
        meshPoints: prev.meshPoints.filter(p => p.id !== id),
      };
      pushToHistory(next);
      return next;
    });
    if (selectedNode?.id === id) setSelectedNode(null);
  }, [settings.meshPoints.length, selectedNode, history, historyIndex]);

  const updateMeshPoint = useCallback((id: string, updates: Partial<MeshPoint>) => {
    setSettings(prev => ({
      ...prev,
      meshPoints: prev.meshPoints.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
  }, []);

  const updateControlPoint = useCallback((point: 'start' | 'end', updates: { x: number; y: number }) => {
    setSettings(prev => {
      if (!prev.controlPoints) return prev;
      const newCP = {
        ...prev.controlPoints,
        [point]: { ...prev.controlPoints[point], ...updates }
      };
      
      // Recalculate all stops to follow the new line
      const newStops = prev.stops.map(stop => {
        if (prev.type === 'linear') {
          const nx = newCP.start.x + (stop.position / 100) * (newCP.end.x - newCP.start.x);
          const ny = newCP.start.y + (stop.position / 100) * (newCP.end.y - newCP.start.y);
          return { ...stop, x: nx, y: ny };
        } else {
          const angle = Math.atan2(newCP.end.y - newCP.start.y, newCP.end.x - newCP.start.x);
          const dist = (stop.position / 100) * Math.sqrt(Math.pow(newCP.end.x - newCP.start.x, 2) + Math.pow(newCP.end.y - newCP.start.y, 2));
          const nx = newCP.start.x + Math.cos(angle) * dist;
          const ny = newCP.start.y + Math.sin(angle) * dist;
          return { ...stop, x: nx, y: ny };
        }
      });

      return {
        ...prev,
        controlPoints: newCP,
        stops: newStops
      };
    });
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    const url = URL.createObjectURL(file);
    setUploadedImageUrl(url);
    setShowLibrary(false);
    setShowGlobalSettings(false);
    setSelectedNode(null);

    try {
      const colors = await extractColorsFromImage(file, settings.type === 'mesh' ? 6 : 4);
      colors.forEach(c => addToColorHistory(c));
      
      let nextSettings: GradientSettings;
      if (settings.type === 'mesh') {
        const newPoints: MeshPoint[] = colors.map((color, i) => ({
          id: `img-${i}-${Math.random()}`,
          color,
          x: Math.random() * 80 + 10,
          y: Math.random() * 80 + 10,
          radius: 40 + Math.random() * 30
        }));
        nextSettings = {
          ...settings,
          meshPoints: newPoints,
        };
      } else {
        const newStops: ColorStop[] = colors.map((color, i) => ({
          id: `img-${i}-${Math.random()}`,
          color,
          position: (i / (colors.length - 1)) * 100,
          x: Math.random() * 80 + 10,
          y: Math.random() * 80 + 10
        }));
        nextSettings = {
          ...settings,
          stops: newStops
        };
      }
      setSettings(nextSettings);
      pushToHistory(nextSettings);
    } catch (error) {
      console.error('Error processing image:', error);
    } finally {
      setIsProcessingImage(false);
      setHasAddedNode(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualColorPick = (color: string) => {
    addToColorHistory(color);
    if (settings.type === 'mesh') {
      addMeshPoint(color);
    } else {
      addStop(color);
    }
  };

  const resetGradient = () => {
    setSettings({
      type: 'mesh',
      angle: 135,
      stops: INITIAL_STOPS,
      meshPoints: INITIAL_MESH_POINTS,
      backgroundColor: '#ffffff',
      noise: 0,
      ratio: {
        width: 1,
        height: 1,
      },
      exportDpi: 300,
    });
    setUploadedImageUrl(null);
    setSelectedNode(null);
  };

  const handleExport = () => {
    setConfirmDpi(settings.exportDpi);
    setShowExportConfirm(true);
    setSelectedNode(null);
  };

  const executeExport = async (dpi: number) => {
    if (!previewRef.current) return;
    setShowExportConfirm(false);
    
    // Update settings with the confirmed DPI for future exports
    setSettings(prev => ({ ...prev, exportDpi: dpi }));

    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const timestamp = `${day}.${month}.${year}_${hh}${mm}`;
    const filename = `stgradient_${timestamp}.png`;

    // Try Web Share API first (best for mobile "Save to Photos")
    try {
      if (navigator.share && navigator.canShare) {
        const blob = await previewRef.current.getExportBlob(dpi);
        if (blob) {
          const file = new File([blob], filename, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'GRADIENTS! GRADIENTS! GRADIENTS!',
              text: 'My custom gradient from GRADIENTS! GRADIENTS! GRADIENTS!'
            });
            return;
          }
        }
      }
    } catch (e) {
      console.warn('Sharing failed, falling back to download', e);
    }

    // Fallback to standard download
    const dataUrl = previewRef.current.getExportDataUrl(dpi);
    if (dataUrl) {
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
    }
  };

  const activeNodeData = selectedNode 
    ? (selectedNode.type === 'mesh' 
        ? settings.meshPoints.find(p => p.id === selectedNode.id)
        : (selectedNode.type === 'control'
            ? (selectedNode.id === 'start' 
                ? settings.stops.reduce((prev, curr) => prev.position < curr.position ? prev : curr)
                : settings.stops.reduce((prev, curr) => prev.position > curr.position ? prev : curr))
            : settings.stops.find(s => s.id === selectedNode.id)))
    : null;
  
  useEffect(() => {
    if (activeNodeData && selectedNode) {
      const currentHsb = hexToHsb(activeNodeData.color);
      if (!hsbState || hsbState.id !== selectedNode.id) {
        setHsbState({ id: selectedNode.id, hsb: currentHsb });
      } else {
        const hsbHex = hsbToHex(hsbState.hsb.h, hsbState.hsb.s, hsbState.hsb.b);
        if (hsbHex.toLowerCase() !== activeNodeData.color.toLowerCase()) {
          setHsbState({ id: selectedNode.id, hsb: currentHsb });
        }
      }
    } else {
      setHsbState(null);
    }
  }, [activeNodeData?.color, selectedNode?.id]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-black flex flex-col relative font-sans select-none">
      {/* Header */}
      <div className="z-20 p-6 flex items-center justify-center bg-black/50 backdrop-blur-md border-b border-white/5">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center"
        >
          <h1 
            className="text-sm font-mono font-black tracking-[0.5em] uppercase bg-clip-text text-transparent transition-all duration-500 text-center leading-tight"
            style={{ 
              backgroundImage: `url(${currentGradientDataUrl})`,
              backgroundSize: '100% 100%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
          >
            GRADIENTS!<br />
            GRADIENTS!<br />
            GRADIENTS!
          </h1>
        </motion.div>
      </div>

      {/* Main Gradient View - Container is flex-1 and relative */}
      <div 
        className="flex-1 relative flex items-center justify-center p-0 overflow-hidden bg-black"
        onContextMenu={(e) => e.preventDefault()}
      >
          <GradientPreview 
            ref={previewRef}
            settings={settings} 
            onUpdateMeshPoint={updateMeshPoint}
            onUpdateStop={updateStop}
            onUpdateStopMidpoint={updateStopMidpoint}
            onUpdateControlPoint={updateControlPoint}
            onSelectNode={(id, type) => setSelectedNode(id ? { id, type } : null)}
            onAddNode={(x, y) => settings.type === 'mesh' ? addMeshPoint(primaryColor, x, y) : addStop(primaryColor, x, y)}
            onInteractionEnd={() => pushToHistory(settings)}
            onHoldChange={setIsHolding}
            selectedNode={selectedNode}
            isOverlayOpen={showGlobalSettings || showLibrary || showExportConfirm || !!uploadedImageUrl}
            hideTooltip={hasAddedNode}
            hideNodes={isHolding}
            className="w-full h-full"
          />
      </div>

      {/* Bottom Bar Controls */}
      <div className="z-20 p-6 flex items-center justify-center bg-black/50 backdrop-blur-md border-t border-white/5">
        <div className="flex gap-3">
          <div 
            className="flex items-center rounded-full p-[2px] shadow-2xl transition-all duration-500"
            style={{ backgroundImage: `url(${currentGradientDataUrl})`, backgroundSize: '100% 100%' }}
          >
            <div className="flex items-center bg-neutral-950 backdrop-blur-xl rounded-full p-1 gap-1">
              <button 
                onClick={saveCurrentGradient}
                className="p-2 text-white/70 hover:text-white transition-all active:scale-90"
                title="Save to Library"
              >
                <Bookmark size={18} />
              </button>
              <div className="w-[1px] h-4 bg-white/10" />
              <button 
                onClick={() => {
                  setShowLibrary(!showLibrary);
                  setShowGlobalSettings(false);
                  setSelectedNode(null);
                  setUploadedImageUrl(null);
                }}
                className="p-2 text-white/70 hover:text-white transition-all active:scale-90"
                title="Open Library"
              >
                <History size={18} style={{ color: showLibrary ? primaryColor : undefined }} />
              </button>
            </div>
          </div>
          
          <div 
            className="flex items-center rounded-full p-[2px] shadow-2xl transition-all duration-500"
            style={{ backgroundImage: `url(${currentGradientDataUrl})`, backgroundSize: '100% 100%' }}
          >
            <div className="flex items-center bg-neutral-950 backdrop-blur-xl rounded-full p-1 gap-1">
              <button 
                onClick={undo}
                disabled={historyIndex === 0}
                className="p-2 text-white/70 hover:text-white transition-all active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed"
                title="Undo"
              >
                <Undo2 size={18} />
              </button>
              <div className="w-[1px] h-4 bg-white/10" />
              <button 
                onClick={redo}
                disabled={historyIndex === history.length - 1}
                className="p-2 text-white/70 hover:text-white transition-all active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed"
                title="Redo"
              >
                <Redo2 size={18} />
              </button>
            </div>
          </div>

          <div 
            className="flex items-center rounded-full p-[2px] shadow-2xl transition-all duration-500"
            style={{ backgroundImage: `url(${currentGradientDataUrl})`, backgroundSize: '100% 100%' }}
          >
            <div className="flex items-center bg-neutral-950 backdrop-blur-xl rounded-full p-1 gap-1">
              <button 
                onClick={() => {
                  setShowGlobalSettings(!showGlobalSettings);
                  setShowLibrary(false);
                  setSelectedNode(null);
                  setUploadedImageUrl(null);
                }}
                className="p-2 text-white/70 hover:text-white transition-all active:scale-90"
                title="Settings"
              >
                <Settings2 size={18} style={{ color: showGlobalSettings ? primaryColor : undefined }} />
              </button>
              <div className="w-[1px] h-4 bg-white/10" />
              <button 
                onClick={handleExport}
                className="p-2 text-white/70 hover:text-white transition-all active:scale-90"
                title="Export Gradient"
              >
                <Download size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Backdrop for overlays */}
      <AnimatePresence>
        {(showGlobalSettings || showLibrary || showExportConfirm || uploadedImageUrl) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeAllOverlays}
            className="fixed inset-0 z-[90] bg-transparent"
          />
        )}
      </AnimatePresence>

      {/* Floating Node Pop-up - Positioned below the gradient view */}
      <AnimatePresence>
        {activeNodeData && (
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-x-0 bottom-0 z-[100] w-full max-w-2xl mx-auto h-[50vh] bg-white/70 backdrop-blur-xl rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.3)] border-t border-white/40 overflow-hidden"
          >
            {/* Top Bar - Floating Actions */}
            <div className="absolute top-5 inset-x-5 flex items-center justify-between z-20 pointer-events-none">
              <button 
                onClick={() => {
                  if (selectedNode?.type === 'mesh') removeMeshPoint(selectedNode.id);
                  else if (selectedNode?.type === 'stop') removeStop(selectedNode.id);
                }}
                className="p-2.5 bg-red-500 rounded-full text-white hover:bg-red-600 hover:scale-110 transition-all pointer-events-auto shadow-xl"
                title="Delete Node"
              >
                <Trash2 size={18} />
              </button>

              <div /> {/* Spacer to keep buttons at ends */}

              <button 
                onClick={() => {
                  if (activeNodeData) addToColorHistory(activeNodeData.color);
                  setSelectedNode(null);
                }}
                className="p-2.5 bg-black/60 rounded-full text-white hover:scale-110 transition-transform pointer-events-auto shadow-xl"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="h-full overflow-y-auto p-8 pt-7 pb-12">
              <div className="flex items-center justify-center mb-8">
                <h1 className="text-sm font-mono font-black text-neutral-900 uppercase tracking-[0.2em] leading-none">
                  Color Node Settings
                </h1>
              </div>
              <div className="flex flex-col gap-8">
                {/* Top Section: Preview + HSB Sliders */}
                <div className="flex items-center gap-8">
                  {/* Color Preview */}
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-black/10 shadow-xl shrink-0 group">
                    <input
                      type="color"
                      value={activeNodeData.color}
                      onChange={(e) => {
                        if (selectedNode?.type === 'mesh') updateMeshPoint(selectedNode.id, { color: e.target.value });
                        else if (selectedNode?.type === 'stop') updateStop(selectedNode.id, { color: e.target.value });
                        else if (selectedNode?.type === 'control' && activeNodeData) updateStop(activeNodeData.id, { color: e.target.value });
                      }}
                      onBlur={() => {
                        pushToHistory(settings);
                        addToColorHistory(activeNodeData.color);
                      }}
                      className="absolute inset-[-100%] w-[300%] h-[300%] cursor-pointer"
                    />
                    <div className="absolute inset-0 pointer-events-none border-4 border-white/20 rounded-full group-hover:border-white/40 transition-colors" />
                  </div>

                  {/* HSB Sliders */}
                  <div className="flex-1 space-y-4 bg-black/5 p-6 rounded-[40px] border border-black/10">
                    {['h', 's', 'b'].map((channel) => {
                      const hsb = hsbState?.hsb || hexToHsb(activeNodeData.color);
                      const max = channel === 'h' ? 360 : 100;
                      return (
                        <div key={channel} className="flex flex-col gap-2">
                          <div className="flex justify-between items-center px-1">
                            <div className="flex items-center">
                              <span className="text-[10px] font-black text-black uppercase tracking-widest">
                                {channel === 'h' ? 'H' : channel === 's' ? 'S' : 'B'}
                              </span>
                              <span className="text-[10px] font-bold text-black/30 uppercase tracking-widest">
                                {channel === 'h' ? 'UE' : channel === 's' ? 'ATURATION' : 'RIGHTNESS'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max={max}
                                value={hsb[channel as keyof typeof hsb]}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  const newHsb = { ...hsb, [channel]: val };
                                  setHsbState({ id: selectedNode!.id, hsb: newHsb });
                                  const hex = hsbToHex(newHsb.h, newHsb.s, newHsb.b);
                                  if (selectedNode?.type === 'mesh') updateMeshPoint(selectedNode.id, { color: hex });
                                  else if (selectedNode?.type === 'stop') updateStop(selectedNode.id, { color: hex });
                                  else if (selectedNode?.type === 'control' && activeNodeData) updateStop(activeNodeData.id, { color: hex });
                                }}
                                className="text-[10px] font-mono font-black text-neutral-900 bg-white/50 rounded-md w-10 text-center py-0.5 outline-none focus:bg-white"
                              />
                              <span className="text-[10px] font-mono font-bold text-black/20">{channel === 'h' ? '°' : '%'}</span>
                            </div>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max={max}
                            value={hsb[channel as keyof typeof hsb]}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              const newHsb = { ...hsb, [channel]: val };
                              setHsbState({ id: selectedNode!.id, hsb: newHsb });
                              const hex = hsbToHex(newHsb.h, newHsb.s, newHsb.b);
                              if (selectedNode?.type === 'mesh') updateMeshPoint(selectedNode.id, { color: hex });
                              else if (selectedNode?.type === 'stop') updateStop(selectedNode.id, { color: hex });
                              else if (selectedNode?.type === 'control' && activeNodeData) updateStop(activeNodeData.id, { color: hex });
                            }}
                            onMouseUp={() => pushToHistory(settings)}
                            onTouchEnd={() => pushToHistory(settings)}
                            className="range-lg w-full"
                            style={{ '--range-thumb-color': activeNodeData.color } as React.CSSProperties}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Section: Hex + RGB */}
                <div className="flex items-center gap-12 px-4">
                  {/* Hex */}
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Hex</span>
                    <input
                      type="text"
                      value={activeNodeData.color}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (selectedNode?.type === 'mesh') updateMeshPoint(selectedNode.id, { color: val });
                        else if (selectedNode?.type === 'stop') updateStop(selectedNode.id, { color: val });
                        else if (selectedNode?.type === 'control' && activeNodeData) updateStop(activeNodeData.id, { color: val });
                      }}
                      onBlur={() => {
                        pushToHistory(settings);
                        addToColorHistory(activeNodeData.color);
                      }}
                      className="text-[10px] font-mono font-black text-neutral-900 uppercase tracking-tighter bg-transparent border-b border-neutral-200 focus:border-black outline-none w-24 pb-1"
                    />
                  </div>

                  {/* RGB */}
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">RGB</span>
                    <div className="flex gap-3">
                      {['r', 'g', 'b'].map((channel) => {
                        const rgb = hexToRgb(activeNodeData.color);
                        return (
                          <input
                            key={channel}
                            type="number"
                            min="0"
                            max="255"
                            value={rgb[channel as keyof typeof rgb]}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              const newRgb = { ...rgb, [channel]: val };
                              const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
                              if (selectedNode?.type === 'mesh') updateMeshPoint(selectedNode.id, { color: hex });
                              else if (selectedNode?.type === 'stop') updateStop(selectedNode.id, { color: hex });
                              else if (selectedNode?.type === 'control' && activeNodeData) updateStop(activeNodeData.id, { color: hex });
                            }}
                            className="text-[10px] font-mono font-black text-neutral-900 tracking-tighter bg-transparent border-b border-neutral-200 focus:border-black outline-none w-10 text-center pb-1"
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {colorHistory.length > 0 && (
              <div className="mb-6">
                <span className="text-[8px] font-mono font-black text-neutral-400 uppercase tracking-widest block mb-2">Recent Colors</span>
                <div className="flex flex-wrap gap-2">
                  {colorHistory.map((color, i) => (
                    <button
                      key={`${color}-${i}`}
                      onClick={() => {
                        if (selectedNode?.type === 'mesh') updateMeshPoint(selectedNode.id, { color });
                        else if (selectedNode?.type === 'stop') updateStop(selectedNode.id, { color });
                        else if (selectedNode?.type === 'control' && activeNodeData) updateStop(activeNodeData.id, { color });
                        pushToHistory({
                          ...settings,
                          meshPoints: settings.meshPoints.map(p => p.id === selectedNode?.id ? { ...p, color } : p),
                          stops: settings.stops.map(s => s.id === (selectedNode?.type === 'control' ? activeNodeData?.id : selectedNode?.id) ? { ...s, color } : s)
                        });
                      }}
                      className="w-6 h-6 rounded-lg border border-white shadow-sm transition-transform hover:scale-110 active:scale-90"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}

            {selectedNode?.type === 'mesh' && (
              <div className="space-y-4">
                <div className="flex justify-between text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                  <span>Weight</span>
                  <span className="text-black">{(activeNodeData as MeshPoint).radius}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={(activeNodeData as MeshPoint).radius}
                  onChange={(e) => updateMeshPoint(selectedNode.id, { radius: parseInt(e.target.value) })}
                  onMouseUp={() => pushToHistory(settings)}
                  className="range-lg w-full"
                  style={{ '--range-thumb-color': activeNodeData.color } as React.CSSProperties}
                />
              </div>
            )}

            {selectedNode?.type === 'stop' && (
              <div className="space-y-4">
                <div className="flex justify-between text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                  <span>Position</span>
                  <span className="text-black">{(activeNodeData as ColorStop).position}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={(activeNodeData as ColorStop).position}
                  onChange={(e) => updateStop(selectedNode.id, { position: parseInt(e.target.value) })}
                  onMouseUp={() => pushToHistory(settings)}
                  className="range-lg w-full"
                  style={{ '--range-thumb-color': activeNodeData.color } as React.CSSProperties}
                />
              </div>
            )}
          </div>
        </div>
      </motion.div>
      )}
      </AnimatePresence>

      {/* Global Settings Overlay */}
      <AnimatePresence>
        {showGlobalSettings && (
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-x-0 bottom-0 z-[100] w-full max-w-2xl mx-auto h-[50vh] bg-white/70 backdrop-blur-xl rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.3)] border-t border-white/40 overflow-hidden"
          >
            {/* Close - Floating */}
            <div className="absolute top-5 inset-x-5 flex items-center justify-end z-20 pointer-events-none">
              <button 
                onClick={() => setShowGlobalSettings(false)}
                className="p-2.5 bg-black/60 rounded-full text-white hover:scale-110 transition-transform pointer-events-auto shadow-xl"
              >
                <X size={20} />
              </button>
            </div>

            <div className="h-full overflow-y-auto p-8 pt-7 pb-12">
              <div className="flex items-center justify-between mb-8 pr-10">
                <h1 className="text-sm font-mono font-black text-neutral-900 uppercase tracking-[0.2em] leading-none">
                  Gradient Settings
                </h1>
              </div>

              <div className="space-y-10">
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[10px] font-mono font-black text-neutral-400 uppercase tracking-[0.2em]">Gradient Engine</h2>
                    <div className="flex items-center gap-2">
                      <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                      <button onClick={() => fileInputRef.current?.click()} className="p-2 text-neutral-400 hover:text-black transition-colors">
                        <ImageIcon size={20} />
                      </button>
                    </div>
                  </div>
                  <div className="bg-neutral-100 p-1 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-1">
                    {[
                      { id: 'linear', icon: Layers, label: 'Linear' },
                      { id: 'radial', icon: Circle, label: 'Radial' },
                      { id: 'conic', icon: Compass, label: 'Conic' },
                      { id: 'mesh', icon: Sparkles, label: 'Mesh' },
                    ].map((type) => (
                      <button
                        key={type.id}
                        onClick={() => {
                          const next = { ...settings, type: type.id as any };
                          setSettings(next);
                          pushToHistory(next);
                        }}
                        className={cn(
                          "flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl transition-all",
                          settings.type === type.id ? "bg-black shadow-md text-white" : "text-neutral-400 hover:text-neutral-600"
                        )}
                      >
                        <type.icon size={14} strokeWidth={2.5} className="shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-tight sm:tracking-widest">{type.label}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex justify-between text-[10px] font-mono font-black text-neutral-400 uppercase tracking-[0.2em]">
                    <span>Texture Noise</span>
                    <span className="text-black">{settings.noise}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.noise}
                    onChange={(e) => {
                      const next = { ...settings, noise: parseInt(e.target.value) };
                      setSettings(next);
                    }}
                    onMouseUp={() => pushToHistory(settings)}
                    className="w-full h-2 bg-neutral-200 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: '#000' }}
                  />
                </section>

                <section className="space-y-4">
                  <h2 className="text-[10px] font-mono font-black text-neutral-400 uppercase tracking-[0.2em]">Canvas Ratio</h2>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '1:1', w: 1, h: 1 },
                      { label: '4:5', w: 4, h: 5 },
                      { label: '16:9', w: 16, h: 9 },
                      { label: '9:16', w: 9, h: 16 },
                    ].map((r) => (
                      <button
                        key={r.label}
                        onClick={() => {
                          const next = { ...settings, ratio: { width: r.w, height: r.h } };
                          setSettings(next);
                          pushToHistory(next);
                        }}
                        className={cn(
                          "py-2 rounded-xl text-[10px] font-black transition-all border",
                          settings.ratio.width === r.w && settings.ratio.height === r.h 
                            ? "bg-black text-white border-black" 
                            : "bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400"
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative grid grid-cols-2 gap-4">
                    <div className="p-5 bg-white/50 rounded-[32px] border border-neutral-200">
                      <span className="text-[10px] font-black text-neutral-400 uppercase block mb-1">Width Ratio</span>
                      <input
                        type="number" value={settings.ratio.width}
                        onChange={(e) => {
                          const next = { ...settings, ratio: { ...settings.ratio, width: parseFloat(e.target.value) || 1 } };
                          setSettings(next);
                        }}
                        onBlur={() => pushToHistory(settings)}
                        className="w-full bg-transparent text-xl font-black outline-none"
                      />
                    </div>
                    
                    {/* Swap Button */}
                    <button 
                      onClick={() => {
                        const next = { 
                          ...settings, 
                          ratio: { 
                            width: settings.ratio.height, 
                            height: settings.ratio.width 
                          } 
                        };
                        setSettings(next);
                        pushToHistory(next);
                      }}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 p-2 bg-black text-white rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all"
                      title="Swap Ratio"
                    >
                      <ArrowLeftRight size={14} />
                    </button>

                    <div className="p-5 bg-white/50 rounded-[32px] border border-neutral-200">
                      <span className="text-[10px] font-black text-neutral-400 uppercase block mb-1">Height Ratio</span>
                      <input
                        type="number" value={settings.ratio.height}
                        onChange={(e) => {
                          const next = { ...settings, ratio: { ...settings.ratio, height: parseFloat(e.target.value) || 1 } };
                          setSettings(next);
                        }}
                        onBlur={() => pushToHistory(settings)}
                        className="w-full bg-transparent text-xl font-black outline-none"
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h2 className="text-[10px] font-mono font-black text-neutral-400 uppercase tracking-[0.2em]">Export Quality (DPI)</h2>
                  <div className="grid grid-cols-4 gap-2">
                    {[72, 150, 300, 600].map((dpi) => (
                      <button
                        key={dpi}
                        onClick={() => {
                          const next = { ...settings, exportDpi: dpi };
                          setSettings(next);
                          pushToHistory(next);
                        }}
                        className={cn(
                          "py-2 rounded-xl text-[10px] font-black transition-all border",
                          settings.exportDpi === dpi 
                            ? "bg-black text-white border-black" 
                            : "bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400"
                        )}
                      >
                        {dpi}
                      </button>
                    ))}
                  </div>
                  <div className="p-5 bg-white/50 rounded-[32px] border border-neutral-200">
                    <span className="text-[10px] font-black text-neutral-400 uppercase block mb-1">Custom DPI</span>
                    <input
                      type="number" value={settings.exportDpi}
                      onChange={(e) => {
                        const next = { ...settings, exportDpi: parseInt(e.target.value) || 72 };
                        setSettings(next);
                      }}
                      onBlur={() => pushToHistory(settings)}
                      className="w-full bg-transparent text-xl font-black outline-none"
                    />
                  </div>
                </section>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Library Overlay */}
      <AnimatePresence>
        {showLibrary && (
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-x-0 bottom-0 z-[100] w-full max-w-2xl mx-auto h-[50vh] bg-white/70 backdrop-blur-xl rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.3)] border-t border-white/40 overflow-hidden"
          >
            {/* Close - Floating */}
            <div className="absolute top-5 inset-x-5 flex items-center justify-end z-20 pointer-events-none">
              <button 
                onClick={() => setShowLibrary(false)}
                className="p-2.5 bg-black/60 rounded-full text-white hover:scale-110 transition-transform pointer-events-auto shadow-xl"
              >
                <X size={20} />
              </button>
            </div>

            <div className="h-full overflow-y-auto p-8 pt-7 pb-12">
              <div className="flex items-center justify-between mb-8 pr-10">
              <div>
                <h1 className="text-sm font-mono font-black text-neutral-900 uppercase tracking-[0.2em] leading-none">
                  Gradient Library
                </h1>
                <p className="text-[10px] font-mono text-neutral-400 tracking-widest uppercase mt-1">
                  {savedGradients.length} Saved Designs
                </p>
              </div>
            </div>

            {savedGradients.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8">
                {savedGradients.map((saved) => (
                  <div 
                    key={saved.id}
                    className="group relative flex flex-col"
                  >
                    <div className="relative w-full aspect-square flex items-center justify-center bg-neutral-100 rounded-[32px] overflow-hidden p-4 border border-neutral-200 shadow-inner">
                      <button
                        onClick={() => loadSavedGradient(saved.settings)}
                        className="relative shadow-2xl transition-all hover:scale-105 active:scale-95 overflow-hidden rounded-xl border border-white/20 flex items-center justify-center"
                        style={{ 
                          aspectRatio: `${saved.settings.ratio?.width || 1} / ${saved.settings.ratio?.height || 1}`,
                          maxWidth: '100%',
                          maxHeight: '100%',
                          width: (saved.settings.ratio?.width || 1) >= (saved.settings.ratio?.height || 1) ? '100%' : 'auto',
                          height: (saved.settings.ratio?.height || 1) > (saved.settings.ratio?.width || 1) ? '100%' : 'auto',
                        }}
                      >
                        <MiniGradient 
                          settings={saved.settings} 
                          className="w-full h-full"
                          width={200}
                          height={200}
                        />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteSavedGradient(saved.id); }}
                        className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-lg z-10"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    
                    <div className="mt-4 px-2 space-y-1">
                      <input
                        type="text"
                        value={saved.name}
                        onChange={(e) => renameSavedGradient(saved.id, e.target.value)}
                        className="w-full bg-transparent text-[10px] font-mono font-bold text-neutral-900 uppercase tracking-tight outline-none border-b border-transparent focus:border-neutral-300 transition-colors"
                      />
                      <div className="flex items-center justify-between text-[8px] font-mono text-neutral-400 uppercase tracking-widest">
                        <span>{saved.settings.type}</span>
                        <span>{saved.settings.ratio?.width || 1}:{saved.settings.ratio?.height || 1}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 flex flex-col items-center justify-center text-neutral-300 border-2 border-dashed border-neutral-200 rounded-[40px]">
                <History size={48} className="mb-4 opacity-20" />
                <p className="text-xs font-mono uppercase tracking-widest">Library is empty</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Save Success Toast */}
      <AnimatePresence>
        {showSaveToast && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="absolute top-24 left-1/2 z-[100] bg-emerald-500 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/20"
          >
            <BookmarkCheck size={20} />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Saved to Library</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Photo Picker Overlay */}
      <AnimatePresence>
        {uploadedImageUrl && (
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] bg-white/70 backdrop-blur-xl flex flex-col p-8"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-mono font-black tracking-tighter uppercase">PHOTO SOURCE</h2>
              <button 
                onClick={() => setUploadedImageUrl(null)} 
                className="p-2 bg-black/60 rounded-full text-white hover:scale-110 transition-transform shadow-xl"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden rounded-[40px] shadow-2xl">
              <ImageColorPicker 
                imageUrl={uploadedImageUrl} 
                onColorPick={handleManualColorPick}
                onClose={() => setUploadedImageUrl(null)}
                mode="point"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Export Confirmation Dialog */}
      <AnimatePresence>
        {showExportConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[110] bg-black/60 flex items-center justify-center p-8"
          >
            <motion.div
              ref={popupRef}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white/70 backdrop-blur-xl rounded-[40px] p-8 w-full max-w-[400px] shadow-2xl border border-white/40"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-sm font-mono font-black text-neutral-900 tracking-[0.5em] uppercase">Export</h2>
                </div>
                <button 
                  onClick={() => setShowExportConfirm(false)}
                  className="p-2 bg-black/60 rounded-full text-white hover:scale-110 transition-transform"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-5">
                <div className="flex items-center justify-start mb-2 px-1">
                  <div className="flex items-center gap-2 bg-neutral-100 px-3 py-1 rounded-full border border-neutral-200">
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Ratio</span>
                    <span className="text-[10px] font-black text-neutral-900">{settings.ratio.width}:{settings.ratio.height}</span>
                  </div>
                </div>

                <div className="relative aspect-square glass rounded-[40px] border border-white/20 overflow-hidden flex items-center justify-center p-4 sm:p-6">
                  <div 
                    className="shadow-2xl"
                    style={{ 
                      aspectRatio: `${settings.ratio.width} / ${settings.ratio.height}`,
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: settings.ratio.width >= settings.ratio.height ? '100%' : 'auto',
                      height: settings.ratio.height > settings.ratio.width ? '100%' : 'auto',
                      backgroundImage: `url(${currentGradientDataUrl})`,
                      backgroundSize: '100% 100%'
                    }}
                  />
                </div>

                <div className="space-y-4">
                  <div className="p-4 glass rounded-[32px] border border-white/20">
                    <div className="flex justify-between text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">
                      <span>Texture Noise</span>
                      <span className="text-black">{settings.noise}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.noise}
                      onChange={(e) => {
                        const next = { ...settings, noise: parseInt(e.target.value) };
                        setSettings(next);
                      }}
                      onMouseUp={() => pushToHistory(settings)}
                      className="w-full h-2 bg-neutral-200 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: '#000' }}
                    />
                  </div>

                  <div className="p-4 glass rounded-[32px] border border-white/20">
                    <span className="text-[10px] font-black text-neutral-400 uppercase block mb-1">Export DPI</span>
                    <input
                      type="number" 
                      value={confirmDpi}
                      onChange={(e) => setConfirmDpi(parseInt(e.target.value) || 72)}
                      className="w-full bg-transparent text-xl font-black outline-none text-neutral-900"
                    />
                  </div>
                </div>

                <button
                  onClick={() => executeExport(confirmDpi)}
                  className="w-full py-4 text-white rounded-[32px] font-black uppercase tracking-[0.2em] text-sm shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                  style={{
                    backgroundImage: `url(${currentGradientDataUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                  }}
                >
                  <Download size={20} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />
                  Generate & Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
