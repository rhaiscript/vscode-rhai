mod error;
mod compile;
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::wasm_bindgen;
use crate::compile::compile_source;



#[wasm_bindgen]
pub fn compile(source: &str) -> Result<Vec<u8>, JsValue> {
    Ok(compile_source(source)?)
}

