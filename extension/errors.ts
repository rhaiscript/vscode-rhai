import * as vscode from "vscode"

const rhaiErrorName = "RhaiError"

export interface RhaiError{
    name?: string;
    message: string;
    line?: number;
    column?: number;
    end_line?: number;
    end_column?: number;
}

export async function squigglyLineErrors(errors: RhaiError[], document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection
) {
    const vscodeDiagnostic = []
    let unexpectedMessage: string | undefined
    for (const error of errors) {
        if (error.name !== rhaiErrorName) {
            unexpectedMessage = error.message
            continue
        }
        const line = (error.line ?? 1) - 1
        const col = (error.column ?? 1) - 1
        const endLine = (error.end_line ?? error.line ?? 1) - 1
        const endCol = (error.end_column ?? (error.column ?? 1) + 1) - 1
        const range = new vscode.Range(line, col, endLine, endCol)
        vscodeDiagnostic.push(new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error))
    }
    diagnostics.set(document.uri, vscodeDiagnostic)
    if (unexpectedMessage) {
        await vscode.window.showErrorMessage(`Rhai: ${unexpectedMessage}`)
    }
}

