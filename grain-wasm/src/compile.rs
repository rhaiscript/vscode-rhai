use crate::error::GrainError;
use rhai::Engine;
use rhai::grain::Compiler;

pub(crate) fn compile_source(source: &str) -> Result<Vec<u8>, GrainError> {
    let engine = Engine::new();
    let ast = engine.compile(source)?;
    let program = Compiler::new().compile(&ast);
    let buf = program
        .write()
        .map_err(|e| GrainError::new(format!("failed to write program: {e}"), None, None))?;
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::compile_source;
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
        let paths = std::fs::read_dir(rhai_scripts_path).unwrap();
        for path in paths {
            let path = path.unwrap().path();
            if path.is_file() && path.extension() == Some(std::ffi::OsStr::new("rhai")) {
                files.push(path);
            }
        }
        // `read_dir` order is platform-dependent; keep failure output stable.
        files.sort();
        files
    }

    #[test]
    fn compiles_to_a_readable_program() {
        let bytes = compile_source("let x = 40; x + 2").unwrap();

        assert!(!bytes.is_empty());
        Program::read(&bytes).expect("written program reads back");
    }

    #[test]
    fn empty_script_compiles() {
        let bytes = compile_source("").unwrap();

        Program::read(&bytes).expect("empty program reads back");
    }

    #[test]
    fn syntax_error_is_rejected() {
        assert!(compile_source("let = ;").is_err());
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

            let bytes =
                compile_source(source).unwrap_or_else(|e| panic!("compile `{source}`: {e:?}"));
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
    fn compare_and_read(path: &PathBuf) -> Result<(), String> {
        let source = std::fs::read_to_string(path).unwrap();
        compile_source(&source)
            .map_err(|e| format!("compile: {e:?}"))
            .and_then(|bytes| {
                Program::read(&bytes)
                    .map(|_| ())
                    .map_err(|e| format!("read: {e:?}"))
            })
    }
    #[test]
    fn all_fixture_scripts_compile() {
        let scripts = get_rhai_test_script();
        assert!(!scripts.is_empty(), "no .rhai fixtures found");
        let mut unexpected_failures = Vec::new();
        let mut unexpected_passes = Vec::new();

        for path in scripts {
            let name = path.file_name().unwrap().to_str().unwrap();
            let known = KNOWN_GRAIN_FAILURES.iter().any(|(n, _)| *n == name);

            match (compare_and_read(&path), known) {
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
}
