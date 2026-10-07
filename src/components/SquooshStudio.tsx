import { useState, useRef, useCallback, useEffect } from 'react';
import {
  UploadCloud,
  FolderOpen,
  Archive,
  Trash2,
  FileImage,
  RefreshCw,
  Download,
  HardDrive,
  Info,
  FolderTree,
  Sparkles,
  Sliders,
  Check,
  AlertTriangle,
} from 'lucide-react';
import JSZip from 'jszip';
import { quantizePng } from '../utils/imagequantLoader';

export interface CompressorFileItem {
  id: string;
  file: File;
  name: string;
  relativePath: string;
  isFromFolder: boolean;
  originalSize: number;
  originalFormat: 'png' | 'jpeg' | 'webp' | 'svg' | 'other';
  originalUrl: string;
  width: number;
  height: number;
  compressedBlob: Blob | null;
  compressedUrl: string | null;
  compressedSize: number;
  engineUsed: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMsg?: string;
}

export type PngPreset = 'light' | 'balanced' | 'strong' | 'maximum';

function detectFormat(file: File): 'png' | 'jpeg' | 'webp' | 'svg' | 'other' {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (file.type === 'image/png' || ext === 'png') return 'png';
  if (file.type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (file.type === 'image/webp' || ext === 'webp') return 'webp';
  if (file.type === 'image/svg+xml' || ext === 'svg') return 'svg';
  return 'other';
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 Б';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

function loadImage(fileOrBlob: Blob | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось загрузить изображение'));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), mime, quality);
  });
}

export function SquooshStudio() {
  const [items, setItems] = useState<CompressorFileItem[]>([]);

  // 1. Настройка для JPEG / WebP: «Желаемый вес»
  const [targetValue, setTargetValue] = useState<number>(300);
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB');

  // 2. Настройка для PNG: «Степень сжатия» (WASM imagequant)
  const [pngQuality, setPngQuality] = useState<number>(75);
  const [pngPreset, setPngPreset] = useState<PngPreset>('balanced');

  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const targetBytes = targetUnit === 'MB' ? targetValue * 1024 * 1024 : targetValue * 1024;

  // Анализ загруженных форматов
  const hasPng = items.some((it) => it.originalFormat === 'png');
  const hasNonPng = items.some((it) => it.originalFormat !== 'png');
  const isOnlyPng = items.length > 0 && hasPng && !hasNonPng;
  const isOnlyNonPng = items.length > 0 && !hasPng && hasNonPng;

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      items.forEach((it) => {
        if (it.originalUrl) URL.revokeObjectURL(it.originalUrl);
        if (it.compressedUrl) URL.revokeObjectURL(it.compressedUrl);
      });
    };
  }, []);

  const handleApplyPngPreset = (preset: PngPreset) => {
    setPngPreset(preset);
    if (preset === 'light') setPngQuality(90);
    else if (preset === 'balanced') setPngQuality(75);
    else if (preset === 'strong') setPngQuality(55);
    else if (preset === 'maximum') setPngQuality(35);
  };

  /**
   * Сжатие PNG через WebAssembly imagequant с регулировкой степени сжатия.
   */
  const compressPng = async (
    file: File,
    img: HTMLImageElement,
    quality: number,
  ): Promise<{ blob: Blob; engine: string }> => {
    const origWidth = img.naturalWidth || img.width;
    const origHeight = img.naturalHeight || img.height;

    // Определение количества цветов в палитре на основе выбранного уровня
    let maxColors = 160;
    if (quality >= 85) maxColors = 256;
    else if (quality >= 70) maxColors = 192;
    else if (quality >= 50) maxColors = 128;
    else if (quality >= 35) maxColors = 64;
    else maxColors = 32;

    const canvas = document.createElement('canvas');
    canvas.width = origWidth;
    canvas.height = origHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Не удалось инициализировать 2D-контекст');

    ctx.drawImage(img, 0, 0, origWidth, origHeight);
    const imageData = ctx.getImageData(0, 0, origWidth, origHeight);

    try {
      const pngBytes = await quantizePng(
        imageData.data,
        origWidth,
        origHeight,
        0,
        quality,
        maxColors,
      );
      const currentBlob = new Blob([pngBytes.buffer as ArrayBuffer], { type: 'image/png' });

      if (currentBlob.size < file.size) {
        return {
          blob: currentBlob,
          engine: `WASM imagequant (${maxColors} цв., кач. ${quality}%)`,
        };
      }
    } catch (err) {
      console.warn('[imagequant-wasm] fallback to canvas:', err);
    }

    // Fallback: canvas PNG export
    const fallback = await canvasToBlob(canvas, 'image/png');
    if (fallback && fallback.size < file.size) {
      return { blob: fallback, engine: 'Canvas PNG' };
    }

    return { blob: file, engine: 'PNG (оригинал уже оптимален)' };
  };

  /**
   * Сжатие JPEG под желаемый целевой вес.
   */
  const compressJpeg = async (
    file: File,
    img: HTMLImageElement,
    targetLimit: number,
  ): Promise<{ blob: Blob; engine: string }> => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Не удалось инициализировать canvas');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let low = 0.05;
    let high = 0.95;
    let bestBlob: Blob | null = null;
    let bestQuality = 0.8;

    for (let step = 0; step < 7; step++) {
      const mid = (low + high) / 2;
      const b = await canvasToBlob(canvas, 'image/jpeg', mid);
      if (!b) break;

      if (b.size <= targetLimit) {
        bestBlob = b;
        bestQuality = mid;
        low = mid;
      } else {
        high = mid;
        if (!bestBlob || b.size < bestBlob.size) {
          bestBlob = b;
          bestQuality = mid;
        }
      }
    }

    if (bestBlob && bestBlob.size < file.size) {
      return {
        blob: bestBlob,
        engine: `MozJPEG/Canvas (качество ~${Math.round(bestQuality * 100)}%)`,
      };
    }

    return { blob: file, engine: 'JPEG (оригинал уже оптимален)' };
  };

  /**
   * Сжатие WebP под желаемый целевой вес.
   */
  const compressWebp = async (
    file: File,
    img: HTMLImageElement,
    targetLimit: number,
  ): Promise<{ blob: Blob; engine: string }> => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Не удалось инициализировать canvas');

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let low = 0.05;
    let high = 0.95;
    let bestBlob: Blob | null = null;
    let bestQuality = 0.8;

    for (let step = 0; step < 7; step++) {
      const mid = (low + high) / 2;
      const b = await canvasToBlob(canvas, 'image/webp', mid);
      if (!b) break;

      if (b.size <= targetLimit) {
        bestBlob = b;
        bestQuality = mid;
        low = mid;
      } else {
        high = mid;
        if (!bestBlob || b.size < bestBlob.size) {
          bestBlob = b;
          bestQuality = mid;
        }
      }
    }

    if (bestBlob && bestBlob.size < file.size) {
      return {
        blob: bestBlob,
        engine: `WebP Encoder (качество ~${Math.round(bestQuality * 100)}%)`,
      };
    }

    return { blob: file, engine: 'WebP (оригинал уже оптимален)' };
  };

  /**
   * Рекурсивное чтение папок при Drop
   */
  const readDirectoryEntries = async (
    entry: any,
    currentPath: string = '',
  ): Promise<{ file: File; relativePath: string }[]> => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((f: File) => {
          const relPath = currentPath ? `${currentPath}/${f.name}` : f.name;
          resolve([{ file: f, relativePath: relPath }]);
        });
      });
    }

    if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries: any[] = await new Promise((resolve) => {
        const result: any[] = [];
        const readEntries = () => {
          dirReader.readEntries((batch: any[]) => {
            if (batch.length === 0) {
              resolve(result);
            } else {
              result.push(...batch);
              readEntries();
            }
          });
        };
        readEntries();
      });

      const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      const nestedPromises = entries.map((child) => readDirectoryEntries(child, nextPath));
      const nestedArrays = await Promise.all(nestedPromises);
      return nestedArrays.flat();
    }

    return [];
  };

  const addFilesToQueue = async (
    rawFiles: { file: File; relativePath?: string; isFromFolder?: boolean }[],
  ) => {
    const validItems: CompressorFileItem[] = [];

    for (const item of rawFiles) {
      const { file } = item;
      const fmt = detectFormat(file);

      if (fmt === 'other' && !file.type.startsWith('image/')) {
        continue;
      }

      const id = `img-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const originalUrl = URL.createObjectURL(file);

      let width = 0;
      let height = 0;
      try {
        const img = await loadImage(file);
        width = img.naturalWidth || img.width;
        height = img.naturalHeight || img.height;
      } catch {
        // SVG or unrendered
      }

      const hasFolder = Boolean(item.isFromFolder || (item.relativePath && item.relativePath.includes('/')));
      const relPath = item.relativePath || file.webkitRelativePath || file.name;

      validItems.push({
        id,
        file,
        name: file.name,
        relativePath: relPath,
        isFromFolder: hasFolder,
        originalSize: file.size,
        originalFormat: fmt,
        originalUrl,
        width,
        height,
        compressedBlob: null,
        compressedUrl: null,
        compressedSize: file.size,
        engineUsed: 'Ожидание сжатия...',
        status: 'pending',
      });
    }

    if (validItems.length > 0) {
      setItems((prev) => [...prev, ...validItems]);
    }
  };

  const processAll = useCallback(async () => {
    if (items.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setProcessedCount(0);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      setItems((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, status: 'processing' } : item)),
      );

      try {
        let resultBlob: Blob = it.file;
        let engine = 'Оригинальный формат';

        if (it.originalFormat === 'svg') {
          resultBlob = it.file;
          engine = 'SVG без изменений';
        } else {
          const img = await loadImage(it.file);
          if (it.originalFormat === 'png') {
            const res = await compressPng(it.file, img, pngQuality);
            resultBlob = res.blob;
            engine = res.engine;
          } else if (it.originalFormat === 'jpeg') {
            const res = await compressJpeg(it.file, img, targetBytes);
            resultBlob = res.blob;
            engine = res.engine;
          } else if (it.originalFormat === 'webp') {
            const res = await compressWebp(it.file, img, targetBytes);
            resultBlob = res.blob;
            engine = res.engine;
          } else {
            resultBlob = it.file;
            engine = 'Формат сохранён';
          }
        }

        const compressedUrl = URL.createObjectURL(resultBlob);

        setItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  compressedBlob: resultBlob,
                  compressedUrl,
                  compressedSize: resultBlob.size,
                  engineUsed: engine,
                  status: 'done',
                }
              : item,
          ),
        );
      } catch (err: any) {
        setItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: 'error',
                  errorMsg: err?.message || 'Ошибка сжатия',
                }
              : item,
          ),
        );
      }

      setProcessedCount((c) => c + 1);
    }

    setIsProcessing(false);
  }, [items, isProcessing, targetBytes, pngQuality]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const dataTransferItems = e.dataTransfer.items;
    if (dataTransferItems && dataTransferItems.length > 0) {
      const filesWithPaths: { file: File; relativePath: string; isFromFolder: boolean }[] = [];

      for (let i = 0; i < dataTransferItems.length; i++) {
        const item = dataTransferItems[i];
        if (item.kind === 'file') {
          const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
          if (entry && entry.isDirectory) {
            const dirFiles = await readDirectoryEntries(entry, entry.name);
            filesWithPaths.push(...dirFiles.map((f) => ({ ...f, isFromFolder: true })));
          } else {
            const file = item.getAsFile();
            if (file) {
              filesWithPaths.push({
                file,
                relativePath: file.name,
                isFromFolder: false,
              });
            }
          }
        }
      }

      if (filesWithPaths.length > 0) {
        await addFilesToQueue(filesWithPaths);
      }
      return;
    }

    const droppedFiles = Array.from(e.dataTransfer.files);
    await addFilesToQueue(
      droppedFiles.map((f) => ({
        file: f,
        relativePath: f.webkitRelativePath || f.name,
        isFromFolder: Boolean(f.webkitRelativePath && f.webkitRelativePath.includes('/')),
      })),
    );
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileList = Array.from(e.target.files);
    await addFilesToQueue(
      fileList.map((f) => ({
        file: f,
        relativePath: f.name,
        isFromFolder: false,
      })),
    );
    e.target.value = '';
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileList = Array.from(e.target.files);
    await addFilesToQueue(
      fileList.map((f) => ({
        file: f,
        relativePath: f.webkitRelativePath || f.name,
        isFromFolder: true,
      })),
    );
    e.target.value = '';
  };

  const downloadSingle = (item: CompressorFileItem) => {
    const blob = item.compressedBlob || item.file;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllZip = async () => {
    if (items.length === 0 || isZipping) return;
    setIsZipping(true);

    try {
      const zip = new JSZip();

      for (const item of items) {
        const blob = item.compressedBlob || item.file;
        const archivePath = item.isFromFolder && item.relativePath ? item.relativePath : item.name;
        zip.file(archivePath, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compressed-images-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Ошибка создания ZIP архива:', err);
    } finally {
      setIsZipping(false);
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target?.originalUrl) URL.revokeObjectURL(target.originalUrl);
      if (target?.compressedUrl) URL.revokeObjectURL(target.compressedUrl);
      return prev.filter((it) => it.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((it) => {
      if (it.originalUrl) URL.revokeObjectURL(it.originalUrl);
      if (it.compressedUrl) URL.revokeObjectURL(it.compressedUrl);
    });
    setItems([]);
  };

  // Summary statistics
  const totalOriginal = items.reduce((acc, it) => acc + it.originalSize, 0);
  const totalCompressed = items.reduce(
    (acc, it) => acc + (it.status === 'done' ? it.compressedSize : it.originalSize),
    0,
  );
  const savedBytes = Math.max(0, totalOriginal - totalCompressed);
  const savingsPercent = totalOriginal > 0 ? Math.round((savedBytes / totalOriginal) * 100) : 0;
  const anyFolders = items.some((it) => it.isFromFolder);

  return (
    <div className="w-full space-y-6 text-(--text)">
      {/* 1. Header & Minimal Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-(--line)">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-(--accent-soft) text-(--accent)">
              <Sparkles size={18} />
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight font-sans text-(--text)">
              Сжатие с сохранением структуры папок
            </h2>
          </div>
          <p className="mt-1 text-xs font-mono text-(--muted)">
           Поддерживаемые форматы · PNG · JPEG · WebP
          </p>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={clearAll}
              disabled={isProcessing}
              className="px-3 py-1.5 border border-(--line) hover:border-(--danger) hover:text-(--danger) text-xs font-mono rounded-lg transition-colors flex items-center gap-1.5 text-(--muted)"
            >
              <Trash2 size={13} />
              Очистить
            </button>
            <button
              onClick={processAll}
              disabled={isProcessing}
              className="px-4 py-2 border border-(--accent) bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover) text-xs font-mono font-bold rounded-lg transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isProcessing ? 'animate-spin' : ''} />
              {isProcessing ? `Сжатие (${processedCount}/${items.length})...` : 'Сжать всё'}
            </button>
          </div>
        )}
      </div>

      {/* 2. Контекстные настройки:
          - «Степень сжатия PNG»: открывается ТОЛЬКО после того, как загружен хотя бы один PNG файл
          - «Желаемый вес»: скрывается, если загружены только PNG файлы */}
      <div className="space-y-4">
        {/* А. Настройка для PNG: открывается ТОЛЬКО если загружен PNG файл */}
        {hasPng && (
          <div className="p-5 border border-(--line) bg-(--elevated) rounded-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <label className="text-xs font-mono uppercase tracking-wider font-bold text-(--accent) flex items-center gap-1.5">
                  <Sliders size={14} /> Степень сжатия PNG
                </label>
                <p className="text-xs text-(--muted) mt-0.5 font-sans">
                  Квантование палитры цветов. Чем сильнее сжатие, тем меньше весит PNG без потери геометрии.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyPngPreset('light')}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                    pngPreset === 'light'
                      ? 'border-(--accent) bg-(--accent) text-(--on-accent) font-bold'
                      : 'border-(--line) bg-(--panel) text-(--muted) hover:text-(--text)'
                  }`}
                >
                  Слабое (256 цв.)
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPngPreset('balanced')}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                    pngPreset === 'balanced'
                      ? 'border-(--accent) bg-(--accent) text-(--on-accent) font-bold'
                      : 'border-(--line) bg-(--panel) text-(--muted) hover:text-(--text)'
                  }`}
                >
                  Баланс (192 цв.)
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPngPreset('strong')}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                    pngPreset === 'strong'
                      ? 'border-(--accent) bg-(--accent) text-(--on-accent) font-bold'
                      : 'border-(--line) bg-(--panel) text-(--muted) hover:text-(--text)'
                  }`}
                >
                  Сильное (128 цв.)
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPngPreset('maximum')}
                  className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-all ${
                    pngPreset === 'maximum'
                      ? 'border-(--accent) bg-(--accent) text-(--on-accent) font-bold'
                      : 'border-(--line) bg-(--panel) text-(--muted) hover:text-(--text)'
                  }`}
                >
                  Максимум (64 цв.)
                </button>
              </div>
            </div>

            {/* Slider fine-tuning */}
            <div className="flex items-center gap-4 pt-1">
              <span className="text-[11px] font-mono text-(--muted) shrink-0">
                Качество: <strong className="text-(--text)">{pngQuality}%</strong>
              </span>
              <input
                type="range"
                min="20"
                max="95"
                step="5"
                value={pngQuality}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setPngQuality(val);
                  if (val >= 85) setPngPreset('light');
                  else if (val >= 70) setPngPreset('balanced');
                  else if (val >= 50) setPngPreset('strong');
                  else setPngPreset('maximum');
                }}
                className="w-full accent-(--accent) cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Б. Настройка для JPEG / WebP: «Желаемый вес»
            СКРЫВАЕТСЯ, если загружен только PNG формат! */}
        {!isOnlyPng && (
          <div className="p-5 border border-(--line) bg-(--elevated) rounded-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <label className="text-xs font-mono uppercase tracking-wider font-bold text-(--accent) flex items-center gap-1.5">
                  <HardDrive size={14} /> Желаемый вес файла {hasPng ? '(для JPEG и WebP)' : ''}
                </label>
                <p className="text-xs text-(--muted) mt-0.5 font-sans">
                  Движок оптимизации автоматически подберет параметры для приближения к целевому размеру.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Quick Presets */}
                <div className="flex items-center gap-1.5">
                  {[100, 250, 500, 1024].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        if (preset >= 1024) {
                          setTargetValue(preset / 1024);
                          setTargetUnit('MB');
                        } else {
                          setTargetValue(preset);
                          setTargetUnit('KB');
                        }
                      }}
                      className={`px-2.5 py-1 text-[11px] font-mono rounded-md border transition-all ${
                        (targetUnit === 'KB' && targetValue === preset) ||
                        (targetUnit === 'MB' && targetValue * 1024 === preset)
                          ? 'border-(--accent) bg-(--accent) text-(--on-accent) font-bold'
                          : 'border-(--line) bg-(--panel) text-(--muted) hover:text-(--text) hover:border-(--line-strong)'
                      }`}
                    >
                      {preset >= 1024 ? `${preset / 1024} МБ` : `${preset} КБ`}
                    </button>
                  ))}
                </div>

                {/* Input field + unit */}
                <div className="flex items-center border border-(--line-strong) bg-(--panel) rounded-lg overflow-hidden focus-within:border-(--accent) transition-all">
                  <input
                    type="number"
                    min="10"
                    max="50000"
                    value={targetValue}
                    onChange={(e) => setTargetValue(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 px-3 py-1.5 text-sm font-mono text-(--text) bg-transparent outline-none"
                  />
                  <div className="flex border-l border-(--line)">
                    <button
                      type="button"
                      onClick={() => setTargetUnit('KB')}
                      className={`px-2.5 py-1.5 text-xs font-mono transition-colors ${
                        targetUnit === 'KB'
                          ? 'bg-(--accent-soft) text-(--accent) font-bold'
                          : 'text-(--muted) hover:text-(--text)'
                      }`}
                    >
                      КБ
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetUnit('MB')}
                      className={`px-2.5 py-1.5 text-xs font-mono transition-colors ${
                        targetUnit === 'MB'
                          ? 'bg-(--accent-soft) text-(--accent) font-bold'
                          : 'text-(--muted) hover:text-(--text)'
                      }`}
                    >
                      МБ
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Информативное предупреждение о пределах сжатия */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg border border-(--line) bg-(--panel) text-xs text-(--muted)">
              <Info size={16} className="text-(--accent) shrink-0 mt-0.5" />
              <p className="leading-relaxed m-0">
                <strong>Предупреждение:</strong> для сильно сжатых файлов итоговый вес может оказаться
                выше желаемого из-за физических ограничений сжатия без принудительного уменьшения разрешения.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Дропзона: автоматическое распознавание папок и файлов */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative p-8 border-2 border-dashed rounded-2xl text-center transition-all flex flex-col items-center justify-center min-h-[220px] ${
          isDragOver
            ? 'border-(--accent) bg-(--accent-soft)/30 scale-[1.005]'
            : 'border-(--line-strong) bg-(--panel) hover:border-(--accent)/60'
        }`}
      >
        <div className="w-14 h-14 rounded-full border border-(--line) bg-(--elevated) flex items-center justify-center text-(--accent) mb-4 shadow-sm">
          <UploadCloud size={26} />
        </div>

        <h3 className="text-base sm:text-lg font-bold font-sans text-(--text) mb-1">
          Перетащите изображения или целую папку сюда
        </h3>
        <p className="text-xs text-(--muted) font-mono max-w-md mb-5 leading-relaxed">
          Плагин автоматически определит папку, сохранит вложенную структуру и сожмет все файлы в исходных форматах (PNG, JPEG, WebP).
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 border border-(--line-strong) bg-(--elevated) hover:border-(--accent) hover:text-(--text) text-xs font-mono rounded-lg transition-all flex items-center gap-2 text-(--text)"
          >
            <FileImage size={14} className="text-(--accent)" />
            Выбрать файлы
          </button>

          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="px-4 py-2 border border-(--line-strong) bg-(--elevated) hover:border-(--accent) hover:text-(--text) text-xs font-mono rounded-lg transition-all flex items-center gap-2 text-(--text)"
          >
            <FolderOpen size={14} className="text-(--accent)" />
            Выбрать папку целиком
          </button>
        </div>

        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.png,.jpg,.jpeg,.webp,.svg,.gif"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard for folder picker
          webkitdirectory="true"
          directory="true"
          multiple
          onChange={handleFolderInputChange}
          className="hidden"
        />
      </div>

      {/* 4. Результаты и список файлов */}
      {items.length > 0 && (
        <div className="space-y-4 pt-2">
          {/* Top Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-(--line) bg-(--elevated) rounded-xl text-xs font-mono">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div>
                <span className="text-(--muted) block">Файлов:</span>
                <span className="font-bold text-(--text) text-sm">{items.length}</span>
              </div>
              <div>
                <span className="text-(--muted) block">Исходный вес:</span>
                <span className="font-bold text-(--text) text-sm">{formatBytes(totalOriginal)}</span>
              </div>
              <div>
                <span className="text-(--muted) block">Сжатый вес:</span>
                <span className="font-bold text-(--success) text-sm">{formatBytes(totalCompressed)}</span>
              </div>
              {savedBytes > 0 && (
                <div>
                  <span className="text-(--muted) block">Экономия:</span>
                  <span className="font-bold text-(--accent) text-sm">
                    -{formatBytes(savedBytes)} ({savingsPercent}%)
                  </span>
                </div>
              )}
              {anyFolders && (
                <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-(--accent-soft) text-(--accent) text-[11px]">
                  <FolderTree size={12} />
                  Структура папок сохранена
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={clearAll}
                disabled={isProcessing}
                className="px-3 py-2 border border-(--line) hover:border-(--danger) hover:text-(--danger) text-xs font-mono rounded-lg transition-colors flex items-center gap-1.5 text-(--muted)"
              >
                <Trash2 size={13} />
                Очистить
              </button>
              <button
                onClick={processAll}
                disabled={isProcessing}
                className="px-3.5 py-2 border border-(--accent) bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover) font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <RefreshCw size={13} className={isProcessing ? 'animate-spin' : ''} />
                {isProcessing ? 'Сжатие...' : 'Сжать всё'}
              </button>
              <button
                onClick={downloadAllZip}
                disabled={isZipping}
                className="px-4 py-2 border border-(--success) bg-(--success) hover:opacity-90 text-white font-bold rounded-lg transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Archive size={14} className={isZipping ? 'animate-spin' : ''} />
                {isZipping ? 'Упаковка ZIP...' : anyFolders ? 'Скачать папку в ZIP' : 'Скачать всё в ZIP'}
              </button>
            </div>
          </div>

          {/* Cards List */}
          <div className="divide-y divide-(--line) border border-(--line) bg-(--panel) rounded-xl overflow-hidden">
            {items.map((item) => {
              const diff = item.originalSize - item.compressedSize;
              const percent =
                item.originalSize > 0 && item.status === 'done'
                  ? Math.round((diff / item.originalSize) * 100)
                  : 0;

              return (
                <div
                  key={item.id}
                  className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-(--elevated)/50 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Thumbnail preview */}
                    <div className="w-12 h-12 rounded-lg border border-(--line) bg-(--elevated) shrink-0 overflow-hidden flex items-center justify-center">
                      {item.originalUrl ? (
                        <img
                          src={item.compressedUrl || item.originalUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileImage size={20} className="text-(--muted)" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-(--text) truncate max-w-xs font-sans">
                          {item.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-(--elevated) border border-(--line) uppercase text-(--accent) font-semibold">
                          {item.originalFormat}
                        </span>
                        {item.isFromFolder && (
                          <span
                            className="text-[10px] font-mono text-(--muted) truncate max-w-sm"
                            title={item.relativePath}
                          >
                            📁 {item.relativePath}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-3 text-xs font-mono text-(--muted)">
                        <span>{formatBytes(item.originalSize)}</span>
                        {item.status === 'done' && (
                          <>
                            <span>→</span>
                            <span className="font-bold text-(--success)">
                              {formatBytes(item.compressedSize)}
                            </span>
                            {percent > 0 ? (
                              <span className="text-(--accent) font-bold">(-{percent}%)</span>
                            ) : (
                              <span className="text-(--muted)">(без изменений)</span>
                            )}
                            <span className="hidden lg:inline text-[10px] text-(--muted)">
                              · {item.engineUsed}
                            </span>
                          </>
                        )}
                        {item.status === 'processing' && (
                          <span className="text-(--accent) flex items-center gap-1">
                            <RefreshCw size={11} className="animate-spin" /> сжатие...
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-(--danger) flex items-center gap-1">
                            <AlertTriangle size={11} /> {item.errorMsg || 'Ошибка'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {item.status === 'done' && (
                      <button
                        onClick={() => downloadSingle(item)}
                        title="Скачать сжатый файл"
                        className="px-2.5 py-1.5 border border-(--line) hover:border-(--accent) text-(--text) text-xs font-mono rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Download size={13} />
                        Скачать
                      </button>
                    )}
                    <button
                      onClick={() => removeItem(item.id)}
                      title="Удалить из списка"
                      className="p-1.5 border border-transparent hover:border-(--line) hover:text-(--danger) text-(--muted) rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 5. Нижняя панель действий (ДУБЛИРОВАНИЕ кнопок «Очистить», «Сжать всё» и «Скачать всё в ZIP») */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border border-(--line) bg-(--elevated) rounded-xl text-xs font-mono">
            <div className="text-xs font-mono text-(--muted)">
              Элементов в очереди: <strong className="text-(--text)">{items.length}</strong>
              {savedBytes > 0 && (
                <span className="ml-2 text-(--success) font-bold">
                  (сэкономлено {formatBytes(savedBytes)})
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 ml-auto">
              <button
                onClick={clearAll}
                disabled={isProcessing}
                className="px-3.5 py-2 border border-(--line) hover:border-(--danger) hover:text-(--danger) text-xs font-mono rounded-lg transition-colors flex items-center gap-1.5 text-(--muted)"
              >
                <Trash2 size={13} />
                Очистить
              </button>

              <button
                onClick={processAll}
                disabled={isProcessing}
                className="px-4 py-2 border border-(--accent) bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover) font-bold rounded-lg transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <RefreshCw size={13} className={isProcessing ? 'animate-spin' : ''} />
                {isProcessing ? `Сжатие (${processedCount}/${items.length})...` : 'Сжать всё'}
              </button>

              <button
                onClick={downloadAllZip}
                disabled={isZipping}
                className="px-4 py-2 border border-(--success) bg-(--success) hover:opacity-90 text-white font-bold rounded-lg transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Archive size={14} className={isZipping ? 'animate-spin' : ''} />
                {isZipping ? 'Упаковка ZIP...' : anyFolders ? 'Скачать папку в ZIP' : 'Скачать всё в ZIP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SquooshStudio;
