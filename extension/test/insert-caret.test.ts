import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import {resetSessionStateForTests} from '../extension'
import * as h from './helpers'

const MISSING_COMMA = 'fn fib(num {}'
const FIXED = 'fn fib(num, x) {}'
/** The same missing comma, six characters further right. */
const MISSING_COMMA_MOVED = 'fn fibonacci(num {}'

/** One `editor.setDecorations(type, ranges)` call, as the extension made it. */
interface DecorationCall {
    type: vscode.TextEditorDecorationType
    ranges: [number, number, number, number][]
}

/** As much of a `vscode.TextEditor` as the extension uses to draw carets. */
interface FakeEditor {
    document: Pick<vscode.TextDocument, 'uri'>
    setDecorations(type: vscode.TextEditorDecorationType, ranges: readonly vscode.Range[]): void
}

/** `[start line, start character, end line, end character]`, all 0-based like VS Code. */
function positions(ranges: readonly vscode.Range[]): [number, number, number, number][] {
    return ranges.map(({start, end}) => [start.line, start.character, end.line, end.character])
}

suite('Insert caret for a missing symbol', () => {
    let sandbox: sinon.SinonSandbox
    let file: string
    /** What the extension gets from `vscode.window.visibleTextEditors` during a test. */
    let visibleEditors: FakeEditor[]

    suiteSetup(async () => {
        await h.activateExtension()
    })

    setup(async () => {
        await h.restoreSettings()
        resetSessionStateForTests()
        file = h.freshName('caret')
        sandbox = sinon.createSandbox()
        visibleEditors = []
        sandbox.stub(vscode.window, 'visibleTextEditors').get(() => visibleEditors)
    })

    teardown(async () => {
        sandbox.restore()
        await h.closeAllEditors()
        await h.deleteCreatedFiles()
    })

    /**
     * Real `TextEditor`s are frozen, so their `setDecorations` can't be stubbed. Instead the
     * extension is shown fake editors that record every call. Each call replaces the editors
     * shown before, like a tab switch does: VS Code makes a new editor, with no decorations, every
     * time a file comes back on screen. Returns the calls per fake editor, in the same order as
     * `documents`.
     */
    function showFakeEditors(...documents: Pick<vscode.TextDocument, 'uri'>[]): DecorationCall[][] {
        const calls = documents.map((): DecorationCall[] => [])
        visibleEditors = documents.map((document, i) => ({
            document,
            setDecorations(type: vscode.TextEditorDecorationType, ranges: readonly vscode.Range[]) {
                calls[i].push({type, ranges: positions(ranges)})
            },
        }))
        return calls
    }

    /** Opens `source` in `name` and returns the fake editor's calls after one syntax check. */
    async function checkAndRecord(source: string, name = file): Promise<{document: vscode.TextDocument, calls: DecorationCall[]}> {
        const {document} = await h.openRhai(name, source)
        const [calls] = showFakeEditors(document)
        await vscode.commands.executeCommand('rhai.syntaxCheckRhai', document.uri)
        return {document, calls}
    }

    function lastCaretsOf(calls: DecorationCall[]): [number, number, number, number][] {
        assert.ok(calls.length > 0, 'setDecorations was never called')
        return calls[calls.length - 1].ranges
    }

    /** Every caret an editor was ever given. Empty when it was only cleared, or never touched. */
    function allCaretsOf(calls: DecorationCall[]): [number, number, number, number][] {
        return calls.flatMap((call) => call.ranges)
    }

    /**
     * Opens another file in place of the current one, which makes VS Code report a change of
     * visible editors, and waits until the extension has handled it. The extension registered its
     * listener first, and VS Code calls listeners in that order, so it has run when ours has.
     */
    async function switchTab(): Promise<void> {
        let reported = false
        const subscription = vscode.window.onDidChangeVisibleTextEditors(() => {
            reported = true
        })
        try {
            await h.openRhai(h.freshName('other-tab'), 'let y = 2;')
            await h.waitFor(() => reported, 'VS Code to report the tab switch')
        } finally {
            subscription.dispose()
        }
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

    test('compiling a broken file to Grain again keeps one caret, not one per compile', async () => {
        const {document} = await h.openRhai(file, MISSING_COMMA)
        const [calls] = showFakeEditors(document)

        for (let compile = 1; compile <= 3; compile++) {
            await vscode.commands.executeCommand('rhai.compileGrain', document.uri)
            assert.deepStrictEqual(lastCaretsOf(calls), [[0, 10, 0, 10]], `after compile ${compile}`)
        }
    })

    test('a syntax check followed by a failed Grain compile shows one caret', async () => {
        // What a user gets with both settings on: the check runs while typing, then the save compiles.
        const {document, calls} = await checkAndRecord(MISSING_COMMA)

        await vscode.commands.executeCommand('rhai.compileGrain', document.uri)
        assert.deepStrictEqual(lastCaretsOf(calls), [[0, 10, 0, 10]])
    })

    test('when the error moves, the caret moves with it and the old one is removed', async () => {
        const {document} = await h.openRhai(file, MISSING_COMMA)
        const [calls] = showFakeEditors(document)
        await vscode.commands.executeCommand('rhai.compileGrain', document.uri)

        await h.openRhai(file, MISSING_COMMA_MOVED)
        await vscode.commands.executeCommand('rhai.compileGrain', document.uri)
        assert.deepStrictEqual(lastCaretsOf(calls), [[0, 16, 0, 16]])
    })

    test('after a tab switch, the new editor for the file gets its caret back without a new check', async () => {
        const {document} = await checkAndRecord(MISSING_COMMA)
        const [reopened] = showFakeEditors(document)

        await switchTab()
        assert.deepStrictEqual(lastCaretsOf(reopened), [[0, 10, 0, 10]])
    })

    test('the caret shown after a tab switch is the one from the latest check', async () => {
        await checkAndRecord(MISSING_COMMA)
        const {document} = await checkAndRecord(MISSING_COMMA_MOVED)
        const [reopened] = showFakeEditors(document)

        await switchTab()
        assert.deepStrictEqual(lastCaretsOf(reopened), [[0, 16, 0, 16]])
    })

    test('after a tab switch, each file on screen gets its own caret', async () => {
        const first = await checkAndRecord(MISSING_COMMA)
        const second = await checkAndRecord(MISSING_COMMA_MOVED, h.freshName('caret-second'))
        // Both files side by side, plus one the extension has never checked.
        const [firstCalls, secondCalls, unchecked] = showFakeEditors(
            first.document, second.document, {uri: h.workspaceUri('elsewhere.rhai')},
        )

        await switchTab()
        assert.deepStrictEqual(lastCaretsOf(firstCalls), [[0, 10, 0, 10]])
        assert.deepStrictEqual(lastCaretsOf(secondCalls), [[0, 16, 0, 16]])
        assert.deepStrictEqual(allCaretsOf(unchecked), [], 'a file without a missing symbol got a caret')
    })

    test('after the error is fixed, a tab switch does not bring the caret back', async () => {
        for (const command of ['rhai.syntaxCheckRhai', 'rhai.compileGrain']) {
            const name = h.freshName('caret-fixed')
            const {document} = await h.openRhai(name, MISSING_COMMA)
            showFakeEditors(document)
            await vscode.commands.executeCommand(command, document.uri)
            await h.openRhai(name, FIXED)
            await vscode.commands.executeCommand(command, document.uri)
            const [reopened] = showFakeEditors(document)

            await switchTab()
            assert.deepStrictEqual(allCaretsOf(reopened), [], `caret came back after ${command}`)
        }
    })
})
