use rhai::{LexError, ParseError, ParseErrorType, Position, Token, TokenIterator, TokenizerControl};
use wasm_bindgen::JsValue;

/// Identify and lexing the tokens
pub(crate) fn lexing_tokens_position(source: &str,tokens:&mut Vec<(Position, Position)>, errors: &mut Vec<RhaiError>,stream: TokenIterator, tc: TokenizerControl) {
    let mut pending_error: Option<(Box<LexError>, Position)> = None;
    let mut interpolations: Vec<usize> = Vec::new();

    for (token, pos) in stream {
        if let Some((err, prev_pos)) = pending_error.take() {
            let mut rhai_err =
                RhaiError::new(err.to_string(), prev_pos.line(), prev_pos.position());
            if let Some(end_col) = RhaiError::current_token_len(source, prev_pos, pos) {
                rhai_err.set_end_position(prev_pos.line(), Some(end_col));
            }
            errors.push(rhai_err);
        }
        tokens.push((pos, tc.borrow().last_token_end));

        match token {
            Token::EOF => break,
            Token::LexError(err) => {
                pending_error = Some((err, pos));
            }
            Token::InterpolatedString(_) => interpolations.push(0),
            Token::LeftBrace | Token::MapStart => {
                if let Some(depth) = interpolations.last_mut() {
                    *depth += 1;
                }
            }
            Token::RightBrace => {
                if let Some(depth) = interpolations.last_mut() {
                    *depth = depth.saturating_sub(1);
                    if *depth == 0 {
                        interpolations.pop();
                        tc.borrow_mut().is_within_text = true;
                    }
                }
            }
            _ => {}
        }
    }
}

/// Identify and locate the grammar error token position for squiggly line
/// `engine.compile` only return the first grammar error.
pub(crate) fn grammar_error(
    tokens: &[(Position, Position)],
    errors: &mut Vec<RhaiError>,
    compile_error: ParseError,
) {
    if !errors.is_empty() {
        return;
    }
    let is_missing = matches!(
        compile_error.err_type(),
        ParseErrorType::MissingToken(..)
            | ParseErrorType::MissingSymbol(..)
            | ParseErrorType::ExprExpected(..)
            | ParseErrorType::FnMissingParams(..)
            | ParseErrorType::FnMissingBody(..)
            | ParseErrorType::UnexpectedEOF
            | ParseErrorType::PropertyExpected
            | ParseErrorType::VariableExpected
            | ParseErrorType::FnMissingName
    );

    let error_pos = compile_error.position();
    let token = if is_missing {
        tokens.iter().find(|(_, end)| *end == error_pos)
    } else {
        tokens.iter().find(|(start, _)| *start == error_pos)
    };
    let mut rhai_err: RhaiError = compile_error.into();

    if let Some((start, end)) = token {
        rhai_err.set_start_position(start.line(), start.position());
        rhai_err.set_end_position(end.line(), end.position());
    }
    errors.push(rhai_err);
}

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

    pub fn set_start_position(&mut self, line: Option<usize>, column: Option<usize>) {
        self.line = line;
        self.column = column;
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

        for (key, value) in [
            ("line", err.line),
            ("column", err.column),
            ("end_line", err.end_line),
            ("end_column", err.end_column),
        ] {
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
        assert_eq!(err.column, Some(4));
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
