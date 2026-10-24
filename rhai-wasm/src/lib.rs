mod compile;
mod error;
use crate::compile::{compile_grain_byte_code, compile_rhai};
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub fn compile_grain(source: &str) -> Result<Vec<u8>, JsValue> {
    Ok(compile_grain_byte_code(source)?)
}

#[wasm_bindgen]
pub fn compile(source: &str) -> Vec<JsValue> {
    compile_rhai(source)
        .into_iter()
        .map(JsValue::from)
        .collect()
}
