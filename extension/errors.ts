import * as vscode from "vscode"

const rhaiErrorName = "RhaiError"

export type RhaiErrorKind = 'Standard' | 'InsertSymbol' | 'ConstructIncomplete'


export interface RhaiError {
    name?: string;
    message: string;
    line?: number;
    column?: number;
    end_line?: number;
    end_column?: number;
    kind?: RhaiErrorKind
}

export async function squigglyLineErrors(errors: RhaiError[], document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection, carets: {
    type: vscode.TextEditorDecorationType,
    byUri: Map<string, vscode.Range[]>
},) {
    const vscodeDiagnostic = []
    let unexpectedMessage: string | undefined
    const url = document.uri.toString()
    const editors = vscode.window.visibleTextEditors.filter(
        (e) => e.document.uri.toString() === url,
    )

    const currentCarets: vscode.Range[] = []
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
        if (error.kind === 'InsertSymbol') {
            currentCarets.push(new vscode.Range(range.start, range.start))
        }
        vscodeDiagnostic.push(new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error))
    }
    for (const editor of editors) {
        editor.setDecorations(carets.type, currentCarets)
    }
    if (currentCarets.length > 0) {
        carets.byUri.set(url, currentCarets)
    } else {
        carets.byUri.delete(url)
    }
    diagnostics.set(document.uri, vscodeDiagnostic)
    if (unexpectedMessage) {
        await vscode.window.showErrorMessage(`Rhai: ${unexpectedMessage}`)
    }
}

