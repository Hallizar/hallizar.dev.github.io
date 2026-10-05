import { __wbg_set_wasm, Imagequant, ImagequantImage } from 'imagequant/imagequant_bg.js';
import wasmUrl from 'imagequant/imagequant_bg.wasm?url';

let isReady = false;
let initPromise: Promise<void> | null = null;

export async function initImagequant(): Promise<void> {
  if (isReady) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const response = await fetch(wasmUrl);
      const wasmBytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(wasmBytes, {});
      __wbg_set_wasm(instance.exports);
      isReady = true;
    } catch (err) {
      console.warn('[imagequant-wasm] Failed to initialize WASM quantizer:', err);
      throw err;
    }
  })();

  return initPromise;
}

/**
 * Квантование и оптимизация PNG через WebAssembly libimagequant (valterkraemer/imagequant-wasm).
 * @param rgbaPixels Uint8ClampedArray пикселей RGBA
 * @param width ширина изображения
 * @param height высота изображения
 * @param minQuality минимальное качество (0-100)
 * @param targetQuality целевое качество (0-100)
 * @param maxColors максимальное количество цветов в палитре (8-256)
 */
export async function quantizePng(
  rgbaPixels: Uint8ClampedArray,
  width: number,
  height: number,
  minQuality: number = 0,
  targetQuality: number = 75,
  maxColors: number = 256,
): Promise<Uint8Array> {
  await initImagequant();

  const uint8Data = new Uint8Array(rgbaPixels.buffer, rgbaPixels.byteOffset, rgbaPixels.byteLength);
  const image = new ImagequantImage(uint8Data, width, height, 0.0);
  const quant = new Imagequant();

  quant.set_quality(Math.max(0, Math.min(100, minQuality)), Math.max(1, Math.min(100, targetQuality)));
  quant.set_max_colors(Math.max(8, Math.min(256, maxColors)));
  quant.set_speed(4);

  const pngBytes = quant.process(image);
  image.free();
  quant.free();

  return pngBytes;
}
