mod compile;
mod error;
use crate::compile::compile_source;
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub fn compile(source: &str) -> Result<Vec<u8>, JsValue> {
    Ok(compile_source(source)?)
}
