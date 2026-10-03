// @ts-ignore
import fs from 'node:fs/promises';
import { encode as _encode, init as _init } from './encode.js';
let module;
async function importWasmModule(path) {
    const fileBuffer = await fs.readFile(path);
    return WebAssembly.compile(fileBuffer);
}
export async function init() {
    if (!module) {
        module = await importWasmModule('../pkg/gifski_wasm_bg.wasm');
    }
    return _init(module);
}
export async function encode(options) {
    await init();
    return _encode(options);
}
export default encode;
