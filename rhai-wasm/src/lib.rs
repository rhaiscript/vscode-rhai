mod compile;
mod error;
use crate::compile::{compile_grain_byte_code, compile_rhai};
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub fn compile_grain(source: &str) -> Result<Vec<u8>, js_sys::Array> {
    compile_grain_byte_code(source)
        .map_err(|errs| errs.into_iter().map(JsValue::from).collect())
}

#[wasm_bindgen]
pub fn compile(source: &str) -> Vec<JsValue> {
    compile_rhai(source)
        .into_iter()
        .map(JsValue::from)
        .collect()
}
