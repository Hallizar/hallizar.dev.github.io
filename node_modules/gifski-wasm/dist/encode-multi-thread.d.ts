import type { InitInput } from '../pkg/gifski_wasm.js';
import { EncodeOptions } from './encode';
declare function initMT(moduleOrPath?: InitInput): Promise<{
    encode: typeof import("../pkg-parallel/gifski_wasm.js").encode;
}>;
declare function initST(moduleOrPath?: InitInput): Promise<{
    encode: typeof import("../pkg/gifski_wasm.js").encode;
}>;
export declare function init(moduleOrPath?: InitInput): Promise<ReturnType<typeof initMT | typeof initST>>;
export declare function encode(options: EncodeOptions): Promise<Uint8Array>;
export default encode;
//# sourceMappingURL=encode-multi-thread.d.ts.map