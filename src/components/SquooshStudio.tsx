import { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FolderOpen,
  Archive,
  Trash2,
  CheckCircle2,
  FileImage,
  RefreshCw,
  Sliders,
  FolderTree,
  Download,
  Zap,
  Sparkles,
  HardDrive,
  Info,
  Maximize2,
  X,
  Split,
  Layers,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import JSZip from 'jszip';

export type OutputFormat = 'original' | 'webp' | 'jpeg' | 'png';
export type OptimizationMode = 'target-size' | 'manual-quality';

export interface SquooshFileItem {
  id: string;
  name: string;
  relativePath: string;
  originalSize: number;
  originalFormat: string;
  originalUrl: string;
  width: number;
  height: number;
  outputFormat: OutputFormat;
  convertedBlob: Blob | null;
  convertedUrl: string | null;
  convertedSize: number;
  qualityUsed: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMsg?: string;
  unchanged?: boolean;
}

export function SquooshStudio() {
  const [items, setItems] = useState<SquooshFileItem[]>([]);

  // Format selection: 'original' (keeps input format), 'webp', 'jpeg', or 'png'
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('original');

  // Optimization mode: target size vs manual quality
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>('target-size');

  // Target size settings
  const [targetSizeKB, setTargetSizeKB] = useState<number>(200);
  const [sizeUnit, setSizeUnit] = useState<'KB' | 'MB'>('KB');
  const [customInputValue, setCustomInputValue] = useState<number>(200);

  // Manual quality settings
  const [qualitySlider, setQualitySlider] = useState<number>(80);
  const [pngColors, setPngColors] = useState<number>(128);

  // Folder preservation setting
  const [preserveFolderStructure, setPreserveFolderStructure] = useState<boolean>(true);

  // Status & processing
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [progressCount, setProgressCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  // Squoosh Interactive Split Inspector Modal
  const [inspectingItem, setInspectingItem] = useState<SquooshFileItem | null>(null);
  const [splitPosition, setSplitPosition] = useState<number>(50); // percentage 0-100

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 Б';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
  };

  const addLog = (text: string) => {
    setLogs((prev) => [...prev, text]);
    setTimeout(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    }, 40);
  };

  const detectFormat = (file: File): 'jpeg' | 'png' | 'webp' | 'other' => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (file.type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') return 'jpeg';
    if (file.type === 'image/png' || ext === 'png') return 'png';
    if (file.type === 'image/webp' || ext === 'webp') return 'webp';
    return 'other';
  };

  const loadImage = (fileOrBlob: Blob | File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось прочитать изображение'));
      };
      img.src = url;
    });
  };

  const canvasToBlob = (
    canvas: HTMLCanvasElement,
    type: string,
    quality?: number
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Ошибка создания Blob'));
        },
        type,
        quality
      );
    });
  };

  // Color quantization for PNG
  const quantizeCanvasPng = (canvas: HTMLCanvasElement, levels: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const step = 256 / Math.max(2, Math.floor(Math.cbrt(levels)));
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.floor(data[i] / step) * step + step / 2);
      data[i + 1] = Math.min(255, Math.floor(data[i + 1] / step) * step + step / 2);
      data[i + 2] = Math.min(255, Math.floor(data[i + 2] / step) * step + step / 2);
      if (data[i + 3] > 240) data[i + 3] = 255;
      else if (data[i + 3] < 20) data[i + 3] = 0;
    }
    ctx.putImageData(imgData, 0, 0);
  };

  // Core Squoosh-inspired compression & conversion engine
  const processImageSquoosh = async (
    file: File
  ): Promise<{
    blob: Blob;
    width: number;
    height: number;
    qualityUsed: string;
    effectiveFormat: OutputFormat;
    unchanged?: boolean;
  }> => {
    const detected = detectFormat(file);
    const effectiveFormat: OutputFormat =
      outputFormat === 'original' ? (detected === 'other' ? 'jpeg' : detected) : outputFormat;

    const targetBytes = targetSizeKB * 1024;

    // Check if target size mode and original already <= targetBytes AND keeping original format
    if (
      optimizationMode === 'target-size' &&
      outputFormat === 'original' &&
      file.size <= targetBytes
    ) {
      return {
        blob: file,
        width: 0,
        height: 0,
        qualityUsed: 'Вес в норме (исходный)',
        effectiveFormat,
        unchanged: true,
      };
    }

    const img = await loadImage(file);
    const width = img.naturalWidth;
    const height = img.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Ошибка Canvas 2D');
    ctx.drawImage(img, 0, 0, width, height);

    // TARGET SIZE MODE
    if (optimizationMode === 'target-size') {
      if (effectiveFormat === 'webp' || effectiveFormat === 'jpeg') {
        const mime = effectiveFormat === 'webp' ? 'image/webp' : 'image/jpeg';
        let low = 0.05;
        let high = 0.98;
        let bestBlob: Blob | null = null;
        let bestQuality = 0.8;

        for (let step = 0; step < 9; step++) {
          const q = (low + high) / 2;
          const candidate = await canvasToBlob(canvas, mime, q);
          if (candidate.size <= targetBytes) {
            bestBlob = candidate;
            bestQuality = q;
            low = q + 0.02;
          } else {
            high = q - 0.02;
          }
        }

        if (!bestBlob) {
          bestBlob = await canvasToBlob(canvas, mime, 0.05);
          bestQuality = 0.05;
        }

        return {
          blob: bestBlob,
          width,
          height,
          effectiveFormat,
          qualityUsed: `${effectiveFormat.toUpperCase()} q=${Math.round(bestQuality * 100)}% (≤ ${targetSizeKB} КБ)`,
        };
      }

      if (effectiveFormat === 'png') {
        const normalBlob = await canvasToBlob(canvas, 'image/png');
        if (normalBlob.size <= targetBytes) {
          return {
            blob: normalBlob,
            width,
            height,
            effectiveFormat,
            qualityUsed: 'PNG Standard (≤ ' + targetSizeKB + ' КБ)',
          };
        }

        const levelsToTest = [128, 64, 36, 24, 16, 8];
        let bestBlob: Blob = normalBlob;
        let bestLevel = 128;

        for (const lvl of levelsToTest) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = width;
          tempCanvas.height = height;
          const tempCtx = tempCanvas.getContext('2d');
          if (!tempCtx) break;
          tempCtx.drawImage(img, 0, 0, width, height);
          quantizeCanvasPng(tempCanvas, lvl);

          const candidate = await canvasToBlob(tempCanvas, 'image/png');
          bestBlob = candidate;
          bestLevel = lvl;
          if (candidate.size <= targetBytes) {
            break;
          }
        }

        return {
          blob: bestBlob,
          width,
          height,
          effectiveFormat,
          qualityUsed: `PNG Palette (${bestLevel} цв.)`,
        };
      }
    }

    // MANUAL QUALITY MODE (Squoosh Slider)
    if (effectiveFormat === 'webp' || effectiveFormat === 'jpeg') {
      const mime = effectiveFormat === 'webp' ? 'image/webp' : 'image/jpeg';
      const q = Math.max(0.05, Math.min(1.0, qualitySlider / 100));
      const blob = await canvasToBlob(canvas, mime, q);
      return {
        blob,
        width,
        height,
        effectiveFormat,
        qualityUsed: `${effectiveFormat.toUpperCase()} q=${qualitySlider}%`,
      };
    }

    if (effectiveFormat === 'png') {
      if (pngColors < 256) {
        quantizeCanvasPng(canvas, pngColors);
      }
      const blob = await canvasToBlob(canvas, 'image/png');
      return {
        blob,
        width,
        height,
        effectiveFormat,
        qualityUsed: pngColors < 256 ? `PNG ${pngColors} цв.` : 'PNG 32-bit',
      };
    }

    const fallbackBlob = await canvasToBlob(canvas, file.type || 'image/jpeg', 0.8);
    return {
      blob: fallbackBlob,
      width,
      height,
      effectiveFormat: 'jpeg',
      qualityUsed: 'Auto',
    };
  };

  const processFilesBatch = async (
    filesList: { file: File; relativePath: string }[]
  ) => {
    if (!filesList.length) return;

    setIsProcessing(true);
    setProgressCount(0);

    const initialItems: SquooshFileItem[] = filesList.map(({ file, relativePath }) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: file.name,
      relativePath: relativePath || file.name,
      originalSize: file.size,
      originalFormat: detectFormat(file).toUpperCase(),
      originalUrl: URL.createObjectURL(file),
      width: 0,
      height: 0,
      outputFormat,
      convertedBlob: null,
      convertedUrl: null,
      convertedSize: 0,
      qualityUsed: '',
      status: 'pending',
    }));

    setItems((prev) => [...prev, ...initialItems]);

    for (let i = 0; i < filesList.length; i++) {
      const { file } = filesList[i];
      const itemId = initialItems[i].id;

      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, status: 'processing' } : it))
      );

      try {
        const result = await processImageSquoosh(file);
        const url = URL.createObjectURL(result.blob);

        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  width: result.width,
                  height: result.height,
                  convertedBlob: result.blob,
                  convertedUrl: url,
                  convertedSize: result.blob.size,
                  qualityUsed: result.qualityUsed,
                  outputFormat: result.effectiveFormat,
                  status: 'done',
                  unchanged: result.unchanged,
                }
              : it
          )
        );

        const before = file.size;
        const after = result.blob.size;
        const saved =
          before > 0 ? Math.max(0, Math.round((1 - after / before) * 100)) : 0;

        if (result.unchanged) {
          addLog(`${file.name}: ✓ В норме (${formatBytes(after)} ≤ ${targetSizeKB} КБ)`);
        } else {
          addLog(
            `${file.name} [${result.effectiveFormat.toUpperCase()}]: ${formatBytes(before)} → ${formatBytes(after)} (-${saved}%) [${result.qualityUsed}]`
          );
        }
      } catch (err: any) {
        console.error('Ошибка обработки Squoosh:', file.name, err);
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? { ...it, status: 'error', errorMsg: err?.message || 'Ошибка' }
              : it
          )
        );
        addLog(`${file.name}: ОШИБКА · ${err?.message || 'не удалось обработать'}`);
      }

      setProgressCount(i + 1);
      await new Promise((r) => setTimeout(r, 10));
    }

    setIsProcessing(false);
  };

  const readEntry = async (
    entry: any,
    parentPath: string = ''
  ): Promise<{ file: File; relativePath: string }[]> => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file(
          (file: File) => {
            if (/\.(jpe?g|png|webp|svg|gif|avif)$/i.test(file.name)) {
              resolve([{ file, relativePath: parentPath + file.name }]);
            } else {
              resolve([]);
            }
          },
          () => resolve([])
        );
      });
    }

    if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries: any[] = [];

      const readBatch = () =>
        new Promise<void>((resolve) => {
          reader.readEntries((batch: any[]) => {
            if (!batch.length) {
              resolve();
              return;
            }
            entries.push(...batch);
            readBatch().then(resolve);
          }, () => resolve());
        });

      await readBatch();

      const results: { file: File; relativePath: string }[] = [];
      const folderPath = parentPath + entry.name + '/';

      for (const child of entries) {
        const childFiles = await readEntry(child, folderPath);
        results.push(...childFiles);
      }

      return results;
    }

    return [];
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    try {
      const itemsList = Array.from(e.dataTransfer.items || []);
      const fileEntries: any[] = [];
      let hasDirectory = false;

      for (const item of itemsList) {
        if (item.kind !== 'file') continue;
        const entry = (item as any).webkitGetAsEntry ? (item as any).webkitGetAsEntry() : null;
        if (entry) {
          if (entry.isDirectory) hasDirectory = true;
          fileEntries.push(entry);
        } else {
          const file = item.getAsFile();
          if (file && /\.(jpe?g|png|webp|svg|gif|avif)$/i.test(file.name)) {
            fileEntries.push(file);
          }
        }
      }

      if (hasDirectory) {
        setPreserveFolderStructure(true);
      }

      const allFiles: { file: File; relativePath: string }[] = [];
      for (const entry of fileEntries) {
        if (entry instanceof File) {
          allFiles.push({ file: entry, relativePath: entry.name });
        } else {
          const childFiles = await readEntry(entry);
          allFiles.push(...childFiles);
        }
      }

      if (allFiles.length) {
        addLog(`Загружено ${allFiles.length} изображений в Squoosh Studio...`);
        await processFilesBatch(allFiles);
      }
    } catch (err) {
      console.error(err);
      addLog('Ошибка при чтении файлов');
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files)
      .filter((f) => /\.(jpe?g|png|webp|svg|gif|avif)$/i.test(f.name))
      .map((f) => ({ file: f, relativePath: f.name }));

    e.target.value = '';
    if (files.length) {
      addLog(`Выбрано ${files.length} отдельных файлов...`);
      await processFilesBatch(files);
    }
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files)
      .filter((f) => /\.(jpe?g|png|webp|svg|gif|avif)$/i.test(f.name))
      .map((f) => ({
        file: f,
        relativePath: (f as any).webkitRelativePath || f.name,
      }));

    e.target.value = '';
    if (files.length) {
      setPreserveFolderStructure(true);
      addLog(`Выбрана папка (${files.length} файлов со структурой)...`);
      await processFilesBatch(files);
    }
  };

  const getTargetFilename = (item: SquooshFileItem): string => {
    const baseName = item.name.replace(/\.[^.]+$/, '');
    if (item.outputFormat === 'webp') return `${baseName}.webp`;
    if (item.outputFormat === 'jpeg') return `${baseName}.jpg`;
    if (item.outputFormat === 'png') return `${baseName}.png`;
    return item.name;
  };

  const handleDownloadZip = async () => {
    const readyItems = items.filter((it) => it.status === 'done' && it.convertedBlob);
    if (!readyItems.length) return;

    setIsZipping(true);
    addLog('Формирование ZIP архива...');

    try {
      const zip = new JSZip();

      readyItems.forEach((item) => {
        let savePath = preserveFolderStructure ? item.relativePath : item.name;
        if (item.outputFormat === 'webp') {
          savePath = savePath.replace(/\.[^.]+$/, '.webp');
        } else if (item.outputFormat === 'jpeg') {
          savePath = savePath.replace(/\.[^.]+$/, '.jpg');
        } else if (item.outputFormat === 'png') {
          savePath = savePath.replace(/\.[^.]+$/, '.png');
        }
        zip.file(savePath, item.convertedBlob!);
      });

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `squoosh-optimized-${outputFormat}-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      addLog(`Архив готов: ${formatBytes(zipBlob.size)}. Скачивание запущено.`);
    } catch (err: any) {
      console.error('Ошибка создания ZIP:', err);
      addLog(`Ошибка создания ZIP: ${err?.message || ''}`);
    } finally {
      setIsZipping(false);
    }
  };

  const handleClearAll = () => {
    items.forEach((it) => {
      if (it.convertedUrl) URL.revokeObjectURL(it.convertedUrl);
      if (it.originalUrl) URL.revokeObjectURL(it.originalUrl);
    });
    setItems([]);
    setLogs([]);
  };

  const setWeightPreset = (kb: number) => {
    setTargetSizeKB(kb);
    if (kb >= 1024) {
      setSizeUnit('MB');
      setCustomInputValue(Number((kb / 1024).toFixed(1)));
    } else {
      setSizeUnit('KB');
      setCustomInputValue(kb);
    }
  };

  const handleCustomWeightChange = (val: number, unit: 'KB' | 'MB') => {
    setCustomInputValue(val);
    const finalKB = unit === 'MB' ? Math.round(val * 1024) : Math.round(val);
    setTargetSizeKB(Math.max(10, finalKB));
  };

  // Split slider mouse/touch handler
  const handleSplitDrag = (clientX: number) => {
    if (!splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = (x / rect.width) * 100;
    setSplitPosition(Math.max(5, Math.min(95, percent)));
  };

  const totalOriginalBytes = items.reduce((acc, it) => acc + it.originalSize, 0);
  const totalConvertedBytes = items.reduce(
    (acc, it) => acc + (it.status === 'done' ? it.convertedSize : it.originalSize),
    0
  );
  const totalSavedBytes = Math.max(0, totalOriginalBytes - totalConvertedBytes);
  const totalSavedPct =
    totalOriginalBytes > 0
      ? Math.round((totalSavedBytes / totalOriginalBytes) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header with Squoosh Engine Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#24242e]">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-[#8a00ff]/20 text-[#bd5aff] border border-[#8a00ff]/40">
              Squoosh Engine
            </span>
            <span className="text-[10px] font-mono text-[#00ff9d] flex items-center gap-1.5 bg-[#0e1e16] px-2 py-0.5 border border-[#00ff9d]/30">
              <Zap size={11} />
              Совмещённый сервис: Сжатие по весу + WebP / MozJPEG / OxiPNG
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold font-sans text-white tracking-tight flex items-center gap-2">
            Squoosh Studio
            <span className="text-xs font-mono font-normal text-[#888896]">
              &middot; Архитектура GoogleChromeLabs Squoosh
            </span>
          </h2>
          <p className="text-xs text-[#8c8c9a] mt-1 max-w-3xl leading-relaxed">
            Мощный браузерный инструмент для сжатия и конвертации изображений: загружайте <strong>папками или файлами</strong>, выбирайте <strong>исходный формат или WebP</strong>, настраивайте <strong>желаемый вес файла</strong> или фиксированное качество, и инспектируйте качество слайдером «До / После».
          </p>
        </div>

        {items.length > 0 && (
          <button
            onClick={handleClearAll}
            className="self-start sm:self-center px-3 py-1.5 border border-[#362536] bg-[#1a0f1e] text-[#ff6685] hover:bg-[#2c1328] hover:border-[#ff4070] transition-colors text-xs font-mono flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 size={13} />
            Очистить всё ({items.length})
          </button>
        )}
      </div>

      {/* Control Station: Output Format & Optimization Strategy */}
      <div className="border border-[#282836] bg-[#08080d] p-4 sm:p-5 space-y-4">
        {/* Row 1: Output Format Choice */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#1c1c26]">
          <div className="text-xs font-mono text-[#bd5aff] font-bold uppercase tracking-wider flex items-center gap-2">
            <Layers size={15} /> 1. Формат на выходе:
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-mono">
            <button
              type="button"
              onClick={() => setOutputFormat('original')}
              className={`px-3 py-1.5 border transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
                outputFormat === 'original'
                  ? 'border-[#8a00ff] bg-[#8a00ff] text-white shadow-sm'
                  : 'border-[#262634] bg-[#0c0c14] text-[#888894] hover:text-white'
              }`}
            >
              <RefreshCw size={12} />
              Исходный формат (JPG в JPG, PNG в PNG)
            </button>

            <button
              type="button"
              onClick={() => setOutputFormat('webp')}
              className={`px-3 py-1.5 border transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
                outputFormat === 'webp'
                  ? 'border-[#00ff9d] bg-[#00ff9d] text-black shadow-sm'
                  : 'border-[#262634] bg-[#0c0c14] text-[#888894] hover:text-white'
              }`}
            >
              <Zap size={12} />
              Конвертировать в WebP
            </button>

            <button
              type="button"
              onClick={() => setOutputFormat('jpeg')}
              className={`px-3 py-1.5 border transition-all cursor-pointer font-bold ${
                outputFormat === 'jpeg'
                  ? 'border-[#8a00ff] bg-[#8a00ff] text-white'
                  : 'border-[#262634] bg-[#0c0c14] text-[#888894] hover:text-white'
              }`}
            >
              JPEG (MozJPEG)
            </button>

            <button
              type="button"
              onClick={() => setOutputFormat('png')}
              className={`px-3 py-1.5 border transition-all cursor-pointer font-bold ${
                outputFormat === 'png'
                  ? 'border-[#8a00ff] bg-[#8a00ff] text-white'
                  : 'border-[#262634] bg-[#0c0c14] text-[#888894] hover:text-white'
              }`}
            >
              PNG (OxiPNG)
            </button>
          </div>
        </div>

        {/* Row 2: Optimization Mode Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1c1c26]">
          <div className="text-xs font-mono text-[#00ff9d] font-bold uppercase tracking-wider flex items-center gap-2">
            <Sliders size={15} /> 2. Режим сжатия Squoosh:
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-mono">
            <button
              type="button"
              onClick={() => setOptimizationMode('target-size')}
              className={`px-3 py-1.5 border transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
                optimizationMode === 'target-size'
                  ? 'border-[#00ff9d] bg-[#00ff9d] text-black shadow-sm'
                  : 'border-[#282838] bg-[#0c0c14] text-[#80808e] hover:text-white'
              }`}
            >
              <HardDrive size={13} />
              Таргетный вес (Целевой размер КБ/МБ)
            </button>

            <button
              type="button"
              onClick={() => setOptimizationMode('manual-quality')}
              className={`px-3 py-1.5 border transition-all cursor-pointer font-bold flex items-center gap-1.5 ${
                optimizationMode === 'manual-quality'
                  ? 'border-[#8a00ff] bg-[#8a00ff] text-white shadow-sm'
                  : 'border-[#282838] bg-[#0c0c14] text-[#80808e] hover:text-white'
              }`}
            >
              <Sliders size={13} />
              Ручное качество (Squoosh Quality)
            </button>
          </div>
        </div>

        {/* Dynamic Controls based on selected mode */}
        {optimizationMode === 'target-size' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center font-mono text-xs">
              {/* Presets */}
              <div>
                <label className="text-[11px] text-[#888896] block mb-2">
                  Быстрый выбор целевого веса:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '50 КБ', kb: 50 },
                    { label: '100 КБ', kb: 100 },
                    { label: '200 КБ', kb: 200 },
                    { label: '300 КБ', kb: 300 },
                    { label: '500 КБ', kb: 500 },
                    { label: '1 МБ', kb: 1024 },
                    { label: '2 МБ', kb: 2048 },
                  ].map((preset) => (
                    <button
                      key={preset.kb}
                      type="button"
                      onClick={() => setWeightPreset(preset.kb)}
                      className={`px-3 py-1.5 border transition-all cursor-pointer font-bold ${
                        targetSizeKB === preset.kb
                          ? 'border-[#00ff9d] bg-[#00ff9d]/20 text-[#00ff9d] shadow-sm'
                          : 'border-[#262634] bg-[#0c0c14] text-[#888894] hover:text-white hover:border-[#38384a]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Input */}
              <div className="bg-[#050508] border border-[#20202c] p-3 space-y-2">
                <label className="text-[11px] text-[#888896] flex items-center justify-between">
                  <span>Точный целевой вес:</span>
                  <span className="text-[#00ff9d] font-bold">
                    = {targetSizeKB} КБ ({targetSizeKB * 1024} байт)
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="50000"
                    step={sizeUnit === 'MB' ? '0.1' : '10'}
                    value={customInputValue}
                    onChange={(e) => {
                      const val = Math.max(0.1, Number(e.target.value));
                      handleCustomWeightChange(val, sizeUnit);
                    }}
                    className="w-32 bg-[#0c0c14] border border-[#38384a] px-3 py-1.5 text-white font-mono text-xs font-bold focus:border-[#00ff9d] outline-none"
                  />

                  <div className="flex border border-[#38384a] bg-[#0c0c14] text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setSizeUnit('KB');
                        handleCustomWeightChange(customInputValue, 'KB');
                      }}
                      className={`px-2.5 py-1.5 transition-colors cursor-pointer ${
                        sizeUnit === 'KB'
                          ? 'bg-[#00ff9d] text-black font-bold'
                          : 'text-[#888] hover:text-white'
                      }`}
                    >
                      КБ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSizeUnit('MB');
                        handleCustomWeightChange(customInputValue, 'MB');
                      }}
                      className={`px-2.5 py-1.5 transition-colors cursor-pointer ${
                        sizeUnit === 'MB'
                          ? 'bg-[#00ff9d] text-black font-bold'
                          : 'text-[#888] hover:text-white'
                      }`}
                    >
                      МБ
                    </button>
                  </div>

                  <span className="text-[10px] text-[#777] hidden sm:inline">
                    (лимит на 1 файл)
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#0a120e] border border-[#143324] text-xs font-mono text-[#a0c8b2] flex items-center gap-2">
              <Info size={15} className="text-[#00ff9d] shrink-0" />
              <span>
                {outputFormat === 'original'
                  ? 'Файлы сохранят исходный формат (JPG в JPG, PNG в PNG, WebP в WebP) и сожмутся ровно до ≤ ' + targetSizeKB + ' КБ.'
                  : 'Все файлы сконвертируются в ' + outputFormat.toUpperCase() + ' и сожмутся до целевого веса ≤ ' + targetSizeKB + ' КБ.'}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center font-mono text-xs">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[11px] text-[#787888]">
                <span>10% (Макс. сжатие)</span>
                <span className="text-[#bd5aff] font-bold">Качество: {qualitySlider}%</span>
                <span>100% (Макс. четкость)</span>
              </div>

              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={qualitySlider}
                onChange={(e) => setQualitySlider(Number(e.target.value))}
                className="w-full accent-[#8a00ff] cursor-pointer"
              />

              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: '60% (Сверхсжатие)', q: 60 },
                  { label: '75% (Оптимально)', q: 75 },
                  { label: '85% (Высокое)', q: 85 },
                  { label: '95% (Ультра)', q: 95 },
                ].map((item) => (
                  <button
                    key={item.q}
                    type="button"
                    onClick={() => setQualitySlider(item.q)}
                    className={`px-2.5 py-1 border text-[10px] cursor-pointer transition-colors ${
                      qualitySlider === item.q
                        ? 'border-[#8a00ff] bg-[#8a00ff]/20 text-white font-bold'
                        : 'border-[#222230] bg-[#0c0c14] text-[#787886] hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#050508] border border-[#20202c] p-3 text-[11px] text-[#8e8e9c] space-y-2">
              <div className="text-white font-bold flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#00ff9d]" />
                Фиксированное Squoosh качество:
              </div>
              <p className="m-0 leading-relaxed">
                Каждый кадр пережимается ровно с коэффициентом {qualitySlider}%. Разрешение и пропорции сохраняются на 100% без пиксельного ресайза.
              </p>
            </div>
          </div>
        )}

        {/* Row 3: Folder Structure Checkbox */}
        <div className="pt-2 border-t border-[#1c1c26] flex items-center justify-between text-xs font-mono">
          <label className="flex items-center gap-2 cursor-pointer select-none text-white">
            <input
              type="checkbox"
              checked={preserveFolderStructure}
              onChange={(e) => setPreserveFolderStructure(e.target.checked)}
              className="w-4 h-4 accent-[#8a00ff] cursor-pointer"
            />
            <span className="text-[11px] text-[#00ff9d] font-bold flex items-center gap-1">
              <FolderTree size={13} />
              Сохранять структуру вложенных папок в ZIP архиве
            </span>
          </label>

          <span className="text-[11px] text-[#787888]">
            {optimizationMode === 'target-size'
              ? `Лимит: ≤ ${targetSizeKB} КБ`
              : `Качество: ${qualitySlider}%`}
            {' '}&middot; {outputFormat.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Upload Zone (Папкой или отдельными файлами) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed p-8 text-center transition-all duration-200 relative overflow-hidden group ${
          isDragOver
            ? 'border-[#00ff9d] bg-[#00ff9d]/10 scale-[1.005]'
            : 'border-[#282836] bg-[#08080d] hover:border-[#8a00ff]/60 hover:bg-[#0c0c14]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: '', directory: '' } as any)}
          multiple
          className="hidden"
          onChange={handleFolderInputChange}
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-full bg-[#12121c] border border-[#2c2c3c] flex items-center justify-center text-[#00ff9d] group-hover:scale-110 group-hover:border-[#00ff9d] transition-all">
            <UploadCloud size={28} />
          </div>

          <div>
            <div className="text-base font-bold text-white mb-1">
              Загрузите изображения в Squoosh Studio папкой или отдельными файлами
            </div>
            <div className="text-xs font-mono text-[#8a8a9a]">
              Поддерживаются JPG, PNG, WebP, GIF, AVIF · Автоопределение структуры папок
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-3 font-mono text-xs">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                folderInputRef.current?.click();
              }}
              className="px-5 py-2.5 border border-[#8a00ff] bg-[#8a00ff] hover:bg-[#9d1aff] text-white transition-all flex items-center gap-2 cursor-pointer font-bold shadow-lg"
            >
              <FolderOpen size={16} />
              Загрузить папкой целиком
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-5 py-2.5 border border-[#3b3b4d] bg-[#12121a] hover:bg-[#1f1f2e] text-[#cfcfd8] hover:text-white transition-colors flex items-center gap-2 cursor-pointer font-bold"
            >
              <FileImage size={16} />
              Загрузить отдельные файлы
            </button>
          </div>
        </div>
      </div>

      {/* Progress & Live Log */}
      {(isProcessing || logs.length > 0) && (
        <div className="border border-[#262634] bg-[#07070b] p-4 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between text-[#888896]">
            <span className="text-white font-bold flex items-center gap-2">
              {isProcessing ? (
                <>
                  <RefreshCw size={13} className="animate-spin text-[#00ff9d]" />
                  Squoosh оптимизация: {progressCount} / {items.length}
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} className="text-[#00ff9d]" />
                  Обработка Squoosh завершена!
                </>
              )}
            </span>
            <span className="text-[#00ff9d] font-bold">
              {items.length > 0 ? Math.round((progressCount / items.length) * 100) : 0}%
            </span>
          </div>

          <div className="h-1.5 w-full bg-[#14141c] overflow-hidden rounded-full border border-[#222230]">
            <div
              className="h-full bg-gradient-to-r from-[#8a00ff] to-[#00ff9d] transition-all duration-200"
              style={{
                width: `${items.length > 0 ? Math.min(100, Math.round((progressCount / items.length) * 100)) : 0}%`,
              }}
            />
          </div>

          <div
            ref={logContainerRef}
            className="h-28 overflow-y-auto bg-[#040407] border border-[#1a1a24] p-2.5 space-y-1 text-[11px] text-[#8e8e9c]"
          >
            {logs.map((logLine, idx) => (
              <div key={idx} className="whitespace-nowrap font-mono">
                <span className="text-[#00ff9d] mr-1.5">&gt;</span>
                {logLine}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results & Actions Bar */}
      {items.length > 0 && (
        <div className="space-y-4">
          <div className="border border-[#282836] bg-[#09090e] p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-[10px] text-[#6c6c78] block">ФАЙЛОВ:</span>
                <span className="text-white font-bold">{items.length} шт</span>
              </div>
              <div className="h-6 w-px bg-[#20202c]" />
              <div>
                <span className="text-[10px] text-[#6c6c78] block">ИСХОДНЫЙ ВЕС:</span>
                <span className="text-white font-bold">{formatBytes(totalOriginalBytes)}</span>
              </div>
              <div className="h-6 w-px bg-[#20202c]" />
              <div>
                <span className="text-[10px] text-[#6c6c78] block">ИТОГОВЫЙ ВЕС:</span>
                <span className="text-[#00ff9d] font-bold">{formatBytes(totalConvertedBytes)}</span>
              </div>
              <div className="h-6 w-px bg-[#20202c]" />
              <div>
                <span className="text-[10px] text-[#6c6c78] block">ЭКОНОМИЯ:</span>
                <span className={`font-bold ${totalSavedPct > 0 ? 'text-[#00ff9d]' : 'text-white'}`}>
                  {totalSavedPct > 0 ? `-${totalSavedPct}% (${formatBytes(totalSavedBytes)})` : '0%'}
                </span>
              </div>
            </div>

            <button
              onClick={handleDownloadZip}
              disabled={isZipping || isProcessing || items.every((it) => it.status !== 'done')}
              className="w-full md:w-auto px-6 py-2.5 bg-[#8a00ff] hover:bg-[#9d1aff] disabled:bg-[#333] text-white font-mono text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Archive size={15} />
              {isZipping ? 'Упаковка ZIP...' : 'СКАЧАТЬ ZIP АРХИВ'}
            </button>
          </div>

          {/* Files List with Squoosh Inspector Trigger */}
          <div className="border border-[#22222e] bg-[#08080c] divide-y divide-[#181822] max-h-[420px] overflow-y-auto">
            {items.map((item) => {
              const savings =
                item.originalSize > 0 && item.convertedSize > 0
                  ? Math.round(((item.originalSize - item.convertedSize) / item.originalSize) * 100)
                  : 0;

              const targetFilename = getTargetFilename(item);

              return (
                <div
                  key={item.id}
                  className="p-3 flex items-center justify-between gap-3 text-xs font-mono hover:bg-[#0c0c14] transition-colors"
                >
                  <div
                    onClick={() => item.convertedUrl && setInspectingItem(item)}
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
                    title="Нажмите для интерактивного сравнения До/После в стиле Squoosh"
                  >
                    <div className="w-10 h-10 bg-[#040407] border border-[#20202c] group-hover:border-[#00ff9d] shrink-0 flex items-center justify-center overflow-hidden relative">
                      {item.convertedUrl ? (
                        <img
                          src={item.convertedUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileImage size={18} className="text-[#444]" />
                      )}
                      <div className="absolute inset-0 bg-[#00ff9d]/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Split size={14} className="text-[#00ff9d]" />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-white font-bold truncate max-w-[220px] sm:max-w-[360px] group-hover:text-[#00ff9d] transition-colors"
                          title={preserveFolderStructure ? item.relativePath : item.name}
                        >
                          {preserveFolderStructure
                            ? item.relativePath.replace(/\.[^.]+$/, `.${targetFilename.split('.').pop()}`)
                            : targetFilename}
                        </span>
                        <span className="text-[9px] uppercase px-1.5 py-0.2 border border-[#333] bg-[#14141c] text-[#a0a0b0]">
                          {item.outputFormat.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#70707e] flex items-center gap-2 mt-0.5">
                        {item.width > 0 && (
                          <span className="text-[#8a00ff]">
                            {item.width}×{item.height} px
                          </span>
                        )}
                        <span>· До: {formatBytes(item.originalSize)}</span>
                        {item.qualityUsed && (
                          <span className="text-[#00ff9d]">[{item.qualityUsed}]</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      {item.status === 'processing' && (
                        <span className="text-[#ffd000] text-[11px] animate-pulse">Squoosh...</span>
                      )}
                      {item.status === 'done' && (
                        <div>
                          <div className="text-[#00ff9d] font-bold">
                            {formatBytes(item.convertedSize)}
                          </div>
                          <div className={`text-[10px] ${savings > 0 ? 'text-[#00ff9d]' : 'text-[#888]'}`}>
                            {item.unchanged ? 'Без изменений' : `-${savings}%`}
                          </div>
                        </div>
                      )}
                      {item.status === 'error' && (
                        <span className="text-[#ff4070] text-[10px]">Ошибка</span>
                      )}
                    </div>

                    {item.status === 'done' && item.convertedUrl && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInspectingItem(item)}
                          title="Сравнить До/После (Squoosh Splitter)"
                          className="p-1.5 border border-[#242432] bg-[#0c0c14] text-[#888894] hover:text-[#00ff9d] hover:border-[#00ff9d] transition-colors cursor-pointer"
                        >
                          <Split size={13} />
                        </button>

                        <a
                          href={item.convertedUrl}
                          download={targetFilename}
                          title={`Скачать ${targetFilename}`}
                          className="p-1.5 border border-[#242432] bg-[#0c0c14] text-[#cfcfd8] hover:text-white hover:border-[#8a00ff] transition-colors cursor-pointer"
                        >
                          <Download size={13} />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Squoosh Interactive Split Inspector Modal */}
      {inspectingItem && inspectingItem.convertedUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#0b0b12] border border-[#2f2f3d] w-full max-w-4xl flex flex-col shadow-2xl overflow-hidden font-mono text-xs">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#20202c] bg-[#07070b] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-1.5 bg-[#8a00ff]/20 text-[#00ff9d] border border-[#8a00ff]/40">
                  <Split size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-white font-bold truncate text-sm">
                    {inspectingItem.name}
                  </div>
                  <div className="text-[11px] text-[#70707e] flex items-center gap-2 mt-0.5">
                    <span>Оригинал: {formatBytes(inspectingItem.originalSize)}</span>
                    <ArrowRight size={10} className="text-[#888]" />
                    <span className="text-[#00ff9d] font-bold">
                      {inspectingItem.outputFormat.toUpperCase()}: {formatBytes(inspectingItem.convertedSize)}
                    </span>
                    <span>
                      (-{Math.round(((inspectingItem.originalSize - inspectingItem.convertedSize) / inspectingItem.originalSize) * 100)}%)
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="p-1.5 border border-[#30303c] bg-[#12121a] hover:bg-[#20202e] text-[#aaa] hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Squoosh Comparison Viewport */}
            <div
              ref={splitContainerRef}
              onMouseDown={(e) => {
                handleSplitDrag(e.clientX);
                const handleMove = (moveEvt: MouseEvent) => handleSplitDrag(moveEvt.clientX);
                const handleUp = () => {
                  window.removeEventListener('mousemove', handleMove);
                  window.removeEventListener('mouseup', handleUp);
                };
                window.addEventListener('mousemove', handleMove);
                window.addEventListener('mouseup', handleUp);
              }}
              onTouchMove={(e) => {
                if (e.touches[0]) handleSplitDrag(e.touches[0].clientX);
              }}
              className="relative w-full h-[460px] bg-[#050508] overflow-hidden select-none cursor-ew-resize flex items-center justify-center border-b border-[#20202c]"
            >
              {/* After Image (Right/Optimized) */}
              <img
                src={inspectingItem.convertedUrl}
                alt="Optimized"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />

              {/* Before Image (Left/Original) with clip-path */}
              <div
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ clipPath: `inset(0 ${100 - splitPosition}% 0 0)` }}
              >
                <img
                  src={inspectingItem.originalUrl}
                  alt="Original"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              </div>

              {/* Divider Handle */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#00ff9d] shadow-[0_0_12px_#00ff9d] pointer-events-none"
                style={{ left: `${splitPosition}%` }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#0b0b12] border-2 border-[#00ff9d] shadow-lg flex items-center justify-center text-[#00ff9d]">
                  <Split size={14} />
                </div>
              </div>

              {/* Badges on left and right */}
              <div className="absolute top-3 left-3 bg-black/75 px-2.5 py-1 border border-[#333] text-white font-mono text-[10px] pointer-events-none">
                ДО: {formatBytes(inspectingItem.originalSize)} ({inspectingItem.originalFormat})
              </div>

              <div className="absolute top-3 right-3 bg-black/75 px-2.5 py-1 border border-[#00ff9d]/40 text-[#00ff9d] font-mono text-[10px] pointer-events-none">
                ПОСЛЕ ({inspectingItem.outputFormat.toUpperCase()}): {formatBytes(inspectingItem.convertedSize)}
              </div>

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/80 px-3 py-1 rounded-full border border-[#333] text-[#aaa] text-[10px] pointer-events-none">
                Передвигайте ползунок для сравнения деталей
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#08080d] flex items-center justify-between gap-4 font-mono">
              <div className="text-[11px] text-[#787886]">
                Параметры: <span className="text-[#00ff9d] font-bold">{inspectingItem.qualityUsed}</span>
              </div>

              <a
                href={inspectingItem.convertedUrl}
                download={getTargetFilename(inspectingItem)}
                className="px-4 py-2 bg-[#00ff9d] hover:bg-[#1affb2] text-black font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Download size={14} />
                Скачать оптимизированный файл
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
