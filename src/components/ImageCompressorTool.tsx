import { useState, useRef } from 'react';
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
  ShieldCheck,
  HardDrive,
  Info,
  Layers,
} from 'lucide-react';
import JSZip from 'jszip';

interface ProcessedFileItem {
  id: string;
  name: string;
  relativePath: string;
  originalSize: number;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp' | 'other';
  convertedBlob: Blob | null;
  convertedUrl: string | null;
  convertedSize: number;
  qualityUsed: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMsg?: string;
  unchanged?: boolean;
}

export function ImageCompressorTool() {
  const [items, setItems] = useState<ProcessedFileItem[]>([]);
  
  // Target weight settings (в функциях выбор желаемого веса)
  const [targetSizeKB, setTargetSizeKB] = useState<number>(300);
  const [sizeUnit, setSizeUnit] = useState<'KB' | 'MB'>('KB');
  const [customInputValue, setCustomInputValue] = useState<number>(300);

  // Folder preservation setting
  const [preserveFolderStructure, setPreserveFolderStructure] = useState<boolean>(true);

  // States
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [progressCount, setProgressCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

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

  // Adaptive palette quantization for PNG
  const quantizeCanvasPng = (canvas: HTMLCanvasElement, levels: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const step = 256 / levels;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.floor(data[i] / step) * step + step / 2);
      data[i + 1] = Math.min(255, Math.floor(data[i + 1] / step) * step + step / 2);
      data[i + 2] = Math.min(255, Math.floor(data[i + 2] / step) * step + step / 2);
      if (data[i + 3] > 240) data[i + 3] = 255;
      else if (data[i + 3] < 20) data[i + 3] = 0;
    }
    ctx.putImageData(imgData, 0, 0);
  };

  // Target weight compression keeping 100% ORIGINAL format and 100% original dimensions
  const compressToTargetWeight = async (
    file: File
  ): Promise<{
    blob: Blob;
    width: number;
    height: number;
    format: 'jpeg' | 'png' | 'webp' | 'other';
    qualityUsed: string;
    unchanged?: boolean;
  }> => {
    const format = detectFormat(file);
    const targetBytes = targetSizeKB * 1024;

    // 1. If file already satisfies desired weight, KEEP IT UNTOUCHED
    if (file.size <= targetBytes) {
      return {
        blob: file,
        width: 0,
        height: 0,
        format,
        qualityUsed: 'Вес в норме (исходный)',
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

    // 2. COMPRESS ACCORDING TO ORIGINAL FORMAT (БЕЗ СМЕНЫ ФОРМАТА!)
    if (format === 'jpeg') {
      let low = 0.05;
      let high = 0.98;
      let bestBlob: Blob | null = null;
      let bestQuality = 0.8;

      for (let step = 0; step < 9; step++) {
        const q = (low + high) / 2;
        const candidate = await canvasToBlob(canvas, 'image/jpeg', q);
        if (candidate.size <= targetBytes) {
          bestBlob = candidate;
          bestQuality = q;
          low = q + 0.02;
        } else {
          high = q - 0.02;
        }
      }

      if (!bestBlob) {
        bestBlob = await canvasToBlob(canvas, 'image/jpeg', 0.06);
        bestQuality = 0.06;
      }

      return {
        blob: bestBlob,
        width,
        height,
        format,
        qualityUsed: `JPEG q=${Math.round(bestQuality * 100)}%`,
      };
    }

    if (format === 'webp') {
      let low = 0.05;
      let high = 0.98;
      let bestBlob: Blob | null = null;
      let bestQuality = 0.8;

      for (let step = 0; step < 9; step++) {
        const q = (low + high) / 2;
        const candidate = await canvasToBlob(canvas, 'image/webp', q);
        if (candidate.size <= targetBytes) {
          bestBlob = candidate;
          bestQuality = q;
          low = q + 0.02;
        } else {
          high = q - 0.02;
        }
      }

      if (!bestBlob) {
        bestBlob = await canvasToBlob(canvas, 'image/webp', 0.06);
        bestQuality = 0.06;
      }

      return {
        blob: bestBlob,
        width,
        height,
        format,
        qualityUsed: `WebP q=${Math.round(bestQuality * 100)}%`,
      };
    }

    if (format === 'png') {
      // PNG lossless / indexed compression to reach target weight
      const normalBlob = await canvasToBlob(canvas, 'image/png');
      if (normalBlob.size <= targetBytes) {
        return {
          blob: normalBlob,
          width,
          height,
          format,
          qualityUsed: 'PNG Standard',
        };
      }

      // Quantization search
      const levelsToTest = [64, 36, 24, 16, 12, 8];
      let bestBlob: Blob = normalBlob;
      let bestLevel = 64;

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
        format,
        qualityUsed: `PNG Palette (${bestLevel} цв.)`,
      };
    }

    // Default fallback
    const fallbackBlob = await canvasToBlob(canvas, file.type || 'image/jpeg', 0.8);
    return {
      blob: fallbackBlob,
      width,
      height,
      format: 'other',
      qualityUsed: 'Auto',
    };
  };

  // Process files sequentially
  const processFilesBatch = async (
    filesList: { file: File; relativePath: string }[]
  ) => {
    if (!filesList.length) return;

    setIsProcessing(true);
    setProgressCount(0);

    const initialItems: ProcessedFileItem[] = filesList.map(({ file, relativePath }) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: file.name,
      relativePath: relativePath || file.name,
      originalSize: file.size,
      width: 0,
      height: 0,
      format: detectFormat(file),
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
        const result = await compressToTargetWeight(file);
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
          addLog(`${file.name}: ✓ Вес в норме (${formatBytes(after)} ≤ ${targetSizeKB} КБ) — без сжатия`);
        } else {
          addLog(
            `${file.name} [${result.format.toUpperCase()}]: ${formatBytes(before)} → ${formatBytes(after)} · -${saved}% (${result.qualityUsed})`
          );
        }
      } catch (err: any) {
        console.error('Ошибка сжатия:', file.name, err);
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

  // Recursive folder reader for Drag & Drop
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
        addLog(`Загружено ${allFiles.length} изображений (целевой вес: ${targetSizeKB} КБ)...`);
        await processFilesBatch(allFiles);
      }
    } catch (err) {
      console.error(err);
      addLog('Ошибка при чтении папки или файлов');
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
      addLog(`Выбрана папка (${files.length} файлов со структурой подпапок)...`);
      await processFilesBatch(files);
    }
  };

  // ZIP packaging keeping exact original filename, extension, and folders
  const handleDownloadZip = async () => {
    const readyItems = items.filter((it) => it.status === 'done' && it.convertedBlob);
    if (!readyItems.length) return;

    setIsZipping(true);
    addLog('Формирование ZIP архива со сжатыми файлами...');

    try {
      const zip = new JSZip();

      readyItems.forEach((item) => {
        // Keeps original file name and extension exactly!
        const savePath = preserveFolderStructure ? item.relativePath : item.name;
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
      a.download = `compressed-images-${targetSizeKB}kb-${Date.now()}.zip`;
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

  // Totals calculations
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
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#24242e]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-(--accent)/20 text-[#bd5aff] border border-(--accent)/40">
              Сжатие по целевому весу
            </span>
            <span className="text-[10px] font-mono text-[#00ff9d] flex items-center gap-1">
              <ShieldCheck size={12} />
              Без смены формата (JPG остаётся JPG, PNG остаётся PNG)
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-sans text-white tracking-tight">
            Сжиматель изображений (папкой или файлами)
          </h2>
          <p className="text-xs text-[#8c8c9a] mt-1 max-w-2xl leading-relaxed">
            Вы можете загрузить изображения <strong>как целой папкой со структурой каталогов</strong>, так и <strong>отдельными файлами</strong>. Формат файлов сохраняется неизменным, а алгоритм автоматически оптимизирует каждое изображение до выбранного вами целевого веса.
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

      {/* Target Weight & Settings Panel */}
      <div className="border border-[#282836] bg-[#08080d] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#1c1c26]">
          <div>
            <div className="text-xs font-mono text-white font-bold uppercase tracking-wider flex items-center gap-2">
              <HardDrive size={15} className="text-[#bd5aff]" />
              Желаемый целевой вес файлов:
            </div>
            <p className="text-[11px] text-[#787888] font-mono mt-0.5">
              Файлы сожмутся до выбранного лимита. Если файл уже меньше лимита, он останется нетронутым.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#00ff9d] font-bold">
              Текущий лимит: ≤ {targetSizeKB >= 1024 ? `${(targetSizeKB / 1024).toFixed(1)} МБ` : `${targetSizeKB} КБ`}
            </span>
          </div>
        </div>

        {/* Presets and Custom Input */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* Preset Buttons */}
          <div>
            <label className="text-[11px] font-mono text-[#888896] block mb-2">
              Быстрый выбор целевого веса:
            </label>
            <div className="flex flex-wrap gap-1.5 font-mono text-xs">
              {[
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
                      ? 'border-[#8a00ff] bg-[#8a00ff] text-white shadow-sm'
                      : 'border-[#262634] bg-[#0c0c14] text-[#888894] hover:text-white hover:border-[#38384a]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Weight Input */}
          <div className="bg-[#050508] border border-[#20202c] p-3 space-y-2">
            <label className="text-[11px] font-mono text-[#888896] flex items-center justify-between">
              <span>Свой целевой размер:</span>
              <span className="text-[#bd5aff] font-bold">
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
                className="w-32 bg-[#0c0c14] border border-[#38384a] px-3 py-1.5 text-white font-mono text-xs font-bold focus:border-[#8a00ff] outline-none"
              />

              <div className="flex border border-[#38384a] bg-[#0c0c14] text-xs font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setSizeUnit('KB');
                    handleCustomWeightChange(customInputValue, 'KB');
                  }}
                  className={`px-2.5 py-1.5 transition-colors cursor-pointer ${
                    sizeUnit === 'KB'
                      ? 'bg-[#8a00ff] text-white font-bold'
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
                      ? 'bg-[#8a00ff] text-white font-bold'
                      : 'text-[#888] hover:text-white'
                  }`}
                >
                  МБ
                </button>
              </div>

              <span className="text-[10px] font-mono text-[#777] hidden sm:inline">
                (макс. размер на 1 фото)
              </span>
            </div>
          </div>
        </div>

        {/* Informational banner: original format preserved */}
        <div className="p-3 bg-[#0d0d16] border border-[#20202e] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-start sm:items-center gap-2.5 text-[#a2a2b0]">
            <Info size={16} className="text-[#bd5aff] shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong>Форматы не меняются:</strong> JPG сжимается в JPG, PNG остаётся PNG, WebP остаётся WebP. 100% сохранение оригинального разрешения.
            </span>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none text-white shrink-0">
            <input
              type="checkbox"
              checked={preserveFolderStructure}
              onChange={(e) => setPreserveFolderStructure(e.target.checked)}
              className="w-4 h-4 accent-[#8a00ff] cursor-pointer"
            />
            <span className="text-[11px] text-[#00ff9d] font-bold flex items-center gap-1">
              <FolderTree size={13} />
              Сохранять структуру папок в ZIP
            </span>
          </label>
        </div>
      </div>

      {/* Upload Drop Zone & Explicit Pickers */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed p-8 text-center transition-all duration-200 relative overflow-hidden group ${
          isDragOver
            ? 'border-[#8a00ff] bg-(--accent)/10 scale-[1.005]'
            : 'border-[#282836] bg-[#08080d] hover:border-(--accent)/60 hover:bg-[#0c0c14]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
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
          <div className="w-14 h-14 rounded-full bg-[#12121c] border border-[#2c2c3c] flex items-center justify-center text-[#bd5aff] group-hover:scale-110 group-hover:border-[#8a00ff] transition-all">
            <UploadCloud size={28} />
          </div>

          <div>
            <div className="text-base font-bold text-white mb-1">
              Загрузите изображения папкой или отдельными файлами
            </div>
            <div className="text-xs font-mono text-[#8a8a9a] max-w-lg mx-auto">
              Перетащите сюда целую папку с подпапками или выберите файлы. Допустимы форматы JPG, PNG, WebP.
            </div>
          </div>

          {/* Action buttons inside upload zone */}
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
              Загрузить отдельными файлами
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
                  <RefreshCw size={13} className="animate-spin text-[#bd5aff]" />
                  Сжатие по весу (≤ {targetSizeKB} КБ): {progressCount} / {items.length}
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} className="text-[#00ff9d]" />
                  Сжатие завершено!
                </>
              )}
            </span>
            <span className="text-[#00ff9d] font-bold">
              {items.length > 0 ? Math.round((progressCount / items.length) * 100) : 0}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full bg-[#14141c] overflow-hidden rounded-full border border-[#222230]">
            <div
              className="h-full bg-gradient-to-r from-[#8a00ff] to-[#00ff9d] transition-all duration-200"
              style={{
                width: `${items.length > 0 ? Math.min(100, Math.round((progressCount / items.length) * 100)) : 0}%`,
              }}
            />
          </div>

          {/* Log Window */}
          <div
            ref={logContainerRef}
            className="h-28 overflow-y-auto bg-[#040407] border border-[#1a1a24] p-2.5 space-y-1 text-[11px] text-[#8e8e9c]"
          >
            {logs.map((logLine, idx) => (
              <div key={idx} className="whitespace-nowrap font-mono">
                <span className="text-[#bd5aff] mr-1.5">&gt;</span>
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
                <span className="text-[#00e5ff] font-bold">{formatBytes(totalConvertedBytes)}</span>
              </div>
              <div className="h-6 w-px bg-[#20202c]" />
              <div>
                <span className="text-[10px] text-[#6c6c78] block">ЭКОНОМИЯ:</span>
                <span className={`font-bold ${totalSavedPct > 0 ? 'text-[#00ff9d]' : 'text-white'}`}>
                  {totalSavedPct > 0 ? `-${totalSavedPct}% (${formatBytes(totalSavedBytes)})` : '0%'}
                </span>
              </div>
            </div>

            {/* ZIP Download Button */}
            <button
              onClick={handleDownloadZip}
              disabled={isZipping || isProcessing || items.every((it) => it.status !== 'done')}
              className="w-full md:w-auto px-6 py-2.5 bg-[#8a00ff] hover:bg-[#9d1aff] disabled:bg-[#333] text-white font-mono text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Archive size={15} />
              {isZipping ? 'Упаковка ZIP...' : 'СКАЧАТЬ ZIP АРХИВ'}
            </button>
          </div>

          {/* Files List */}
          <div className="border border-[#22222e] bg-[#08080c] divide-y divide-[#181822] max-h-[380px] overflow-y-auto">
            {items.map((item) => {
              const savings =
                item.originalSize > 0 && item.convertedSize > 0
                  ? Math.round(((item.originalSize - item.convertedSize) / item.originalSize) * 100)
                  : 0;

              return (
                <div
                  key={item.id}
                  className="p-3 flex items-center justify-between gap-3 text-xs font-mono hover:bg-[#0c0c14] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 bg-[#040407] border border-[#20202c] shrink-0 flex items-center justify-center overflow-hidden">
                      {item.convertedUrl ? (
                        <img
                          src={item.convertedUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileImage size={18} className="text-[#444]" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-white font-bold truncate max-w-[240px] sm:max-w-[380px]"
                          title={preserveFolderStructure ? item.relativePath : item.name}
                        >
                          {preserveFolderStructure ? item.relativePath : item.name}
                        </span>
                        <span className="text-[9px] uppercase px-1.5 py-0.2 border border-[#333] bg-[#14141c] text-[#a0a0b0]">
                          {item.format}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#70707e] flex items-center gap-2 mt-0.5">
                        {item.width > 0 && (
                          <span className="text-[#8a00ff]">
                            {item.width}×{item.height} px
                          </span>
                        )}
                        <span>· Было: {formatBytes(item.originalSize)}</span>
                        {item.qualityUsed && (
                          <span className="text-[#bd5aff]">[{item.qualityUsed}]</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      {item.status === 'processing' && (
                        <span className="text-[#ffd000] text-[11px] animate-pulse">Сжатие...</span>
                      )}
                      {item.status === 'done' && (
                        <div>
                          <div className="text-[#00e5ff] font-bold">
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
                      <a
                        href={item.convertedUrl}
                        download={item.name}
                        title={`Скачать ${item.name}`}
                        className="p-1.5 border border-[#242432] bg-[#0c0c14] text-[#cfcfd8] hover:text-white hover:border-[#8a00ff] transition-colors cursor-pointer"
                      >
                        <Download size={13} />
                      </a>
                    )}
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
