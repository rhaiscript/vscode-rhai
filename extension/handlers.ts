import * as vscode from "vscode"
import {RhaiError, squigglyLineErrors} from "./errors"
import * as rhai from '../dist/rhai/rhai_wasm.js'

export function isRhaiDocument(document: vscode.TextDocument) {
    return document.languageId === 'rhai' && document.uri.path.endsWith('.rhai')
}

export async function compileRhaiHandler(diagnostics: vscode.DiagnosticCollection, carets: {
    type: vscode.
    TextEditorDecorationType,
    byUri: Map<string, vscode.Range[]>
}, uri?: vscode.Uri) {
    const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document
    if (!document) {
        return
    }
    if (!isRhaiDocument(document)) {
        await vscode.window.showWarningMessage('Rhai: open a .rhai file to check its syntax')
        return
    }
    const errors = rhai.compile(document.getText()) as RhaiError[]
    diagnostics.delete(document.uri)
    await squigglyLineErrors(errors, document, diagnostics, carets)
}

export async function compileGrainHandler(diagnostics: vscode.DiagnosticCollection, carets: {
    type: vscode.
        TextEditorDecorationType,
    byUri: Map<string, vscode.Range[]>
}, uri?: vscode.Uri) {
    const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document
    if (!document) {
        return
    }
    try {
        if (!isRhaiDocument(document)) {
            await vscode.window.showWarningMessage('Rhai: open a .rhai file to compile it to Grain')
            return
        }
        const bytes = rhai.compile_grain(document.getText())
        diagnostics.delete(document.uri)
        clearCarets(carets, document.uri.toString())
        await vscode.workspace.fs.writeFile(document.uri.with({path: document.uri.path.replace(/\.rhai$/, '.rgrn')}), bytes)
    } catch (error) {
        const errors = Array.isArray(error) ? error : [error]
        await squigglyLineErrors(errors as RhaiError[], document, diagnostics,carets)
    }
}
function clearCarets(carets: {type: vscode.TextEditorDecorationType, byUri: Map<string, vscode.Range[]>}, url: string) {
    const ranges = carets.byUri.get(url)
    if (ranges) {
        const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.toString() === url)
        for (const e of editors) {
            e.setDecorations(carets.type, [])
        }
        carets.byUri.delete(url)
    }
}



