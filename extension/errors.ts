import * as vscode from "vscode";

const rhaiErrorName = "RhaiError"

export async function squigglyLineError(error: {
                                            name?: string;
                                            message: string;
                                            line?: number;
                                            column?: number
                                        }, document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection, uri?: vscode.Uri,
) {
    if (error.name !== rhaiErrorName) {
        await vscode.window.showErrorMessage(`Rhai: ${error.message}`)
        return
    }
    const line = (error.line ?? 1) - 1
    const col = (error.column ?? 1) - 1
    const range = new vscode.Range(line, col, line, col + 1)
    diagnostics.set(document.uri, [
        new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error),
    ])
    console.error(error)
}

