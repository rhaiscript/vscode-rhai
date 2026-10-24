use crate::error::RhaiError;
use rhai::grain::Compiler;
use rhai::{Engine, LexError, Position, Token};

pub(crate) fn compile_grain_byte_code(source: &str) -> Result<Vec<u8>, RhaiError> {
    let engine = Engine::new();
    let ast = engine.compile(source)?;
    let program = Compiler::new().compile(&ast);
    let buf = program
        .write()
        .map_err(|e| RhaiError::new(format!("failed to write program: {e}"), None, None))?;
    Ok(buf)
}

pub(crate) fn compile_rhai(source: &str) -> Vec<RhaiError> {
    let engine = Engine::new();
    let scripts = [source];
    let (stream, tc) = engine.lex(&scripts);
    let mut interpolations: Vec<usize> = Vec::new();
    let mut errors = Vec::new();
    let mut pending_error: Option<(Box<LexError>, Position)> = None;
    for (token, pos) in stream {
        if let Some((err, prev_pos)) = pending_error.take() {
            let mut rhai_err =
                RhaiError::new(err.to_string(), prev_pos.line(), prev_pos.position());
            if let Some(end_col) = RhaiError::current_token_len(source, prev_pos, pos) {
                rhai_err.set_end_position(prev_pos.line(), Some(end_col));
            }
            errors.push(rhai_err);
        }
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
    if errors.is_empty()
        && let Err(err) = engine.compile(source)
    {
        errors.push(err.into());
    }
    errors.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::{compile_grain_byte_code, compile_rhai};
    use crate::error::RhaiError;
    use rhai::Engine;
    use rhai::grain::{Program, Vm};
    use std::path::{Path, PathBuf};
    const KNOWN_GRAIN_FAILURES: &[(&str, &str)] = &[
        (
            "switch.rhai",
            "upstream bug: float switch label missing FLOAT caps (<link to your report>)",
        ),
        ("loop.rhai", "Grain cannot lower `export` yet"),
        ("module.rhai", "Grain cannot lower `import` yet"),
        (
            "function_decl3.rhai",
            "Grain cannot lower an expression yet",
        ),
        (
            "mat_mul.rhai",
            "exceeds rhai's debug-build expression depth limit",
        ),
    ];
    fn get_rhai_test_script() -> Vec<PathBuf> {
        let rhai_scripts_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test");
        let mut files = vec![];
        let paths = std::fs::read_dir(&rhai_scripts_path).unwrap();
        for path in paths {
            let path = path.unwrap().path();
            if path.is_file() && path.extension() == Some(std::ffi::OsStr::new("rhai")) {
                files.push(path);
            }
        }
        // `read_dir` order is platform-dependent; keep failure output stable.
        files.sort();
        assert!(
            !files.is_empty(),
            "no .rhai fixtures found in {}",
            rhai_scripts_path.display()
        );
        files
    }

    fn fixture_name(path: &Path) -> &str {
        path.file_name().unwrap().to_str().unwrap()
    }

    fn is_known_grain_failure(name: &str) -> bool {
        KNOWN_GRAIN_FAILURES.iter().any(|(known, _)| *known == name)
    }

    fn syntax_errors(source: &str) -> String {
        format!("{:?}", compile_rhai(source))
    }

    #[test]
    fn compiles_to_a_readable_program() {
        let bytes = compile_grain_byte_code("let x = 40; x + 2").unwrap();

        assert!(!bytes.is_empty());
        Program::read(&bytes).expect("written program reads back");
    }

    #[test]
    fn empty_script_compiles() {
        let bytes = compile_grain_byte_code("").unwrap();

        Program::read(&bytes).expect("empty program reads back");
    }

    #[test]
    fn syntax_error_is_rejected() {
        assert!(compile_grain_byte_code("let = ;").is_err());
    }

    /// The bytecode must mean the same as the script: run both and compare.
    #[test]
    fn bytecode_evaluates_like_the_script() {
        let engine = Engine::new();

        for source in [
            "40 + 2",
            "let total = 0; for i in 0..10 { total += i; } total",
            "fn fib(n) { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } } fib(6)",
            "let x = 3; switch x { 1 => 10, 3 => 30, _ => 0 }",
            "let a = [1, 2, 3]; a.push(4); a.len()",
            "let m = #{ a: 1, b: 2 }; m.a + m.b",
            r#"let s = "ab"; s += "cd"; s.len()"#,
            "let f = |x| x * 2; f.call(21)",
        ] {
            let expected = engine
                .eval::<i64>(source)
                .unwrap_or_else(|e| panic!("AST eval of `{source}`: {e}"));

            let bytes = compile_grain_byte_code(source)
                .unwrap_or_else(|e| panic!("compile `{source}`: {e:?}"));
            let program =
                Program::read(&bytes).unwrap_or_else(|e| panic!("read `{source}`: {e:?}"));
            let actual = Vm::new(&engine)
                .eval(&program)
                .unwrap_or_else(|e| panic!("VM eval of `{source}`: {e}"))
                .as_int()
                .unwrap_or_else(|t| panic!("VM eval of `{source}` returned {t}, not an integer"));

            assert_eq!(actual, expected, "`{source}`");
        }
    }
    fn compare_and_read(path: &Path) -> Result<(), String> {
        let source = std::fs::read_to_string(path).unwrap();
        compile_grain_byte_code(&source)
            .map_err(|e| format!("compile: {e:?}"))
            .and_then(|bytes| {
                Program::read(&bytes)
                    .map(|_| ())
                    .map_err(|e| format!("read: {e:?}"))
            })
    }
    #[test]
    fn all_fixture_scripts_compile() {
        let mut unexpected_failures = Vec::new();
        let mut unexpected_passes = Vec::new();

        for path in get_rhai_test_script() {
            let name = fixture_name(&path);

            match (compare_and_read(&path), is_known_grain_failure(name)) {
                (Err(e), false) => unexpected_failures.push(format!("{name}: {e}")),
                (Ok(()), true) => unexpected_passes.push(name.to_string()),
                _ => {}
            }
        }

        assert!(
            unexpected_failures.is_empty() && unexpected_passes.is_empty(),
            "unexpected failures:\n{}\n\nnow passing, remove from KNOWN_FAILURES:\n{}",
            unexpected_failures.join("\n"),
            unexpected_passes.join("\n"),
        );
    }

    /// Asserts the exact errors reported for `source`, as
    /// `(message, line, column, end column)`. Lines and columns are 1-based and the end column
    /// is exclusive. Lexer errors sit on one line, so the end shares the start's line; parse
    /// errors carry no end and use `None`.
    fn assert_errors(source: &str, expected: &[(&str, usize, usize, Option<usize>)]) {
        let expected: Vec<RhaiError> = expected
            .iter()
            .map(|&(message, line, column, end_column)| {
                let mut err = RhaiError::new(message.to_string(), Some(line), Some(column));
                if let Some(end_column) = end_column {
                    err.set_end_position(Some(line), Some(end_column));
                }
                err
            })
            .collect();
        assert_eq!(
            syntax_errors(source),
            format!("{expected:?}"),
            "for source: {source:?}"
        );
    }

    fn assert_no_errors(source: &str) {
        assert_errors(source, &[]);
    }

    /// For errors whose exact text or position isn't worth pinning down.
    fn assert_error_contains(source: &str, fragment: &str) {
        let errors = syntax_errors(source);
        assert!(
            errors.contains(fragment),
            "expected {fragment:?} for {source:?}, got {errors}"
        );
    }

    #[test]
    fn empty_script_has_no_errors() {
        assert_no_errors("");
    }

    #[test]
    fn valid_script_has_no_errors() {
        assert_no_errors("let x = 1 + 2;\nprint(x);\n");
    }

    #[test]
    fn braces_and_backticks_in_comments_are_ignored() {
        assert_no_errors("// `${ } {\n/* `a ${ */\nlet x = 1;");
    }

    #[test]
    fn double_quoted_dollar_brace_is_not_an_interpolation() {
        assert_no_errors("let s = \"${not interpolated}\";\nlet m = #{ a: 1 };");
    }

    #[test]
    fn simple_interpolation() {
        assert_no_errors("let x = 1;\nlet s = `x is ${x}!`;");
    }

    #[test]
    fn several_interpolations_in_one_string() {
        assert_no_errors("let a = 1; let b = 2;\nlet s = `${a} and ${b} done`;");
    }

    #[test]
    fn block_with_braces_inside_interpolation() {
        assert_no_errors("let s = `a ${ if true { 1 } else { 2 } } b`;");
    }

    #[test]
    fn map_literal_inside_interpolation() {
        // `#{` is `Token::MapStart`, closed by an ordinary `}`.
        assert_no_errors("let s = `a ${ #{x: 1}.x } b`;");
    }

    #[test]
    fn nested_interpolation() {
        assert_no_errors("let s = `a ${ `b ${1}` } c`;");
    }

    #[test]
    fn code_after_an_interpolated_string_is_lexed_as_code() {
        assert_errors(
            "let s = `${1}`;\nlet t = \"abc",
            &[("Open string is not terminated", 2, 9, Some(13))],
        );
    }

    #[test]
    fn fixture_scripts_have_no_syntax_errors() {
        for path in get_rhai_test_script() {
            let name = fixture_name(&path);
            if is_known_grain_failure(name) {
                continue;
            }
            let source = std::fs::read_to_string(&path).unwrap();
            assert_eq!(syntax_errors(&source), "[]", "unexpected errors in {name}");
        }
    }

    #[test]
    fn unterminated_double_quoted_string() {
        assert_errors(
            "let s = \"abc",
            &[("Open string is not terminated", 1, 9, Some(13))],
        );
    }

    #[test]
    fn unterminated_back_tick_string() {
        assert_errors(
            "let s = `abc",
            &[("Open string is not terminated", 1, 9, Some(13))],
        );
    }

    #[test]
    fn unterminated_string_after_an_interpolation() {
        assert_error_contains("let s = `a ${1} b", "Open string is not terminated");
    }

    #[test]
    fn invalid_escape_sequence() {
        assert_errors(
            "let s = \"\\q\";",
            &[("Invalid escape sequence: '\\q'", 1, 11, None)],
        );
    }

    #[test]
    fn malformed_number() {
        assert_error_contains("let n = 0xZZ;", "Invalid number");
    }

    #[test]
    fn error_position_on_a_later_line() {
        assert_errors(
            "let x = 1;\nlet s = \"abc",
            &[("Open string is not terminated", 2, 9, Some(13))],
        );
    }

    #[test]
    #[ignore = "the second lexer error does not consider the newline"]
    fn every_lexer_error_is_reported() {
        assert_errors(
            "let a = \"x\nlet b = \"y",
            &[
                ("Open string is not terminated", 1, 9, Some(11)),
                ("Open string is not terminated", 2, 9, Some(11)),
            ],
        );
    }

    #[test]
    fn grammar_error_is_reported() {
        assert_errors("let x = ;", &[("Unexpected ';'", 1, 9, None)]);
    }

    // --- end of the underlined range ---------------------------------------------------

    #[test]
    fn invalid_operator_range_excludes_the_following_space() {
        // The next token `1` starts at column 15; the space before it is not part of `===`.
        assert_errors(
            "let a = 1 === 1;",
            &[(
                "'===' is not a valid operator. This is not JavaScript! Should it be '=='?",
                1,
                11,
                Some(14),
            )],
        );
    }

    #[test]
    fn invalid_character_literal_range_ends_at_the_next_token() {
        assert_errors(
            "let c = 'ab';",
            &[("Invalid character: 'ab'", 1, 9, Some(13))],
        );
    }

    #[test]
    fn unexpected_character_range_covers_only_that_character() {
        assert_errors("let x = 1 £ 2;", &[("Unexpected '£'", 1, 11, Some(12))]);
    }

    #[test]
    fn unterminated_string_range_stays_on_its_own_line() {
        // The next token is on line 2 (and rhai misreports its line after this error),
        // so the end must be the end of line 1.
        assert_errors(
            "let s = \"abc\nlet y = 1;",
            &[("Open string is not terminated", 1, 9, Some(13))],
        );
    }

    #[test]
    fn range_is_counted_in_characters_not_bytes() {
        // `£` is two bytes but one character; counting bytes would give 14.
        assert_errors(
            "let s = \"£bc",
            &[("Open string is not terminated", 1, 9, Some(13))],
        );
    }
}
