import { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud,
  Trash2,
  RotateCcw,
  Undo2,
  FileText,
  Sparkles,
  Layers,
  Crosshair,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCardItem {
  id: string;
  name: string;
  size: number;
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  rectangles: Rect[];
}

export function AreaAnalyzerTool() {
  const [cards, setCards] = useState<ImageCardItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to load PDF.js dynamically
  const loadPdfJs = async () => {
    if ((window as unknown as { pdfjsLib?: { getDocument: unknown; GlobalWorkerOptions: { workerSrc: string } } }).pdfjsLib) {
      return (window as unknown as { pdfjsLib: { getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<any> }; GlobalWorkerOptions: { workerSrc: string } } }).pdfjsLib;
    }
    return new Promise<any>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        const lib = (window as unknown as { pdfjsLib?: { getDocument: unknown; GlobalWorkerOptions: { workerSrc: string } } }).pdfjsLib;
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(lib);
        } else {
          reject(new Error('PDF.js не найден'));
        }
      };
      script.onerror = () => reject(new Error('Не удалось загрузить PDF.js'));
      document.head.appendChild(script);
    });
  };

  const processFile = async (file: File): Promise<ImageCardItem | null> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    try {
      let dataUrl = '';
      let naturalWidth = 0;
      let naturalHeight = 0;

      if (ext === 'svg') {
        const text = await file.text();
        const blob = new Blob([text], { type: 'image/svg+xml' });
        dataUrl = URL.createObjectURL(blob);
      } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        dataUrl = URL.createObjectURL(file);
      } else if (ext === 'pdf') {
        const pdfjs = await loadPdfJs();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Не удалось создать canvas');

        await page.render({ canvasContext: ctx, viewport }).promise;
        dataUrl = canvas.toDataURL('image/png');
      } else {
        return null;
      }

      // Load image to get dimensions
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          naturalWidth = img.naturalWidth;
          naturalHeight = img.naturalHeight;
          resolve();
        };
        img.onerror = () => reject(new Error('Ошибка чтения изображения'));
        img.src = dataUrl;
      });

      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: file.name,
        size: file.size,
        dataUrl,
        naturalWidth,
        naturalHeight,
        rectangles: [],
      };
    } catch (err) {
      console.error('Ошибка обработки файла:', file.name, err);
      return null;
    }
  };

  const handleFiles = async (files: File[]) => {
    if (!files.length) return;
    setLoading(true);

    const newCards: ImageCardItem[] = [];
    for (const f of files) {
      const item = await processFile(f);
      if (item) newCards.push(item);
    }

    setCards((prev) => [...prev, ...newCards]);
    setLoading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleClearAll = () => {
    // Revoke object URLs to avoid memory leaks
    cards.forEach((c) => {
      if (c.dataUrl.startsWith('blob:')) URL.revokeObjectURL(c.dataUrl);
    });
    setCards([]);
  };

  const handleRemoveCard = (id: string) => {
    setCards((prev) => {
      const card = prev.find((c) => c.id === id);
      if (card && card.dataUrl.startsWith('blob:')) URL.revokeObjectURL(card.dataUrl);
      return prev.filter((c) => c.id !== id);
    });
  };

  const handleResetCard = (id: string) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, rectangles: [] } : c))
    );
  };

  const handleUndoCard = (id: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, rectangles: c.rectangles.slice(0, -1) } : c
      )
    );
  };

  const handleAddRect = (id: string, rect: Rect) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, rectangles: [...c.rectangles, rect] } : c
      )
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#24242e]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold font-sans text-white tracking-tight">
            Проверка площади текста на изображении
          </h2>
          <p className="text-xs text-[#8c8c9a] mt-1 max-w-2xl leading-relaxed">
            Загрузите баннер, макет или документ. Выделяйте текстовые блоки и элементы курсором мыши для точного расчета суммарной площади и процента покрытия.
          </p>
        </div>

        {cards.length > 0 && (
          <button
            onClick={handleClearAll}
            className="self-start sm:self-center px-3 py-1.5 border border-[#362536] bg-[#1a0f1e] text-[#ff6685] hover:bg-[#2c1328] hover:border-[#ff4070] transition-colors text-xs font-mono flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 size={13} />
            Очистить всё ({cards.length})
          </button>
        )}
      </div>

      {/* Upload Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 relative overflow-hidden group ${
          isDragOver
            ? 'border-[#8B03FD] bg-[#8B03FD]/10 scale-[1.005]'
            : 'border-[#282836] bg-[#08080d] hover:border-[#8B03FD]/60 hover:bg-[#0c0c14]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,.png,.jpg,.jpeg,.webp,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              handleFiles(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />

        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-12 h-12 rounded-full bg-[#12121c] border border-[#2c2c3c] flex items-center justify-center text-[#bd5aff] group-hover:scale-110 group-hover:border-[#8B03FD] transition-all">
            <UploadCloud size={24} />
          </div>
          <div className="text-sm font-bold text-white mt-1">
            {loading ? 'Обработка файлов...' : 'Перетащите файлы сюда или нажмите для выбора'}
          </div>
          <div className="text-[11px] font-mono text-[#727280]">
            Поддерживаются: PNG, JPG, WebP, SVG и векторные PDF
          </div>
          <div className="text-[10px] text-[#bd5aff] font-mono mt-1">
            ✓ Пакетная загрузка нескольких файлов сразу
          </div>
        </div>
      </div>

      {/* Cards List */}
      {cards.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-[#20202a] bg-[#07070a] text-[#6c6c78]">
          <Crosshair size={32} className="mx-auto mb-3 opacity-30 text-[#8B03FD]" />
          <div className="text-xs font-mono uppercase tracking-wider mb-1">
            Список файлов пуст
          </div>
          <div className="text-[11px] text-[#555]">
            Загрузите изображение или PDF выше, чтобы начать интерактивное выделение площадей
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {cards.map((card) => (
            <AreaCard
              key={card.id}
              card={card}
              onRemove={() => handleRemoveCard(card.id)}
              onReset={() => handleResetCard(card.id)}
              onUndo={() => handleUndoCard(card.id)}
              onAddRect={(rect) => handleAddRect(card.id, rect)}
              formatFileSize={formatFileSize}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Single Interactive Card Component
interface AreaCardProps {
  card: ImageCardItem;
  onRemove: () => void;
  onReset: () => void;
  onUndo: () => void;
  onAddRect: (rect: Rect) => void;
  formatFileSize: (bytes: number) => string;
}

function AreaCard({
  card,
  onRemove,
  onReset,
  onUndo,
  onAddRect,
  formatFileSize,
}: AreaCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);

  const totalArea = card.naturalWidth * card.naturalHeight;
  const selectedArea = card.rectangles.reduce((sum, r) => sum + r.width * r.height, 0);
  const percent = totalArea > 0 ? (selectedArea / totalArea) * 100 : 0;

  // Badge threshold logic: < 20% (OK for Ads), 20-30% (Warning), > 30% (Heavy)
  const getBadgeStyle = (pct: number) => {
    if (pct === 0) {
      return {
        text: '0%',
        label: 'Нет областей',
        bg: 'bg-[#121218]',
        border: 'border-[#262632]',
        textColor: 'text-[#888894]',
      };
    }
    if (pct <= 20) {
      return {
        text: `${pct.toFixed(2)}%`,
        label: 'В норме (до 20%)',
        bg: 'bg-[#003820]/40',
        border: 'border-[#00ff9d]/50',
        textColor: 'text-[#00ff9d]',
      };
    }
    if (pct <= 30) {
      return {
        text: `${pct.toFixed(2)}%`,
        label: 'Погранично (20-30%)',
        bg: 'bg-[#3b2a05]/50',
        border: 'border-[#ffd000]/60',
        textColor: 'text-[#ffd000]',
      };
    }
    return {
      text: `${pct.toFixed(2)}%`,
      label: 'Высокая плотность (>30%)',
      bg: 'bg-[#330030]/50',
      border: 'border-[#ff4070]/60',
      textColor: 'text-[#ff6699]',
    };
  };

  const badge = getBadgeStyle(percent);

  // Translate client mouse coordinates to original natural image coordinates
  const getNaturalCoords = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return null;

      const rect = container.getBoundingClientRect();
      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

      const containerW = rect.width;
      const containerH = rect.height;

      const imgAspect = card.naturalWidth / card.naturalHeight;
      const containerAspect = containerW / containerH;

      let renderedW: number;
      let renderedH: number;
      let offsetX: number;
      let offsetY: number;

      if (imgAspect > containerAspect) {
        renderedW = containerW;
        renderedH = containerW / imgAspect;
        offsetX = 0;
        offsetY = (containerH - renderedH) / 2;
      } else {
        renderedH = containerH;
        renderedW = containerH * imgAspect;
        offsetX = (containerW - renderedW) / 2;
        offsetY = 0;
      }

      // Constrain coordinates to image bounds
      const clampedX = Math.max(offsetX, Math.min(mouseX, offsetX + renderedW));
      const clampedY = Math.max(offsetY, Math.min(mouseY, offsetY + renderedH));

      const imgX = ((clampedX - offsetX) / renderedW) * card.naturalWidth;
      const imgY = ((clampedY - offsetY) / renderedH) * card.naturalHeight;

      return { x: imgX, y: imgY };
    },
    [card.naturalWidth, card.naturalHeight]
  );

  // Redraw canvas with high DPR and cyber styling
  const renderCanvas = useCallback(
    (temp: Rect | null = null) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const containerW = rect.width;
      const containerH = rect.height;
      const imgAspect = card.naturalWidth / card.naturalHeight;
      const containerAspect = containerW / containerH;

      let renderedW: number;
      let renderedH: number;
      let offsetX: number;
      let offsetY: number;

      if (imgAspect > containerAspect) {
        renderedW = containerW;
        renderedH = containerW / imgAspect;
        offsetX = 0;
        offsetY = (containerH - renderedH) / 2;
      } else {
        renderedH = containerH;
        renderedW = containerH * imgAspect;
        offsetX = (containerW - renderedW) / 2;
        offsetY = 0;
      }

      const scaleX = renderedW / card.naturalWidth;
      const scaleY = renderedH / card.naturalHeight;

      // Draw saved rectangles
      card.rectangles.forEach((r, idx) => {
        const rx = r.x * scaleX + offsetX;
        const ry = r.y * scaleY + offsetY;
        const rw = r.width * scaleX;
        const rh = r.height * scaleY;

        // Semi-transparent cyberpunk purple fill
        ctx.fillStyle = 'rgba(139, 3, 253, 0.22)';
        ctx.fillRect(rx, ry, rw, rh);

        // Neon outline
        ctx.setLineDash([]);
        ctx.strokeStyle = '#8B03FD';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx, ry, rw, rh);

        // Cyber index tag
        ctx.fillStyle = '#8B03FD';
        ctx.fillRect(rx, ry, 18, 14);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`${idx + 1}`, rx + 4, ry + 10);
      });

      // Draw temporary currently dragged rect
      if (temp && temp.width > 0 && temp.height > 0) {
        const rx = temp.x * scaleX + offsetX;
        const ry = temp.y * scaleY + offsetY;
        const rw = temp.width * scaleX;
        const rh = temp.height * scaleY;

        // Cyan active highlight
        ctx.fillStyle = 'rgba(0, 229, 255, 0.18)';
        ctx.fillRect(rx, ry, rw, rh);

        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx, ry, rw, rh);
      }

      ctx.restore();
    },
    [card.rectangles, card.naturalWidth, card.naturalHeight]
  );

  useEffect(() => {
    renderCanvas(currentRect);
  }, [renderCanvas, currentRect]);

  // Window resize observer
  useEffect(() => {
    const handleResize = () => renderCanvas(currentRect);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCanvas, currentRect]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const coords = getNaturalCoords(e.clientX, e.clientY);
    if (!coords) return;

    setStartPoint(coords);
    setIsDrawing(true);
    setCurrentRect({
      x: coords.x,
      y: coords.y,
      width: 0,
      height: 0,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint) return;
    const coords = getNaturalCoords(e.clientX, e.clientY);
    if (!coords) return;

    const x = Math.min(startPoint.x, coords.x);
    const y = Math.min(startPoint.y, coords.y);
    const width = Math.abs(coords.x - startPoint.x);
    const height = Math.abs(coords.y - startPoint.y);

    setCurrentRect({ x, y, width, height });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint) return;
    setIsDrawing(false);

    const coords = getNaturalCoords(e.clientX, e.clientY);
    if (coords) {
      const width = Math.abs(coords.x - startPoint.x);
      const height = Math.abs(coords.y - startPoint.y);
      if (width > 2 && height > 2) {
        const x = Math.min(startPoint.x, coords.x);
        const y = Math.min(startPoint.y, coords.y);
        onAddRect({ x, y, width, height });
      }
    }

    setStartPoint(null);
    setCurrentRect(null);
  };

  return (
    <div className="border border-[#262634] bg-[#09090e] p-4 flex flex-col gap-4 shadow-sm relative group">
      {/* Top Card Title & Tools */}
      <div className="flex items-center justify-between gap-3 border-b border-[#1c1c26] pb-3">
        <div className="min-w-0 flex items-center gap-2">
          <FileText size={15} className="text-[#bd5aff] shrink-0" />
          <div className="min-w-0">
            <h3
              className="text-xs font-bold font-mono text-white truncate max-w-[260px] sm:max-w-[340px]"
              title={card.name}
            >
              {card.name}
            </h3>
            <span className="text-[10px] font-mono text-[#666674]">
              {formatFileSize(card.size)} · {card.naturalWidth}×{card.naturalHeight} px
            </span>
          </div>
        </div>

        <button
          onClick={onRemove}
          title="Удалить карточку"
          className="p-1 text-[#666672] hover:text-[#ff4466] hover:bg-[#1f1015] border border-transparent hover:border-[#ff4466]/40 transition-colors cursor-pointer"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Interactive Canvas Container with Cyber Grid Background */}
      <div
        ref={containerRef}
        className="relative w-full h-[300px] sm:h-[340px] bg-[#040407] border border-[#20202c] overflow-hidden flex items-center justify-center cursor-crosshair select-none"
        style={{
          backgroundImage: `
            linear-gradient(45deg, #0a0a10 25%, transparent 25%),
            linear-gradient(-45deg, #0a0a10 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #0a0a10 75%),
            linear-gradient(-45deg, transparent 75%, #0a0a10 75%)
          `,
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
        }}
      >
        <img
          src={card.dataUrl}
          alt={card.name}
          className="max-w-full max-h-full object-contain pointer-events-none z-1"
        />

        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="absolute inset-0 w-full h-full z-10"
        />

        {/* Small instruction helper badge in corner */}
        <div className="absolute bottom-2 left-2 z-20 pointer-events-none">
          <span className="px-2 py-0.5 bg-[#050508]/85 border border-[#222230] text-[9px] font-mono text-[#8c8c9a] backdrop-blur-xs flex items-center gap-1">
            <Crosshair size={10} className="text-[#8B03FD]" /> Зажмите ЛКМ и выделите область
          </span>
        </div>
      </div>

      {/* Stats Breakdown Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
        <div className="bg-[#050508] border border-[#1e1e28] p-2.5">
          <span className="text-[10px] text-[#6c6c78] block">ОБЩАЯ ПЛОЩАДЬ</span>
          <span className="text-white font-bold text-xs truncate block" title={`${totalArea} px²`}>
            {totalArea.toLocaleString('ru-RU')} px²
          </span>
        </div>

        <div className="bg-[#050508] border border-[#1e1e28] p-2.5">
          <span className="text-[10px] text-[#6c6c78] block">ВЫДЕЛЕНО</span>
          <span className="text-[#00e5ff] font-bold text-xs truncate block" title={`${selectedArea.toFixed(1)} px²`}>
            {selectedArea.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} px²
          </span>
        </div>

        <div className="bg-[#050508] border border-[#1e1e28] p-2.5 col-span-2 sm:col-span-1">
          <span className="text-[10px] text-[#6c6c78] block">ОБЛАСТЕЙ</span>
          <span className="text-white font-bold text-xs">
            {card.rectangles.length} шт
          </span>
        </div>
      </div>

      {/* Coverage Status Bar - Big, Clear & High Contrast */}
      <div className={`border p-3 sm:p-3.5 flex items-center justify-between gap-3 ${badge.bg} ${badge.border}`}>
        <div>
          <span className="text-[10px] font-mono text-[#888894] uppercase tracking-wider block">
            ПОКРЫТИЕ ТЕКСТОМ / ЭЛЕМЕНТАМИ
          </span>
          <div className={`text-sm sm:text-base font-bold font-sans mt-0.5 ${badge.textColor}`}>
            {badge.label}
          </div>
        </div>
        <div className="text-right">
          <span className={`text-xl sm:text-2xl font-extrabold font-mono leading-none ${badge.textColor}`}>
            {badge.text}
          </span>
        </div>
      </div>

      {/* Visual Progress Bar */}
      <div className="space-y-1">
        <div className="h-1.5 w-full bg-[#14141c] overflow-hidden rounded-full border border-[#222230]">
          <div
            className="h-full transition-all duration-300 rounded-full"
            style={{
              width: `${Math.min(percent, 100)}%`,
              background:
                percent <= 20
                  ? 'linear-gradient(90deg, #8B03FD, #00ff9d)'
                  : percent <= 30
                  ? 'linear-gradient(90deg, #8B03FD, #ffd000)'
                  : 'linear-gradient(90deg, #8B03FD, #ff3366)',
            }}
          />
        </div>
      </div>

      {/* Action Buttons Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#1a1a24] font-mono text-xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onUndo}
            disabled={card.rectangles.length === 0}
            className="px-2.5 py-1 bg-[#0c0c14] border border-[#242432] text-[#8e8e9c] hover:text-white hover:border-[#8B03FD] disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1 cursor-pointer text-[11px]"
            title="Отменить последнее выделение"
          >
            <Undo2 size={11} /> Отменить
          </button>

          <button
            onClick={onReset}
            disabled={card.rectangles.length === 0}
            className="px-2.5 py-1 bg-[#0c0c14] border border-[#242432] text-[#8e8e9c] hover:text-[#ff4070] hover:border-[#ff4070]/50 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1 cursor-pointer text-[11px]"
            title="Сбросить все выделенные области"
          >
            <RotateCcw size={11} /> Сбросить
          </button>
        </div>

        <span className="text-[10px] text-[#555] font-mono">
          {card.rectangles.length > 0
            ? `Выделено фрагментов: ${card.rectangles.length}`
            : 'Области не заданы'}
        </span>
      </div>
    </div>
  );
}
