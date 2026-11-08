import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import {resetSessionStateForTests} from '../extension'
import * as h from './helpers'

const MISSING_COMMA = 'fn fib(num {}'
const FIXED = 'fn fib(num, x) {}'

/** One `editor.setDecorations(type, ranges)` call, as the extension made it. */
interface DecorationCall {
    type: vscode.TextEditorDecorationType
    ranges: [number, number, number, number][]
}

/** `[start line, start character, end line, end character]`, all 0-based like VS Code. */
function positions(ranges: readonly vscode.Range[]): [number, number, number, number][] {
    return ranges.map(({start, end}) => [start.line, start.character, end.line, end.character])
}

suite('Insert caret for a missing symbol', () => {
    let sandbox: sinon.SinonSandbox
    let file: string

    suiteSetup(async () => {
        await h.activateExtension()
    })

    setup(async () => {
        await h.restoreSettings()
        resetSessionStateForTests()
        file = h.freshName('caret')
        sandbox = sinon.createSandbox()
    })

    teardown(async () => {
        sandbox.restore()
        await h.closeAllEditors()
        await h.deleteCreatedFiles()
    })

    /**
     * Real `TextEditor`s are frozen, so their `setDecorations` can't be stubbed. Instead the
     * extension is shown fake editors that record every call. Returns the calls per fake editor,
     * in the same order as `documents`.
     */
    function showFakeEditors(...documents: Pick<vscode.TextDocument, 'uri'>[]): DecorationCall[][] {
        const calls = documents.map((): DecorationCall[] => [])
        const editors = documents.map((document, i) => ({
            document,
            setDecorations(type: vscode.TextEditorDecorationType, ranges: readonly vscode.Range[]) {
                calls[i].push({type, ranges: positions(ranges)})
            },
        }))
        sandbox.stub(vscode.window, 'visibleTextEditors').get(() => editors)
        return calls
    }

    /** Opens `source` and returns the fake editor's calls after one syntax check. */
    async function checkAndRecord(source: string): Promise<{document: vscode.TextDocument, calls: DecorationCall[]}> {
        const {document} = await h.openRhai(file, source)
        const [calls] = showFakeEditors(document)
        await vscode.commands.executeCommand('rhai.syntaxCheckRhai', document.uri)
        return {document, calls}
    }

    function lastCaretsOf(calls: DecorationCall[]): [number, number, number, number][] {
        assert.ok(calls.length > 0, 'setDecorations was never called')
        return calls[calls.length - 1].ranges
    }

    test('a missing symbol puts a caret at the gap, as an empty range', async () => {
        const {calls} = await checkAndRecord(MISSING_COMMA)
        // rhai: the space after `num`, column 11 (1-based) -> VS Code character 10.
        assert.deepStrictEqual(lastCaretsOf(calls), [[0, 10, 0, 10]])
    })

    test('the caret is added on top of the diagnostic, which still underlines the gap', async () => {
        const {document} = await checkAndRecord(MISSING_COMMA)
        const diagnostics = vscode.languages.getDiagnostics(document.uri)
        assert.deepStrictEqual(positions(diagnostics.map((d) => d.range)), [[0, 10, 0, 11]])
        assert.strictEqual(diagnostics[0].message, "Expecting ',' to separate the parameters of function 'fib'")
    })

    test('errors that are not a missing symbol get no caret', async () => {
        for (const source of ['let x = ;', 'let = 2;', 'let a = 1 === 1;']) {
            sandbox.restore()
            sandbox = sinon.createSandbox()
            const {calls} = await checkAndRecord(source)
            assert.deepStrictEqual(lastCaretsOf(calls), [], `caret shown for ${JSON.stringify(source)}`)
        }
    })

    test('fixing the error removes the caret', async () => {
        const {document, calls} = await checkAndRecord(MISSING_COMMA)
        assert.deepStrictEqual(lastCaretsOf(calls), [[0, 10, 0, 10]])

        await h.openRhai(file, FIXED)
        await vscode.commands.executeCommand('rhai.syntaxCheckRhai', document.uri)
        assert.deepStrictEqual(lastCaretsOf(calls), [])
    })

    test('every check uses the same decoration type, so a later check can clear an earlier caret', async () => {
        const {document, calls} = await checkAndRecord(MISSING_COMMA)
        await h.openRhai(file, FIXED)
        await vscode.commands.executeCommand('rhai.syntaxCheckRhai', document.uri)

        const types = new Set(calls.map((call) => call.type))
        assert.strictEqual(types.size, 1, `${types.size} decoration types were used`)
    })

    test('only editors showing the checked file are updated', async () => {
        const {document} = await h.openRhai(file, MISSING_COMMA)
        const [checked, other] = showFakeEditors(document, {uri: h.workspaceUri('elsewhere.rhai')})

        await vscode.commands.executeCommand('rhai.syntaxCheckRhai', document.uri)
        assert.deepStrictEqual(lastCaretsOf(checked), [[0, 10, 0, 10]])
        assert.deepStrictEqual(other, [], 'the editor of another file was decorated')
    })

    test('a file that is not on screen still gets its diagnostic', async () => {
        const {document} = await h.openRhai(file, MISSING_COMMA)
        showFakeEditors()

        await vscode.commands.executeCommand('rhai.syntaxCheckRhai', document.uri)
        assert.strictEqual(vscode.languages.getDiagnostics(document.uri).length, 1)
    })

    test('compiling to Grain shows the caret on failure and clears it on success', async () => {
        const {document} = await h.openRhai(file, MISSING_COMMA)
        const [calls] = showFakeEditors(document)

        await vscode.commands.executeCommand('rhai.compileGrain', document.uri)
        assert.deepStrictEqual(lastCaretsOf(calls), [[0, 10, 0, 10]])

        await h.openRhai(file, FIXED)
        await vscode.commands.executeCommand('rhai.compileGrain', document.uri)
        assert.deepStrictEqual(lastCaretsOf(calls), [])
    })
})
