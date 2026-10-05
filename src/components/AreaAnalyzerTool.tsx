import { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud,
  Trash2,
  RotateCcw,
  Undo2,
  FileText,
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
        img.onerror = reject;
        img.src = dataUrl;
      });

      return {
        id: `card-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
    for (const file of files) {
      const card = await processFile(file);
      if (card) newCards.push(card);
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

  const handleRemoveCard = (id: string) => {
    setCards((prev) => {
      const card = prev.find((c) => c.id === id);
      if (card?.dataUrl.startsWith('blob:')) {
        URL.revokeObjectURL(card.dataUrl);
      }
      return prev.filter((c) => c.id !== id);
    });
  };

  const handleClearAll = () => {
    cards.forEach((card) => {
      if (card.dataUrl.startsWith('blob:')) {
        URL.revokeObjectURL(card.dataUrl);
      }
    });
    setCards([]);
  };

  const handleResetCard = (id: string) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, rectangles: [] } : c)),
    );
  };

  const handleUndoCard = (id: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, rectangles: c.rectangles.slice(0, -1) }
          : c,
      ),
    );
  };

  const handleAddRect = (id: string, rect: Rect) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, rectangles: [...c.rectangles, rect] }
          : c,
      ),
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
  };

  return (
    <div className="space-y-6 text-(--text)">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-(--line)">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold font-sans text-(--text) tracking-tight">
            Проверка площади текста на изображении
          </h2>
          <p className="text-xs text-(--muted) mt-1 max-w-2xl leading-relaxed font-sans">
            Загрузите баннер, макет или документ. Выделяйте текстовые блоки и элементы курсором мыши для точного расчета суммарной площади и процента покрытия.
          </p>
        </div>

        {cards.length > 0 && (
          <button
            onClick={handleClearAll}
            className="self-start sm:self-center px-3 py-1.5 border border-(--line) bg-(--elevated) text-(--danger) hover:border-(--danger) transition-colors text-xs font-mono rounded-lg flex items-center gap-1.5 cursor-pointer"
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
        className={`border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 relative overflow-hidden group rounded-2xl ${
          isDragOver
            ? 'border-(--accent) bg-(--accent-soft)/25 scale-[1.005]'
            : 'border-(--line-strong) bg-(--panel) hover:border-(--accent)/60 hover:bg-(--elevated)'
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
          <div className="w-12 h-12 rounded-full bg-(--elevated) border border-(--line) flex items-center justify-center text-(--accent) group-hover:scale-110 group-hover:border-(--accent) transition-all">
            <UploadCloud size={24} />
          </div>
          <div className="text-sm font-bold text-(--text) mt-1">
            {loading ? 'Обработка файлов...' : 'Перетащите файлы сюда или нажмите для выбора'}
          </div>
          <div className="text-[11px] font-mono text-(--muted)">
            Поддерживаются: PNG, JPG, WebP, SVG и векторные PDF
          </div>
          <div className="text-[10px] text-(--accent) font-mono mt-1">
            ✓ Пакетная загрузка нескольких файлов сразу
          </div>
        </div>
      </div>

      {/* Cards List */}
      {cards.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-(--line) bg-(--panel) text-(--muted) rounded-2xl">
          <Crosshair size={32} className="mx-auto mb-3 opacity-30 text-(--accent)" />
          <div className="text-xs font-mono uppercase tracking-wider mb-1 text-(--text) font-bold">
            Список файлов пуст
          </div>
          <div className="text-[11px] text-(--muted)">
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
        bg: 'bg-(--elevated)',
        border: 'border-(--line)',
        textColor: 'text-(--muted)',
      };
    }
    if (pct <= 20) {
      return {
        text: `${pct.toFixed(2)}%`,
        label: 'В норме (до 20%)',
        bg: 'bg-(--success)/10',
        border: 'border-(--success)/40',
        textColor: 'text-(--success)',
      };
    }
    if (pct <= 30) {
      return {
        text: `${pct.toFixed(2)}%`,
        label: 'Погранично (20-30%)',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/40',
        textColor: 'text-amber-500',
      };
    }
    return {
      text: `${pct.toFixed(2)}%`,
      label: 'Высокая плотность (>30%)',
      bg: 'bg-(--danger)/10',
      border: 'border-(--danger)/40',
      textColor: 'text-(--danger)',
    };
  };

  const badge = getBadgeStyle(percent);

  // Translate client mouse coordinates to original natural image coordinates
  const getNaturalCoords = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return null;

      const rect = container.getBoundingClientRect();
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

      const clickX = clientX - rect.left - offsetX;
      const clickY = clientY - rect.top - offsetY;

      if (clickX < 0 || clickX > renderedW || clickY < 0 || clickY > renderedH) {
        return null;
      }

      const naturalX = Math.round((clickX / renderedW) * card.naturalWidth);
      const naturalY = Math.round((clickY / renderedH) * card.naturalHeight);

      return {
        x: Math.max(0, Math.min(naturalX, card.naturalWidth)),
        y: Math.max(0, Math.min(naturalY, card.naturalHeight)),
      };
    },
    [card.naturalWidth, card.naturalHeight]
  );

  // Render on overlay canvas
  const renderCanvas = useCallback(
    (temp: Rect | null = null) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

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

        ctx.fillStyle = 'rgba(97, 95, 255, 0.25)';
        ctx.fillRect(rx, ry, rw, rh);

        ctx.setLineDash([]);
        ctx.strokeStyle = '#615fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx, ry, rw, rh);

        ctx.fillStyle = '#615fff';
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

        ctx.fillStyle = 'rgba(46, 205, 131, 0.2)';
        ctx.fillRect(rx, ry, rw, rh);

        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#2ecd83';
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
    <div className="border border-(--line) bg-(--panel) p-4 flex flex-col gap-4 shadow-sm relative group rounded-2xl">
      {/* Top Card Title & Tools */}
      <div className="flex items-center justify-between gap-3 border-b border-(--line) pb-3">
        <div className="min-w-0 flex items-center gap-2">
          <FileText size={15} className="text-(--accent) shrink-0" />
          <div className="min-w-0">
            <h3
              className="text-xs font-bold font-mono text-(--text) truncate max-w-[260px] sm:max-w-[340px]"
              title={card.name}
            >
              {card.name}
            </h3>
            <span className="text-[10px] font-mono text-(--muted)">
              {formatFileSize(card.size)} · {card.naturalWidth}×{card.naturalHeight} px
            </span>
          </div>
        </div>

        <button
          onClick={onRemove}
          title="Удалить карточку"
          className="p-1.5 text-(--muted) hover:text-(--danger) hover:bg-(--elevated) border border-transparent hover:border-(--line) rounded-lg transition-colors cursor-pointer"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Interactive Canvas Container */}
      <div
        ref={containerRef}
        className="relative w-full h-[300px] sm:h-[340px] bg-(--elevated) border border-(--line) overflow-hidden flex items-center justify-center cursor-crosshair select-none rounded-xl"
        style={{
          backgroundImage: `
            linear-gradient(45deg, var(--line) 25%, transparent 25%),
            linear-gradient(-45deg, var(--line) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, var(--line) 75%),
            linear-gradient(-45deg, transparent 75%, var(--line) 75%)
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
          <span className="px-2.5 py-1 bg-(--panel)/90 border border-(--line) text-[10px] font-mono text-(--muted) backdrop-blur-xs flex items-center gap-1.5 rounded-md shadow-sm">
            <Crosshair size={11} className="text-(--accent)" /> Зажмите ЛКМ и выделите область
          </span>
        </div>
      </div>

      {/* Stats Breakdown Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
        <div className="bg-(--elevated) border border-(--line) p-2.5 rounded-lg">
          <span className="text-[10px] text-(--muted) block">ОБЩАЯ ПЛОЩАДЬ</span>
          <span className="text-(--text) font-bold text-xs truncate block" title={`${totalArea} px²`}>
            {totalArea.toLocaleString('ru-RU')} px²
          </span>
        </div>

        <div className="bg-(--elevated) border border-(--line) p-2.5 rounded-lg">
          <span className="text-[10px] text-(--muted) block">ВЫДЕЛЕНО</span>
          <span className="text-(--accent) font-bold text-xs truncate block" title={`${selectedArea.toFixed(1)} px²`}>
            {selectedArea.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} px²
          </span>
        </div>

        <div className="bg-(--elevated) border border-(--line) p-2.5 col-span-2 sm:col-span-1 rounded-lg">
          <span className="text-[10px] text-(--muted) block">ОБЛАСТЕЙ</span>
          <span className="text-(--text) font-bold text-xs">
            {card.rectangles.length} шт
          </span>
        </div>
      </div>

      {/* Coverage Status Bar */}
      <div className={`border p-3.5 flex items-center justify-between gap-3 rounded-xl ${badge.bg} ${badge.border}`}>
        <div>
          <span className="text-[10px] font-mono text-(--muted) uppercase tracking-wider block">
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
        <div className="h-2 w-full bg-(--elevated) overflow-hidden rounded-full border border-(--line)">
          <div
            className="h-full transition-all duration-300 rounded-full"
            style={{
              width: `${Math.min(percent, 100)}%`,
              background:
                percent <= 20
                  ? 'var(--success)'
                  : percent <= 30
                  ? 'rgb(245, 158, 11)'
                  : 'var(--danger)',
            }}
          />
        </div>
      </div>

      {/* Action Buttons Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-(--line) font-mono text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={onUndo}
            disabled={card.rectangles.length === 0}
            className="px-2.5 py-1 bg-(--elevated) border border-(--line) text-(--muted) hover:text-(--text) hover:border-(--accent) disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1 rounded-md text-[11px]"
            title="Отменить последнее выделение"
          >
            <Undo2 size={11} /> Отменить
          </button>

          <button
            onClick={onReset}
            disabled={card.rectangles.length === 0}
            className="px-2.5 py-1 bg-(--elevated) border border-(--line) text-(--muted) hover:text-(--danger) hover:border-(--danger) disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1 rounded-md text-[11px]"
            title="Сбросить все выделенные области"
          >
            <RotateCcw size={11} /> Сбросить
          </button>
        </div>

        <span className="text-[10px] text-(--muted) font-mono">
          {card.rectangles.length > 0
            ? `Выделено: ${card.rectangles.length}`
            : 'Области не заданы'}
        </span>
      </div>
    </div>
  );
}

export default AreaAnalyzerTool;
