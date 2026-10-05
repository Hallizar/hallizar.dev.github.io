import { useState, useRef, useCallback, useEffect } from 'react';
import {
  UploadCloud,
  FolderOpen,
  Archive,
  Trash2,
  FileImage,
  RefreshCw,
  Download,
  ShieldCheck,
  HardDrive,
  Info,
  CheckCircle2,
  AlertTriangle,
  FolderTree,
  Sparkles,
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
  
  // Только один параметр: «Желаемый вес»
  const [targetValue, setTargetValue] = useState<number>(300);
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB');
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const targetBytes = targetUnit === 'MB' ? targetValue * 1024 * 1024 : targetValue * 1024;

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      items.forEach((it) => {
        if (it.originalUrl) URL.revokeObjectURL(it.originalUrl);
        if (it.compressedUrl) URL.revokeObjectURL(it.compressedUrl);
      });
    };
  }, []);

  /**
   * Сжатие PNG с сохранением формата PNG через WebAssembly imagequant.
   */
  const compressPng = async (
    file: File,
    img: HTMLImageElement,
    targetLimit: number,
  ): Promise<{ blob: Blob; engine: string }> => {
    // Если исходный файл уже меньше желаемого веса
    if (file.size <= targetLimit) {
      return { blob: file, engine: 'PNG (оригинал без изменений)' };
    }

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Не удалось инициализировать 2D-контекст canvas');

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Пытаемся использовать WASM imagequant с подбором параметров под желаемый вес
    try {
      let bestBlob: Blob | null = null;
      let bestSize = Infinity;

      // Тестируем комбинации палитры (256, 128, 64) для приближения к желаемому весу
      const palettes = [256, 160, 96, 48, 24];
      for (const colors of palettes) {
        const pngBytes = await quantizePng(
          imageData.data,
          canvas.width,
          canvas.height,
          0,
          Math.min(85, Math.max(20, Math.round((targetLimit / file.size) * 100))),
          colors,
        );
        const currentBlob = new Blob([pngBytes.buffer as ArrayBuffer], { type: 'image/png' });

        if (currentBlob.size < bestSize) {
          bestBlob = currentBlob;
          bestSize = currentBlob.size;
        }

        // Если уложились в желаемый вес — останавливаемся
        if (currentBlob.size <= targetLimit) {
          break;
        }
      }

      if (bestBlob && bestBlob.size < file.size) {
        return { blob: bestBlob, engine: 'WASM imagequant (PNG)' };
      }
    } catch (err) {
      console.warn('[imagequant-wasm] fallback to canvas:', err);
    }

    // Fallback: canvas png export
    const fallback = await canvasToBlob(canvas, 'image/png');
    if (fallback && fallback.size < file.size) {
      return { blob: fallback, engine: 'Canvas PNG' };
    }

    return { blob: file, engine: 'PNG (оригинал)' };
  };

  /**
   * Сжатие JPEG с сохранением формата JPEG бинарным поиском качества под желаемый вес.
   */
  const compressJpeg = async (
    file: File,
    img: HTMLImageElement,
    targetLimit: number,
  ): Promise<{ blob: Blob; engine: string }> => {
    if (file.size <= targetLimit) {
      return { blob: file, engine: 'JPEG (оригинал без изменений)' };
    }

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Не удалось инициализировать canvas');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Бинарный поиск качества (от 0.05 до 0.95)
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
        low = mid; // пробуем чуть лучше качество
      } else {
        high = mid; // нужно сжать сильнее
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

    return { blob: file, engine: 'JPEG (оригинал)' };
  };

  /**
   * Сжатие WebP с сохранением формата WebP под желаемый вес.
   */
  const compressWebp = async (
    file: File,
    img: HTMLImageElement,
    targetLimit: number,
  ): Promise<{ blob: Blob; engine: string }> => {
    if (file.size <= targetLimit) {
      return { blob: file, engine: 'WebP (оригинал без изменений)' };
    }

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

    return { blob: file, engine: 'WebP (оригинал)' };
  };

  /**
   * Рекурсивное чтение папок при Drop (Drag and Drop directory support)
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

  /**
   * Добавление файлов в очередь.
   * Автоматически определяет, передана папка или отдельные файлы.
   */
  const addFilesToQueue = async (
    rawFiles: { file: File; relativePath?: string; isFromFolder?: boolean }[],
  ) => {
    const validItems: CompressorFileItem[] = [];

    for (const item of rawFiles) {
      const { file } = item;
      const fmt = detectFormat(file);

      // Пропускаем не-изображения
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
        // Если векторный или нераспознанный — сохраняем базовые 0
      }

      // Если у файла есть путь от папки
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

  /**
   * Запуск процесса сжатия всех элементов под заданный желаемый вес.
   */
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
            const res = await compressPng(it.file, img, targetBytes);
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
  }, [items, isProcessing, targetBytes]);

  // Drag and drop handlers
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
            filesWithPaths.push(
              ...dirFiles.map((f) => ({ ...f, isFromFolder: true })),
            );
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

    // Fallback: standard file list
    const droppedFiles = Array.from(e.dataTransfer.files);
    await addFilesToQueue(
      droppedFiles.map((f) => ({
        file: f,
        relativePath: f.webkitRelativePath || f.name,
        isFromFolder: Boolean(f.webkitRelativePath && f.webkitRelativePath.includes('/')),
      })),
    );
  };

  // Input file change (individual files)
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

  // Folder input change (directory selection via webkitdirectory)
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

  // Скачивание отдельного сжатого файла
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

  // Скачивание всех сжатых файлов в ZIP с сохранением структуры папок
  const downloadAllZip = async () => {
    if (items.length === 0 || isZipping) return;
    setIsZipping(true);

    try {
      const zip = new JSZip();

      for (const item of items) {
        const blob = item.compressedBlob || item.file;
        // Если файл был частью папки, сохраняем исходный относительный путь
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
              Сжиматель изображений
            </h2>
          </div>
          <p className="mt-1 text-xs font-mono text-(--muted)">
            Локальная компрессия без потери исходного формата · PNG (WASM imagequant) · JPEG · WebP
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

      {/* 2. Единственная настройка: «Желаемый вес» + Предупреждение */}
      <div className="p-5 border border-(--line) bg-(--elevated) rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <label className="text-xs font-mono uppercase tracking-wider font-bold text-(--accent) flex items-center gap-1.5">
              <HardDrive size={14} /> Желаемый вес файла
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
            <strong>Предупреждение:</strong> для некоторых форматов (например, детализированный PNG без
            потерь или уже сжатые файлы) итоговый вес может оказаться выше желаемого из-за физических
            ограничений сжатия без принудительного уменьшения разрешения картинки. Исходный формат каждого
            файла строго сохраняется.
          </p>
        </div>
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
          {/* Summary Bar */}
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

            <button
              onClick={downloadAllZip}
              disabled={isZipping}
              className="px-4 py-2 border border-(--success) bg-(--success) hover:opacity-90 text-white font-bold rounded-lg transition-all flex items-center gap-2 shadow-sm ml-auto disabled:opacity-50"
            >
              <Archive size={14} className={isZipping ? 'animate-spin' : ''} />
              {isZipping ? 'Упаковка ZIP...' : anyFolders ? 'Скачать папку в ZIP' : 'Скачать всё в ZIP'}
            </button>
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
                          <span className="text-[10px] font-mono text-(--muted) truncate max-w-sm" title={item.relativePath}>
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
        </div>
      )}
    </div>
  );
}

export default SquooshStudio;
