import type { InitInput } from '../pkg/gifski_wasm.js';
import { encode as gifskiEncode } from '../pkg/gifski_wasm.js';
export declare function init(moduleOrPath?: InitInput): Promise<import("../pkg/gifski_wasm.js").InitOutput>;
type Frames = Array<Uint8Array | ImageData>;
type BaseEncodeOptions = {
    frames: Frames | Array<{
        imageData: Uint8Array | ImageData;
        duration: number;
    }>;
    width: number;
    height: number;
    quality?: number;
    repeat?: number;
    resizeWidth?: number;
    resizeHeight?: number;
};
export type EncodeOptions = (BaseEncodeOptions & {
    fps: number;
    frameDurations?: never;
}) | (BaseEncodeOptions & {
    fps?: never;
    frameDurations: Array<number> | Uint32Array;
});
export declare function _internal_encode(wasmEncodeFn: typeof gifskiEncode, { frames, width, height, fps, frameDurations, quality, repeat, resizeWidth, resizeHeight, }: EncodeOptions): Promise<Uint8Array>;
export declare function encode(options: EncodeOptions): Promise<Uint8Array>;
export default encode;
//# sourceMappingURL=encode.d.ts.map