import { encode as _encode, init } from './encode';
import GIFSKI_WASM from '../pkg/gifski_wasm_bg.wasm';
export async function encode(options) {
    await init(GIFSKI_WASM);
    return _encode(options);
}
export default encode;
