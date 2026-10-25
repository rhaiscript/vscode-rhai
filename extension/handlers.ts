import * as vscode from "vscode"
import {RhaiError, squigglyLineErrors} from "./errors"
import * as rhai from '../dist/rhai/rhai_wasm.js'

export function isRhaiDocument(document: vscode.TextDocument) {
    return document.languageId === 'rhai' && document.uri.path.endsWith('.rhai')
}

export async function compileRhaiHandler(diagnostics: vscode.DiagnosticCollection, uri?: vscode.Uri) {
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
    await squigglyLineErrors(errors, document, diagnostics)
}

export async function compileGrainHandler(diagnostics: vscode.DiagnosticCollection, uri?: vscode.Uri) {
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
        await vscode.workspace.fs.writeFile(document.uri.with({path: document.uri.path.replace(/\.rhai$/, '.rgrn')}), bytes)
    } catch (error) {
        const e = error as RhaiError
        await squigglyLineErrors([e], document, diagnostics,)
    }
}

