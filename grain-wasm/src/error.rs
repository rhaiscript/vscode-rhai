use rhai::ParseError;
use wasm_bindgen::JsValue;

#[derive(Debug)]
pub(crate) struct GrainError {
    error_message: String,
    line: Option<usize>,
    column: Option<usize>,
}

impl GrainError {
    pub fn new(error_message: String, line: Option<usize>, column: Option<usize>) -> Self {
        GrainError {
            error_message,
            line,
            column,
        }
    }
}

impl From<ParseError> for GrainError {
    fn from(err: ParseError) -> Self {
        GrainError {
            error_message: err.err_type().to_string(),
            line: err.position().line(),
            column: err.position().position(),
        }
    }
}

impl From<GrainError> for JsValue {
    fn from(err: GrainError) -> Self {
        let js_err = js_sys::Error::new(&err.error_message);
        js_err.set_name("GrainError");

        for (key, value) in [("line", err.line), ("column", err.column)] {
            if let Some(n) = value {
                let _ = js_sys::Reflect::set(&js_err, &key.into(), &n.into());
            }
        }

        js_err.into()
    }
}

#[cfg(test)]
mod tests {
    use super::GrainError;
    use rhai::Engine;

    fn parse_error(source: &str) -> GrainError {
        Engine::new().compile(source).unwrap_err().into()
    }

    #[test]
    fn reports_line_and_column() {
        let err = parse_error("let a = 1;\nlet = 2;");

        assert_eq!(err.line, Some(2));
        assert_eq!(err.column, Some(5));
    }

    #[test]
    fn reports_first_line() {
        let err = parse_error("let = 1;");

        assert_eq!(err.line, Some(1));
    }

    /// The position travels in `line`/`column`; repeating it in the message
    /// would show twice in an editor diagnostic.
    #[test]
    fn message_omits_position() {
        let err = parse_error("let a = 1;\nlet = 2;");

        assert!(!err.error_message.is_empty());
        assert!(
            !err.error_message.contains("line"),
            "position duplicated in message: {}",
            err.error_message
        );
    }
}
