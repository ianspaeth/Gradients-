import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, RotateCcw, Layers, Circle, Sparkles, Settings2, Image as ImageIcon, X, Download, Trash2, Bookmark, BookmarkCheck, History, Undo2, Redo2, Compass, ArrowLeftRight, Slash, Cone, FileJson, FileCode, FileType, Copy, Upload, FileDown, FileUp } from 'lucide-react';
import { GradientPreview, GradientPreviewHandle } from './components/GradientPreview';
import { MiniGradient } from './components/MiniGradient';
import { useGradientDataUrl } from './hooks/useGradientDataUrl';
import { ImageColorPicker } from './components/ImageColorPicker';
import { GradientSettings, ColorStop, MeshPoint } from './types';
import { cn } from './lib/utils';
import { extractColorsFromImage } from './lib/imageUtils';
import { drawVectorToPdf } from './lib/gradient-renderer';
import { jsPDF } from 'jspdf';

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
  const [historyState, setHistoryState] = useState({
    items: [settings],
    index: 0
  });
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ id: string; type: 'mesh' | 'stop' | 'control' } | null>(null);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [colorMode, setColorMode] = useState<'hex' | 'rgb' | 'hsb'>('hsb');
  const [isHolding, setIsHolding] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exportSettings, setExportSettings] = useState<GradientSettings | null>(null);
  const activeSettings = exportSettings || settings;
  const previewWidth = activeSettings.ratio.width >= activeSettings.ratio.height ? 200 : 200 * (activeSettings.ratio.width / activeSettings.ratio.height);
  const previewHeight = activeSettings.ratio.height >= activeSettings.ratio.width ? 200 : 200 * (activeSettings.ratio.height / activeSettings.ratio.width);
  const currentGradientDataUrl = useGradientDataUrl(activeSettings, previewWidth, previewHeight);
  const [confirmDpi, setConfirmDpi] = useState(300);
  const [exportType, setExportType] = useState<'png' | 'svg' | 'pdf' | 'json'>('png');
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [savedGradients, setSavedGradients] = useState<{ id: string; name: string; settings: GradientSettings }[]>([]);
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const bulkImportInputRef = useRef<HTMLInputElement>(null);
  const [colorHistory, setColorHistory] = useState<string[]>([]);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hsbState, setHsbState] = useState<{ id: string, hsb: { h: number, s: number, b: number } } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<GradientPreviewHandle>(null);
  const exportPreviewRef = useRef<GradientPreviewHandle>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Backdrop and Click Handling
  const closeAllOverlays = () => {
    setSelectedNode(null);
    setShowGlobalSettings(false);
    setShowLibrary(false);
    setShowExportConfirm(false);
    setUploadedImageUrl(null);
    setHasInteracted(true);
  };

  const pushToHistory = useCallback((newSettings: GradientSettings) => {
    const currentSettingsStr = JSON.stringify(newSettings);
    
    setHistoryState(prev => {
      const lastSettingsStr = JSON.stringify(prev.items[prev.index]);
      if (currentSettingsStr === lastSettingsStr) return prev;
      
      const newItems = prev.items.slice(0, prev.index + 1);
      newItems.push(JSON.parse(currentSettingsStr));
      if (newItems.length > 50) newItems.shift();
      
      return {
        items: newItems,
        index: newItems.length - 1
      };
    });
  }, []);

  const undo = () => {
    setHistoryState(prev => {
      if (prev.index > 0) {
        const nextIndex = prev.index - 1;
        const nextSettings = JSON.parse(JSON.stringify(prev.items[nextIndex]));
        setSettings(nextSettings);
        setSelectedNode(null);
        return { ...prev, index: nextIndex };
      }
      return prev;
    });
  };

  const redo = () => {
    setHistoryState(prev => {
      if (prev.index < prev.items.length - 1) {
        const nextIndex = prev.index + 1;
        const nextSettings = JSON.parse(JSON.stringify(prev.items[nextIndex]));
        setSettings(nextSettings);
        setSelectedNode(null);
        return { ...prev, index: nextIndex };
      }
      return prev;
    });
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
      const next = [color, ...filtered].slice(0, 36);
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

  const exportLibrary = () => {
    if (savedGradients.length === 0) return;
    setIsBulkExporting(true);
    setBulkProgress(0);
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        const dataStr = JSON.stringify(savedGradients, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `gradient-library-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setTimeout(() => setIsBulkExporting(false), 500);
      }
      setBulkProgress(progress);
    }, 100);
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsBulkImporting(true);
    setBulkProgress(0);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          const validGradients = imported.filter(g => g.settings);
          
          setSavedGradients(prev => {
            const newGradients = validGradients.map(g => ({
              id: Math.random().toString(36).substr(2, 9),
              name: g.name || 'Imported Gradient',
              settings: g.settings
            }));
            return [...prev, ...newGradients];
          });
          
          let progress = 0;
          const interval = setInterval(() => {
            progress += Math.random() * 20;
            if (progress >= 100) {
              progress = 100;
              clearInterval(interval);
              setTimeout(() => setIsBulkImporting(false), 500);
            }
            setBulkProgress(progress);
          }, 100);
        } else {
          alert('Invalid library file format.');
          setIsBulkImporting(false);
        }
      } catch (err) {
        console.error('Failed to import library', err);
        alert('Failed to parse library file.');
        setIsBulkImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const randomizeColors = () => {
    const next = {
      ...settings,
      stops: settings.stops.map(s => ({ ...s, color: generateRandomColor() })),
      meshPoints: settings.meshPoints.map(p => ({ ...p, color: generateRandomColor() })),
    };
    setSettings(next);
    pushToHistory(next);
    setHasInteracted(true);
  };

  const primaryColor = settings.type === 'mesh' 
    ? settings.meshPoints[0]?.color || '#6366f1'
    : settings.stops[0]?.color || '#6366f1';

  const addStop = useCallback((color: string = '#ec4899', x?: number, y?: number) => {
    const newId = Math.random().toString(36).substr(2, 9);
    
    let newPosition = 50;
    let targetX = x ?? (Math.random() * 80 + 10);
    let targetY = y ?? (Math.random() * 80 + 10);

    // If coordinates are provided (from a click/tap), project them onto the control line
    if (x !== undefined && y !== undefined) {
      const cp = settings.controlPoints || { start: { x: 20, y: 20 }, end: { x: 80, y: 80 } };
      const dx = cp.end.x - cp.start.x;
      const dy = cp.end.y - cp.start.y;
      const lenSq = dx * dx + dy * dy;

      if (lenSq > 0) {
        // Project (x, y) onto the line segment defined by cp.start and cp.end
        const t = Math.max(0, Math.min(1, ((x - cp.start.x) * dx + (y - cp.start.y) * dy) / lenSq));
        newPosition = t * 100;
        targetX = cp.start.x + t * dx;
        targetY = cp.start.y + t * dy;
      }
    } else {
      // Fallback if no coordinates provided
      const lastStop = settings.stops[settings.stops.length - 1];
      newPosition = Math.min(100, lastStop.position + 10);
    }
    
    const next = {
      ...settings,
      stops: [...settings.stops, { 
        id: newId, 
        color, 
        position: newPosition,
        midpoint: 50,
        x: targetX,
        y: targetY
      }].sort((a, b) => a.position - b.position),
    };
    setSettings(next);
    pushToHistory(next);
    setHasInteracted(true);
  }, [settings, pushToHistory]);

  const removeStop = useCallback((id: string) => {
    if (settings.stops.length <= 2) return;
    const next = {
      ...settings,
      stops: settings.stops.filter(s => s.id !== id),
    };
    setSettings(next);
    pushToHistory(next);
    if (selectedNode?.id === id) setSelectedNode(null);
  }, [settings, selectedNode, pushToHistory]);

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
    const next = {
      ...settings,
      meshPoints: [...settings.meshPoints, { 
        id: newId, 
        color, 
        x: x ?? (Math.random() * 100), 
        y: y ?? (Math.random() * 100), 
        radius: 50 
      }],
    };
    setSettings(next);
    pushToHistory(next);
    setHasInteracted(true);
  }, [settings, pushToHistory]);

  const removeMeshPoint = useCallback((id: string) => {
    if (settings.meshPoints.length <= 1) return;
    const next = {
      ...settings,
      meshPoints: settings.meshPoints.filter(p => p.id !== id),
    };
    setSettings(next);
    pushToHistory(next);
    if (selectedNode?.id === id) setSelectedNode(null);
  }, [settings, selectedNode, pushToHistory]);

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
      setHasInteracted(true);
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
    setExportType('png');
    setShowExportConfirm(true);
    setSelectedNode(null);
  };

  const getExportFilename = (extension: string) => {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const timestamp = `${day}.${month}.${year}_${hh}${mm}`;
    return `stgradient_${timestamp}.${extension}`;
  };

  const executeExport = async (dpi: number) => {
    const activeRef = exportSettings ? exportPreviewRef : previewRef;
    const currentRef = activeRef.current;
    if (!currentRef) return;
    
    const activeSettings = exportSettings || settings;
    
    // Update settings with the confirmed DPI for future exports
    if (!exportSettings) {
      setSettings(prev => ({ ...prev, exportDpi: dpi }));
    }

    if (exportType === 'png') {
      const filename = getExportFilename('png');
      // Try Web Share API first (best for mobile "Save to Photos")
      try {
        if (navigator.share && navigator.canShare) {
          const blob = await currentRef.getExportBlob(dpi);
          if (blob) {
            const file = new File([blob], filename, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: 'GRADIENTS! GRADIENTS! GRADIENTS!',
                text: 'My custom gradient from GRADIENTS! GRADIENTS! GRADIENTS!'
              });
              setExportSettings(null);
              setShowExportConfirm(false);
              return;
            }
          }
        }
      } catch (e) {
        console.warn('Sharing failed, falling back to download', e);
      }

      // Fallback to standard download
      const dataUrl = currentRef.getExportDataUrl(dpi);
      if (dataUrl) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
      }
    } else if (exportType === 'svg') {
      const svgString = currentRef.getExportSvg(dpi);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = getExportFilename('svg');
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } else if (exportType === 'pdf') {
      const pdf = new jsPDF({
        orientation: activeSettings.ratio.width >= activeSettings.ratio.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [activeSettings.ratio.width * 100, activeSettings.ratio.height * 100]
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Try vector export first
      const success = drawVectorToPdf(pdf, pdfWidth, pdfHeight, activeSettings);
      
      if (!success) {
        // Fallback to raster if vector export failed (e.g. noise is present)
        const dataUrl = currentRef.getExportDataUrl(dpi);
        if (dataUrl) {
          const imgProps = pdf.getImageProperties(dataUrl);
          const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
          pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, imgHeight);
        }
      }
      
      pdf.save(getExportFilename('pdf'));
    } else if (exportType === 'json') {
      const jsonString = JSON.stringify(activeSettings, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = getExportFilename('gdnt');
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
    setExportSettings(null);
    setShowExportConfirm(false);
  };

  const copyBulkHex = () => {
    const colors = activeSettings.type === 'mesh' 
      ? activeSettings.meshPoints.map(p => p.color)
      : activeSettings.stops.map(s => s.color);
    
    const hexString = colors.join(', ');
    navigator.clipboard.writeText(hexString).then(() => {
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 2000);
    });
  };

  const handleGdntUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const uploadedSettings = JSON.parse(event.target?.result as string);
        // Basic validation
        if (uploadedSettings.type && (uploadedSettings.stops || uploadedSettings.meshPoints)) {
          // Only add to library, do not open in main canvas
          const id = Math.random().toString(36).substr(2, 9);
          const now = new Date();
          const day = now.getDate().toString().padStart(2, '0');
          const month = now.toLocaleString('en-GB', { month: 'short' });
          const year = now.getFullYear();
          const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
          const name = `Imported ${day} ${month} ${year}, ${time}`;
          
          setSavedGradients(prev => [...prev, { id, name, settings: JSON.parse(JSON.stringify(uploadedSettings)) }]);
          setShowSaveToast(true);
          setTimeout(() => setShowSaveToast(false), 2000);

          setShowLibrary(true); // Keep library open
        }
      } catch (err) {
        console.error('Failed to parse .gdnt file', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const activeNodeData = React.useMemo(() => {
    if (!selectedNode) return null;
    if (selectedNode.type === 'mesh') {
      return settings.meshPoints.find(p => p.id === selectedNode.id);
    }
    if (selectedNode.type === 'control') {
      return selectedNode.id === 'start' 
        ? settings.stops.reduce((prev, curr) => prev.position < curr.position ? prev : curr)
        : settings.stops.reduce((prev, curr) => prev.position > curr.position ? prev : curr);
    }
    return settings.stops.find(s => s.id === selectedNode.id);
  }, [settings.meshPoints, settings.stops, selectedNode]);
  
  useEffect(() => {
    if (activeNodeData && selectedNode) {
      const currentHsb = hexToHsb(activeNodeData.color);
      
      // Check if the current hsbState already produces this hex color
      // If it does, we don't want to override it with lossy hexToHsb values (e.g. when S or B is 0)
      const currentColorFromHsb = hsbState ? hsbToHex(hsbState.hsb.h, hsbState.hsb.s, hsbState.hsb.b) : null;
      const isDifferentColor = !hsbState || currentColorFromHsb !== activeNodeData.color.toLowerCase();
      const isDifferentId = !hsbState || hsbState.id !== selectedNode.id;

      if (isDifferentId || isDifferentColor) {
        setHsbState({ id: selectedNode.id, hsb: currentHsb });
      }
    } else if (hsbState !== null) {
      setHsbState(null);
    }
  }, [activeNodeData?.color, selectedNode?.id]); // hsbState is intentionally omitted to prevent infinite loops

  return (
    <div className="h-screen w-screen overflow-hidden bg-black flex flex-col relative font-sans select-none">
      {/* Header */}
      <div className="z-20 p-6 flex items-center justify-center bg-black/50 backdrop-blur-md border-b border-white/5">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center"
        >
          <button 
            onClick={() => {
              randomizeColors();
              setHasInteracted(true);
            }}
            className="flex flex-col items-center group active:scale-95 transition-transform outline-none"
          >
            <h1 
              className="text-sm font-mono font-black tracking-[0.5em] uppercase bg-clip-text text-transparent transition-all duration-500 text-center leading-tight group-hover:opacity-80"
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
          </button>
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
            onSelectNode={(id, type) => {
              setSelectedNode(id ? { id, type } : null);
              if (id) setHasInteracted(true);
            }}
            onAddNode={(x, y) => {
              setHasInteracted(true);
              if (settings.type === 'mesh') addMeshPoint(primaryColor, x, y);
              else addStop(primaryColor, x, y);
            }}
            onInteractionEnd={() => {
              pushToHistory(settings);
              setHasInteracted(true);
            }}
            onHoldChange={setIsHolding}
            selectedNode={selectedNode}
            isOverlayOpen={showGlobalSettings || showLibrary || showExportConfirm || !!uploadedImageUrl}
            hideTooltip={hasInteracted}
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
                onClick={() => {
                  saveCurrentGradient();
                  setHasInteracted(true);
                }}
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
                  setHasInteracted(true);
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
                disabled={historyState.index === 0}
                className="p-2 text-white/70 hover:text-white transition-all active:scale-90 disabled:opacity-20 disabled:cursor-not-allowed"
                title="Undo"
              >
                <Undo2 size={18} />
              </button>
              <div className="w-[1px] h-4 bg-white/10" />
              <button 
                onClick={redo}
                disabled={historyState.index === historyState.items.length - 1}
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
                  setHasInteracted(true);
                }}
                className="p-2 text-white/70 hover:text-white transition-all active:scale-90"
                title="Settings"
              >
                <Settings2 size={18} style={{ color: showGlobalSettings ? primaryColor : undefined }} />
              </button>
              <div className="w-[1px] h-4 bg-white/10" />
              <button 
                onClick={() => {
                  handleExport();
                  setHasInteracted(true);
                }}
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
              <div className="flex items-center gap-2 pointer-events-auto">
                <button 
                  onClick={() => {
                    if (selectedNode?.type === 'mesh') removeMeshPoint(selectedNode.id);
                    else if (selectedNode?.type === 'stop') removeStop(selectedNode.id);
                  }}
                  className="p-2.5 bg-red-500 rounded-full text-white hover:bg-red-600 hover:scale-110 transition-all shadow-xl"
                  title="Delete Node"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              {/* Centered Title */}
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center pointer-events-auto">
                <h1 className="text-sm font-mono font-black text-neutral-900 uppercase tracking-[0.2em] leading-none whitespace-nowrap">
                  Color Node Settings
                </h1>
              </div>

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
            
            <div className="h-full overflow-y-auto p-8 pt-24 pb-12">
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
                                  setHasInteracted(true);
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
                              setHasInteracted(true);
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
            {/* Top Bar - Floating Actions */}
            <div className="absolute top-5 inset-x-5 flex items-center justify-between z-20 pointer-events-none">
              <div className="flex items-center gap-2 pointer-events-auto">
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="p-2.5 bg-black/60 rounded-full text-white hover:scale-110 transition-transform shadow-xl"
                  title="Upload Image"
                >
                  <ImageIcon size={18} />
                </button>
              </div>

              {/* Centered Title */}
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center pointer-events-auto">
                <h1 className="text-sm font-mono font-black text-neutral-900 uppercase tracking-[0.2em] leading-none whitespace-nowrap">
                  Gradient Settings
                </h1>
              </div>

              <button 
                onClick={() => setShowGlobalSettings(false)}
                className="p-2.5 bg-black/60 rounded-full text-white hover:scale-110 transition-transform pointer-events-auto shadow-xl"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="h-full overflow-y-auto p-8 pt-24 pb-12">
              <div className="space-y-10">
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[10px] font-mono font-black text-neutral-400 uppercase tracking-[0.2em]">Gradient Engine</h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'linear', icon: Slash, label: 'Linear' },
                      { id: 'radial', icon: Circle, label: 'Radial' },
                      { id: 'conic', icon: Cone, label: 'Conic' },
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
                          "flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl transition-all border",
                          settings.type === type.id 
                            ? "bg-black text-white border-black shadow-lg scale-[1.02]" 
                            : "bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400"
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
                    className="range-lg w-full"
                    style={{ '--range-thumb-color': '#000' } as React.CSSProperties}
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
            {/* Top Bar - Floating Actions */}
            <div className="absolute top-5 inset-x-5 flex items-center justify-between z-20 pointer-events-none">
              <div className="flex items-center gap-2 pointer-events-auto">
                <input type="file" id="gdnt-upload" className="hidden" accept=".gdnt,.json" onChange={handleGdntUpload} />
                <input 
                  type="file" 
                  ref={bulkImportInputRef} 
                  onChange={handleBulkImport} 
                  accept=".json" 
                  className="hidden" 
                />
                <label 
                  htmlFor="gdnt-upload"
                  className="p-2.5 bg-black/60 rounded-full text-white hover:scale-110 transition-transform cursor-pointer shadow-xl"
                  title="Upload .gdnt file"
                >
                  <Upload size={18} />
                </label>
              </div>

              {/* Centered Title */}
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center pointer-events-auto">
                <h1 className="text-sm font-mono font-black text-neutral-900 uppercase tracking-[0.2em] leading-none whitespace-nowrap">
                  Gradient Library
                </h1>
              </div>

              <button 
                onClick={() => setShowLibrary(false)}
                className="p-2.5 bg-black/60 rounded-full text-white hover:scale-110 transition-transform pointer-events-auto shadow-xl"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="h-full overflow-y-auto p-8 pt-24 pb-12">
              {savedGradients.length > 0 ? (
                <>
                  <div className="columns-2 sm:columns-3 md:columns-4 gap-8">
                    {savedGradients.map((saved) => (
                      <div 
                        key={saved.id}
                        className="break-inside-avoid mb-8 group relative flex flex-col bg-white rounded-xl overflow-hidden border border-neutral-200 shadow-sm"
                      >
                        {/* Top Bar - Actions */}
                        <div className="flex items-center justify-between p-4 bg-white">
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              deleteSavedGradient(saved.id); 
                              setHasInteracted(true);
                            }}
                            className="p-2 bg-red-500 text-white rounded-full shadow-lg transition-transform active:scale-90"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setExportSettings(saved.settings);
                              setConfirmDpi(saved.settings.exportDpi || 300);
                              setExportType('png');
                              setShowExportConfirm(true);
                              setHasInteracted(true);
                            }}
                            className="p-2 bg-black/60 text-white rounded-full shadow-lg transition-transform active:scale-90"
                            title="Download"
                          >
                            <Download size={14} />
                          </button>
                        </div>

                        <div className="relative w-full flex items-center justify-center bg-white p-4 pt-0">
                          <button
                            onClick={() => {
                              loadSavedGradient(saved.settings);
                              setHasInteracted(true);
                            }}
                            className="relative shadow-2xl transition-all hover:scale-105 active:scale-95 overflow-hidden border border-white/20 flex items-center justify-center"
                            style={{ 
                              aspectRatio: `${saved.settings.ratio?.width || 1} / ${saved.settings.ratio?.height || 1}`,
                              maxWidth: '100%',
                              maxHeight: '240px',
                              width: '100%',
                            }}
                          >
                            <MiniGradient 
                              settings={saved.settings} 
                              className="w-full h-full"
                              width={200}
                              height={200}
                            />
                          </button>
                        </div>
                        
                        <div className="p-4 space-y-1">
                          <input
                            type="text"
                            value={saved.name}
                            onChange={(e) => {
                              renameSavedGradient(saved.id, e.target.value);
                              setHasInteracted(true);
                            }}
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

                  {/* Embedded Bulk Actions */}
                  <div className="mt-12 mb-8 flex flex-col items-center justify-center space-y-4 border-t border-neutral-100 pt-12">
                    <p className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-[0.2em]">Library Management</p>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => bulkImportInputRef.current?.click()}
                        className="flex items-center gap-3 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-full transition-all active:scale-95 group"
                      >
                        <FileUp size={18} className="group-hover:-translate-y-0.5 transition-transform" />
                        <span className="text-[10px] font-mono font-black uppercase tracking-widest">Import Library</span>
                      </button>
                      <button 
                        onClick={exportLibrary}
                        className="flex items-center gap-3 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-full transition-all active:scale-95 group"
                      >
                        <FileDown size={18} className="group-hover:translate-y-0.5 transition-transform" />
                        <span className="text-[10px] font-mono font-black uppercase tracking-widest">Export Library</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
              <div className="py-20 flex flex-col items-center justify-center text-neutral-300 border-2 border-dashed border-neutral-200 rounded-[40px] space-y-6">
                <div className="flex flex-col items-center">
                  <History size={48} className="mb-4 opacity-20" />
                  <p className="text-xs font-mono uppercase tracking-widest">Library is empty</p>
                </div>
                
                <button 
                  onClick={() => bulkImportInputRef.current?.click()}
                  className="flex items-center gap-3 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-full transition-all active:scale-95 group"
                >
                  <FileUp size={18} className="group-hover:-translate-y-0.5 transition-transform" />
                  <span className="text-[10px] font-mono font-black uppercase tracking-widest">Import Library</span>
                </button>
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
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest">
              Saved to Library
            </span>
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
                onClick={() => {
                  setUploadedImageUrl(null);
                  setHasInteracted(true);
                }} 
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
              layout
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
                  onClick={() => {
                    setShowExportConfirm(false);
                    setExportSettings(null);
                    setHasInteracted(true);
                  }}
                  className="p-2 bg-black/60 rounded-full text-white hover:scale-110 transition-transform"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-5">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2 bg-neutral-100 px-3 py-1 rounded-2xl border border-neutral-200">
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Ratio</span>
                    <span className="text-[10px] font-black text-neutral-900">{activeSettings.ratio.width}:{activeSettings.ratio.height}</span>
                  </div>
                  <button 
                    onClick={() => {
                      copyBulkHex();
                      setHasInteracted(true);
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1 rounded-2xl border transition-all",
                      showCopyToast 
                        ? "bg-emerald-500 border-emerald-600 text-white" 
                        : "bg-neutral-100 border-neutral-200 hover:bg-neutral-200 text-neutral-900"
                    )}
                  >
                    {showCopyToast ? (
                      <BookmarkCheck size={10} className="text-white" />
                    ) : (
                      <Copy size={10} className="text-neutral-400" />
                    )}
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      {showCopyToast ? 'Copied!' : 'Copy Hex'}
                    </span>
                  </button>
                </div>

                <div className="relative aspect-square glass rounded-2xl border border-white/20 overflow-hidden flex items-center justify-center p-4 sm:p-6">
                  <GradientPreview 
                    ref={exportPreviewRef}
                    settings={exportSettings || settings} 
                    hideNodes
                    hideTooltip
                    className="w-full h-full"
                  />
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'png', icon: ImageIcon, label: 'PNG' },
                      { id: 'svg', icon: FileCode, label: 'SVG' },
                      { id: 'json', icon: FileJson, label: 'GDNT' },
                    ].map((type) => (
                      <button
                        key={type.id}
                        onClick={() => {
                          setExportType(type.id as any);
                          setHasInteracted(true);
                        }}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1.5 h-[68px] rounded-2xl border transition-all",
                          exportType === type.id 
                            ? "bg-black text-white border-black shadow-lg scale-105" 
                            : "bg-white text-neutral-400 border-neutral-200 hover:border-neutral-300"
                        )}
                      >
                        <type.icon size={16} />
                        <span className="text-[8px] font-black uppercase tracking-widest">{type.label}</span>
                      </button>
                    ))}
                  </div>

                  <motion.div
                    initial={false}
                    animate={{ 
                      height: exportType === 'png' ? 0 : 'auto',
                      opacity: exportType === 'png' ? 0 : 1,
                      marginBottom: exportType === 'png' ? 0 : 16
                    }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="overflow-hidden"
                  >
                    <div className="py-2 flex items-center justify-center min-h-[48px]">
                      <AnimatePresence mode="wait">
                        {exportType === 'svg' && (
                          <motion.p
                            key="svg"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-[10px] text-black font-black px-2 leading-relaxed uppercase tracking-tight text-center"
                          >
                            {(activeSettings.type === 'mesh' || activeSettings.type === 'conic') 
                              ? "Gradient turned to vector shapes to preserve design. Gradient uneditable in other programs."
                              : "Gradient editable it other programs, like Illustrator."}
                          </motion.p>
                        )}
                        {exportType === 'json' && (
                          <motion.p
                            key="json"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-[10px] text-black font-black px-2 leading-relaxed uppercase tracking-tight text-center"
                          >
                            Gradients!!! App-specific format so you can re-uploaded into this app later to rework.
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>

                  <div className="px-4 glass rounded-2xl border border-white/20 h-[68px] flex flex-col justify-center">
                    <span className="text-[10px] font-black text-neutral-400 uppercase block mb-0.5">Export DPI</span>
                    <input
                      type="number" 
                      value={confirmDpi}
                      onChange={(e) => {
                        setConfirmDpi(parseInt(e.target.value) || 72);
                        setHasInteracted(true);
                      }}
                      className="w-full bg-transparent text-xl font-black outline-none text-neutral-900"
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    executeExport(confirmDpi);
                    setHasInteracted(true);
                  }}
                  className="w-full py-4 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                  style={{
                    backgroundImage: `url(${currentGradientDataUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                  }}
                >
                  <Download size={20} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />
                  {exportType === 'json' ? 'SAVE AS GDNT' : `Save as ${exportType.toUpperCase()}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Bulk Progress Popup */}
      <AnimatePresence>
        {(isBulkExporting || isBulkImporting) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-10 w-full max-w-[400px] shadow-2xl border border-white/40 text-center space-y-8"
            >
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center">
                  {isBulkExporting ? <FileDown size={32} className="text-black" /> : <FileUp size={32} className="text-black" />}
                </div>
              </div>
              
              <div className="space-y-2">
                <h2 className="text-xl font-mono font-black text-black uppercase tracking-widest">
                  {isBulkExporting ? 'Exporting Library' : 'Importing Library'}
                </h2>
                <p className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest">
                  {isBulkExporting ? 'Preparing your collection...' : 'Populating your library...'}
                </p>
              </div>

              <div className="relative h-2 bg-neutral-100 rounded-full overflow-hidden">
                <motion.div 
                  className="absolute inset-y-0 left-0 bg-black"
                  initial={{ width: 0 }}
                  animate={{ width: `${bulkProgress}%` }}
                  transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                />
              </div>

              <div className="text-[10px] font-mono font-black text-black uppercase tracking-[0.2em]">
                {Math.round(bulkProgress)}%
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
