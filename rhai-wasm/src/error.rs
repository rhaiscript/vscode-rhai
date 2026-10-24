use rhai::{ParseError, Position};
use wasm_bindgen::JsValue;

#[derive(Debug)]
pub(crate) struct RhaiError {
    error_message: String,
    line: Option<usize>,
    column: Option<usize>,
    end_line: Option<usize>,
    end_column: Option<usize>,
}

impl RhaiError {
    pub fn new(error_message: String, line: Option<usize>, column: Option<usize>) -> Self {
        RhaiError {
            error_message,
            line,
            column,
            end_line: None,
            end_column: None,
        }
    }

    pub fn current_token_len(
        source: &str,
        start_pos: Position,
        next_pos: Position,
    ) -> Option<usize> {
        // one based
        let start_line = start_pos.line()? - 1;
        let start_col = start_pos.position()? - 1;

        let line_text = source.lines().nth(start_line)?;
        let line_char_len = line_text.chars().count();

        let stop_col = match (next_pos.line(), next_pos.position()) {
            (None, _) | (_, None) => return None,
            (Some(next_line_number), Some(next_column)) if next_line_number - 1 == start_line => {
                (next_column - 1).min(line_char_len)
            }
            _ => line_char_len,
        };

        let current_token_text: String = line_text
            .chars()
            .skip(start_col)
            .take(stop_col.saturating_sub(start_col))
            .collect();

        let current_token_len = current_token_text.trim_end().chars().count().max(1);

        Some(start_col + current_token_len + 1)
    }

    pub fn set_end_position(&mut self, end_line: Option<usize>, end_column: Option<usize>) {
        self.end_line = end_line;
        self.end_column = end_column;
    }
}

impl From<ParseError> for RhaiError {
    fn from(err: ParseError) -> Self {
        RhaiError {
            error_message: err.err_type().to_string(),
            line: err.position().line(),
            column: err.position().position(),
            end_line: None,
            end_column: None,
        }
    }
}

impl From<RhaiError> for JsValue {
    fn from(err: RhaiError) -> Self {
        let js_err = js_sys::Error::new(&err.error_message);
        js_err.set_name("RhaiError");

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
    use super::RhaiError;
    use rhai::Engine;

    fn parse_error(source: &str) -> RhaiError {
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
