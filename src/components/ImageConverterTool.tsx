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
  Sparkles,
  Zap,
} from 'lucide-react';
import JSZip from 'jszip';

type SelectedFormat = 'webp' | 'jpeg' | 'png';
type PngPreset = 'medium' | 'maximum';

interface ProcessedFileItem {
  id: string;
  name: string;
  relativePath: string;
  originalSize: number;
  width: number;
  height: number;
  convertedBlob: Blob | null;
  convertedUrl: string | null;
  convertedSize: number;
  qualityUsed: number | string;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMsg?: string;
  unchanged?: boolean;
}

export function ImageConverterTool() {
  const [items, setItems] = useState<ProcessedFileItem[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<SelectedFormat>('webp');
  
  // Format specific settings
  const [pngPreset, setPngPreset] = useState<PngPreset>('medium');
  const [jpegQuality, setJpegQuality] = useState<number>(80);
  const [webpQuality, setWebpQuality] = useState<number>(82);

  // Folder structure & target size settings
  const [preserveFolderStructure, setPreserveFolderStructure] = useState<boolean>(false);
  const [targetSizeKB, setTargetSizeKB] = useState<number>(500);

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
    }, 50);
  };

  // Helper to load HTMLImageElement
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

  // Helper canvas to blob
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

  // Palette color quantization for PNG "Максимально возможное" preset
  const quantizeCanvasForMaxPng = (canvas: HTMLCanvasElement, levels: number = 24) => {
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
      else if (data[i + 3] < 15) data[i + 3] = 0;
    }
    ctx.putImageData(imgData, 0, 0);
  };

  // Compression worker without resizing pixel geometry (100% original width x height)
  const compressSingleImage = async (
    file: File
  ): Promise<{
    blob: Blob;
    width: number;
    height: number;
    qualityUsed: number | string;
    unchanged?: boolean;
  }> => {
    const img = await loadImage(file);
    const width = img.naturalWidth;
    const height = img.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context error');
    ctx.drawImage(img, 0, 0, width, height);

    // MODE 1: FOLDER STRUCTURE WITH TARGET WEIGHT (включён режим сохранения структуры папок)
    if (preserveFolderStructure) {
      const targetBytes = targetSizeKB * 1024;

      // If file already meets target weight, keep it as is
      if (file.size <= targetBytes) {
        return {
          blob: file,
          width,
          height,
          qualityUsed: 'Target OK',
          unchanged: true,
        };
      }

      // Check format: WebP or JPEG binary search
      let targetMime = 'image/jpeg';
      if (selectedFormat === 'webp') targetMime = 'image/webp';
      else if (selectedFormat === 'png') {
        // For PNG, try quantization first
        quantizeCanvasForMaxPng(canvas, 16);
        const pngBlob = await canvasToBlob(canvas, 'image/png');
        return {
          blob: pngBlob,
          width,
          height,
          qualityUsed: 'PNG Max',
        };
      }

      let low = 0.05;
      let high = 0.98;
      let bestBlob: Blob | null = null;
      let bestQuality = 0.8;

      for (let step = 0; step < 9; step++) {
        const q = (low + high) / 2;
        const candidate = await canvasToBlob(canvas, targetMime, q);
        if (candidate.size <= targetBytes) {
          bestBlob = candidate;
          bestQuality = q;
          low = q + 0.02;
        } else {
          high = q - 0.02;
        }
      }

      if (!bestBlob) {
        bestBlob = await canvasToBlob(canvas, targetMime, 0.05);
        bestQuality = 0.05;
      }

      return {
        blob: bestBlob,
        width,
        height,
        qualityUsed: `${Math.round(bestQuality * 100)}%`,
      };
    }

    // MODE 2: STANDARD FORMAT-SPECIFIC MODES (без таргетного размера)
    // 2A. PNG: 2 пресета — "среднее" и "максимально возможное"
    if (selectedFormat === 'png') {
      if (pngPreset === 'maximum') {
        quantizeCanvasForMaxPng(canvas, 24);
        const blob = await canvasToBlob(canvas, 'image/png');
        return {
          blob,
          width,
          height,
          qualityUsed: 'Максимум',
        };
      } else {
        // "Среднее" пресет — стандартное 32-bit PNG сжатие
        const blob = await canvasToBlob(canvas, 'image/png');
        return {
          blob,
          width,
          height,
          qualityUsed: 'Среднее',
        };
      }
    }

    // 2B. JPEG: ползунок с выбором качества
    if (selectedFormat === 'jpeg') {
      const q = Math.max(0.1, Math.min(1.0, jpegQuality / 100));
      const blob = await canvasToBlob(canvas, 'image/jpeg', q);
      return {
        blob,
        width,
        height,
        qualityUsed: `${jpegQuality}%`,
      };
    }

    // 2C. WebP: как было раньше (ползунок качества)
    const q = Math.max(0.1, Math.min(1.0, webpQuality / 100));
    const blob = await canvasToBlob(canvas, 'image/webp', q);
    return {
      blob,
      width,
      height,
      qualityUsed: `${webpQuality}%`,
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
        const result = await compressSingleImage(file);
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
        const resText = result.width ? ` (${result.width}×${result.height} px, 100% без ресайза)` : '';

        if (result.unchanged) {
          addLog(`${file.name}: OK · ${formatBytes(after)} (уже соответствует цели)`);
        } else {
          addLog(
            `${file.name}: ${formatBytes(before)} → ${formatBytes(after)} · -${saved}%${resText}`
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

      // If a directory was dropped, automatically enable folder structure mode
      if (hasDirectory && !preserveFolderStructure) {
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
        addLog(`Загружено ${allFiles.length} файлов...`);
        await processFilesBatch(allFiles);
      }
    } catch (err) {
      console.error(err);
      addLog('Ошибка при чтении папки / файлов');
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files)
      .filter((f) => /\.(jpe?g|png|webp|svg|gif|avif)$/i.test(f.name))
      .map((f) => ({ file: f, relativePath: f.name }));

    e.target.value = '';
    if (files.length) {
      addLog(`Выбрано ${files.length} файлов...`);
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
      addLog(`Выбрана папка (${files.length} файлов) со структурой...`);
      await processFilesBatch(files);
    }
  };

  // ZIP packaging
  const handleDownloadZip = async () => {
    const readyItems = items.filter((it) => it.status === 'done' && it.convertedBlob);
    if (!readyItems.length) return;

    setIsZipping(true);
    addLog('Формирование ZIP архива...');

    try {
      const zip = new JSZip();

      readyItems.forEach((item) => {
        let savePath = preserveFolderStructure ? item.relativePath : item.name;

        // Apply correct extension based on chosen format
        if (selectedFormat === 'webp') {
          savePath = savePath.replace(/\.[^.]+$/, '.webp');
        } else if (selectedFormat === 'jpeg') {
          savePath = savePath.replace(/\.[^.]+$/, '.jpg');
        } else if (selectedFormat === 'png') {
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
      a.download = `hallizar-compressed-${selectedFormat}-${Date.now()}.zip`;
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
          <h2 className="text-xl sm:text-2xl font-bold font-sans text-white tracking-tight">
            Оптимизатор изображений (без изменения разрешения)
          </h2>
          <p className="text-xs text-[#8c8c9a] mt-1 max-w-2xl leading-relaxed">
            Настраиваемое сжатие для PNG (2 пресета), JPEG/JPG (ползунок качества), WebP (как было раньше). Сохранение структуры папок с желаемым целевым размером (КБ) при пакетной выгрузке в ZIP.
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

      {/* Control Box: Format Choice & Mode */}
      <div className="border border-[#282836] bg-[#08080d] p-4 sm:p-5 space-y-4">
        {/* Format Selector Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1c1c26]">
          <div className="text-xs font-mono text-[#bd5aff] font-bold uppercase tracking-wider flex items-center gap-2">
            <Sliders size={14} /> Выберите формат сжатия:
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-mono">
            <button
              type="button"
              onClick={() => setSelectedFormat('webp')}
              className={`px-3 py-1.5 border transition-all cursor-pointer font-bold ${
                selectedFormat === 'webp'
                  ? 'border-[#8B03FD] bg-[#8B03FD] text-white'
                  : 'border-[#282838] bg-[#0c0c14] text-[#80808e] hover:text-white'
              }`}
            >
              WebP (Как раньше)
            </button>

            <button
              type="button"
              onClick={() => setSelectedFormat('jpeg')}
              className={`px-3 py-1.5 border transition-all cursor-pointer font-bold ${
                selectedFormat === 'jpeg'
                  ? 'border-[#8B03FD] bg-[#8B03FD] text-white'
                  : 'border-[#282838] bg-[#0c0c14] text-[#80808e] hover:text-white'
              }`}
            >
              JPEG / JPG
            </button>

            <button
              type="button"
              onClick={() => setSelectedFormat('png')}
              className={`px-3 py-1.5 border transition-all cursor-pointer font-bold ${
                selectedFormat === 'png'
                  ? 'border-[#8B03FD] bg-[#8B03FD] text-white'
                  : 'border-[#282838] bg-[#0c0c14] text-[#80808e] hover:text-white'
              }`}
            >
              PNG (2 пресета)
            </button>
          </div>
        </div>

        {/* Dynamic Controls based on Format & Folder Structure Mode */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono items-center">
          {/* LEFT: Format Specific Setting */}
          <div className="space-y-2">
            {/* 1. PNG: 2 Пресета (Среднее и Максимально возможное) */}
            {selectedFormat === 'png' && (
              <div className="space-y-2">
                <label className="text-[#9999a6] block text-[11px] uppercase tracking-wider">
                  Пресет сжатия PNG:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPngPreset('medium')}
                    className={`p-2.5 border text-center font-bold cursor-pointer transition-colors ${
                      pngPreset === 'medium'
                        ? 'border-[#8B03FD] bg-[#8B03FD]/20 text-white'
                        : 'border-[#242434] bg-[#0c0c14] text-[#80808e] hover:text-white'
                    }`}
                  >
                    <div className="text-white text-xs">Среднее сжатие</div>
                    <div className="text-[10px] text-[#777] font-normal mt-0.5">
                      Стандартное 32-bit (без потерь)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPngPreset('maximum')}
                    className={`p-2.5 border text-center font-bold cursor-pointer transition-colors ${
                      pngPreset === 'maximum'
                        ? 'border-[#00ff9d] bg-[#00ff9d]/15 text-[#00ff9d]'
                        : 'border-[#242434] bg-[#0c0c14] text-[#80808e] hover:text-white'
                    }`}
                  >
                    <div className="text-xs">Максимально возможное</div>
                    <div className="text-[10px] text-[#777] font-normal mt-0.5">
                      Квантование палитры 8-bit (-50% веса)
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* 2. JPEG: Ползунок с выбором качества */}
            {selectedFormat === 'jpeg' && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-white text-[11px]">Качество JPEG / JPG:</span>
                  <span className="text-[#bd5aff] font-bold text-sm">{jpegQuality}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={jpegQuality}
                  onChange={(e) => setJpegQuality(Number(e.target.value))}
                  className="w-full accent-[#8B03FD] cursor-pointer"
                />
                <span className="text-[10px] text-[#666] block">
                  100% сохранение оригинального разрешения кадра (без ресайза)
                </span>
              </div>
            )}

            {/* 3. WebP: Ползунок качества (как было раньше) */}
            {selectedFormat === 'webp' && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-white text-[11px]">Качество WebP:</span>
                  <span className="text-[#bd5aff] font-bold text-sm">{webpQuality}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={webpQuality}
                  onChange={(e) => setWebpQuality(Number(e.target.value))}
                  className="w-full accent-[#8B03FD] cursor-pointer"
                />
                <span className="text-[10px] text-[#666] block">
                  Современный алгоритм WebP для максимального сжатия при высокой четкости
                </span>
              </div>
            )}
          </div>

          {/* RIGHT: Folder Structure Toggle & Conditional Target Size */}
          <div className="space-y-3 bg-[#050508] border border-[#20202c] p-3.5">
            {/* Toggle Folder Structure */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preserveFolderStructure}
                onChange={(e) => setPreserveFolderStructure(e.target.checked)}
                className="w-4 h-4 accent-[#8B03FD] cursor-pointer"
              />
              <span className="text-xs text-white font-bold flex items-center gap-1.5">
                <FolderTree size={14} className="text-[#bd5aff]" />
                Сжимать с сохранением структуры папок
              </span>
            </label>

            {/* ONLY DISPLAYED WHEN FOLDER STRUCTURE IS SELECTED */}
            {preserveFolderStructure ? (
              <div className="space-y-2 pt-2 border-t border-[#1a1a24] animate-fadeIn">
                <label className="text-[#00ff9d] block text-[11px] font-bold uppercase tracking-wider">
                  Желаемый целевой размер файлов (КБ):
                </label>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="100000"
                    step="10"
                    value={targetSizeKB}
                    onChange={(e) => setTargetSizeKB(Math.max(10, Number(e.target.value)))}
                    className="w-28 bg-[#0c0c14] border border-[#38384a] px-2.5 py-1.5 text-white font-mono text-xs font-bold focus:border-[#8B03FD] outline-none"
                  />
                  <span className="text-[#00ff9d] font-bold text-xs">КБ</span>
                  <span className="text-[10px] text-[#777]">
                    (Файлы папки ужмутся до ≤ {targetSizeKB} КБ)
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {[100, 200, 300, 500, 1024].map((kb) => (
                    <button
                      key={kb}
                      type="button"
                      onClick={() => setTargetSizeKB(kb)}
                      className={`px-2 py-0.5 border text-[10px] font-mono cursor-pointer transition-colors ${
                        targetSizeKB === kb
                          ? 'border-[#00ff9d] bg-[#00ff9d]/20 text-white font-bold'
                          : 'border-[#222230] bg-[#0c0c14] text-[#787886] hover:text-white'
                      }`}
                    >
                      {kb >= 1024 ? `${kb / 1024} МБ` : `${kb} КБ`}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-[#666] leading-relaxed">
                Включите эту опцию, если хотите сжать целую папку с подпапками и упаковать её в ZIP до заданного целевого веса (КБ).
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Drop Zone & Pickers */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed p-8 text-center transition-all duration-200 relative overflow-hidden group ${
          isDragOver
            ? 'border-[#8B03FD] bg-[#8B03FD]/10 scale-[1.005]'
            : 'border-[#282836] bg-[#08080d] hover:border-[#8B03FD]/60 hover:bg-[#0c0c14]'
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
          <div className="w-14 h-14 rounded-full bg-[#12121c] border border-[#2c2c3c] flex items-center justify-center text-[#bd5aff] group-hover:scale-110 group-hover:border-[#8B03FD] transition-all">
            <UploadCloud size={28} />
          </div>

          <div>
            <div className="text-base font-bold text-white mb-1">
              Перенесите сюда файлы или целую папку с изображениями
            </div>
            <div className="text-xs font-mono text-[#787888]">
              PNG, JPG, WebP · Разрешение сохраняется 100% без уменьшения размеров
            </div>
          </div>

          {/* Action buttons inside upload zone */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2 font-mono text-xs">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                folderInputRef.current?.click();
              }}
              className="px-4 py-2 border border-[#3b3b4d] bg-[#12121a] hover:bg-[#8B03FD] hover:border-[#8B03FD] text-white transition-colors flex items-center gap-2 cursor-pointer font-bold"
            >
              <FolderOpen size={14} /> Выбрать папку целиком
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-4 py-2 border border-[#2c2c38] bg-[#0c0c14] hover:bg-[#1a1a24] text-[#cfcfd8] hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
            >
              <FileImage size={14} /> Выбрать отдельные файлы
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
                  Сжатие изображений: {progressCount} / {items.length}
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} className="text-[#00ff9d]" />
                  Обработка завершена!
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
              className="h-full bg-gradient-to-r from-[#8B03FD] to-[#00ff9d] transition-all duration-200"
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
              className="w-full md:w-auto px-6 py-2.5 bg-[#8B03FD] hover:bg-[#9d1aff] disabled:bg-[#333] text-white font-mono text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Archive size={15} />
              {isZipping ? 'Упаковка архива...' : 'СКАЧАТЬ ZIP АРХИВ'}
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
                      <div
                        className="text-white font-bold truncate max-w-[280px] sm:max-w-[420px]"
                        title={preserveFolderStructure ? item.relativePath : item.name}
                      >
                        {preserveFolderStructure ? item.relativePath : item.name}
                      </div>
                      <div className="text-[10px] text-[#70707e] flex items-center gap-2 mt-0.5">
                        {item.width > 0 && (
                          <span className="text-[#8B03FD]">
                            {item.width}×{item.height} px
                          </span>
                        )}
                        <span>· {formatBytes(item.originalSize)}</span>
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
                            {item.unchanged ? 'OK' : `-${savings}%`}
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
                        title="Скачать файл"
                        className="p-1.5 border border-[#242432] bg-[#0c0c14] text-[#cfcfd8] hover:text-white hover:border-[#8B03FD] transition-colors cursor-pointer"
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
