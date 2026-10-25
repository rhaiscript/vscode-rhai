import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import {resetSessionStateForTests} from '../extension'
import * as h from './helpers'

const VALID = 'let x = 1 + 2;\nprint(x);\n'
const INVALID = 'let x = ;\n'

/** Short debounce so the suite stays fast; individual tests override it where timing matters. */
const DELAY_SECONDS = 0.3

function diagnosticsFor(uri: vscode.Uri): vscode.Diagnostic[] {
    return vscode.languages.getDiagnostics(uri)
}

async function useSyntaxCheck(mode: 'off' | 'currentFile', delaySeconds = DELAY_SECONDS): Promise<void> {
    await h.updateSetting('rhai', 'syntaxCheckRhaiOnChange', mode, vscode.ConfigurationTarget.Workspace)
    await h.updateSetting('rhai', 'syntaxCheckRhaiDelaySeconds', delaySeconds, vscode.ConfigurationTarget.Workspace)
}

suite('Rhai syntax check while typing', () => {
    let sandbox: sinon.SinonSandbox
    let file: string

    suiteSetup(async () => {
        await h.activateExtension()
    })

    setup(async () => {
        await h.restoreSettings()
        resetSessionStateForTests()
        file = h.freshName('syntax')
        sandbox = sinon.createSandbox()
        await useSyntaxCheck('currentFile')
    })

    teardown(async () => {
        sandbox.restore()
        await h.restoreSettings()
        await h.sleep(1500)
        await h.closeAllEditors()
        await h.deleteCreatedFiles()
    })

    /** Opens `source` and runs the syntax check once through the command, with no debounce involved. */
    async function checkNow(source: string): Promise<vscode.Diagnostic[]> {
        await useSyntaxCheck('off')
        const {document} = await h.openRhai(file, source)
        await vscode.commands.executeCommand('rhai.syntaxCheckRhai')
        return diagnosticsFor(document.uri)
    }

    /** `[message, 0-based line, 0-based character]` for each diagnostic, for compact assertions. */
    function summarise(diagnostics: vscode.Diagnostic[]): [string, number, number][] {
        return diagnostics.map((d) => [d.message, d.range.start.line, d.range.start.character])
    }


    test('invalid Rhai is reported after typing stops, without saving', async () => {
        const {document} = await h.openRhai(file, INVALID)

        await h.waitFor(() => diagnosticsFor(document.uri).length > 0, 'a syntax diagnostic')
        const [diagnostic] = diagnosticsFor(document.uri)
        assert.strictEqual(diagnostic.message, "Unexpected ';'")
        assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error)
        // The parser reports line 1, column 9 (1-based); VS Code positions are 0-based.
        assert.deepStrictEqual([diagnostic.range.start.line, diagnostic.range.start.character], [0, 8])
        assert.ok(document.isDirty, 'the syntax check should not save the document')
        assert.strictEqual(await h.exists(h.grainUri(document.uri)), false, 'the syntax check should not write a .rgrn')
    })

    test('nothing is reported before the delay has passed', async () => {
        await useSyntaxCheck('currentFile', 1)
        const {document} = await h.openRhai(file, INVALID)

        await h.sleep(300)
        assert.deepStrictEqual(diagnosticsFor(document.uri), [], 'checked before the 1s delay')
        await h.waitFor(() => diagnosticsFor(document.uri).length > 0, 'a syntax diagnostic after the delay', 3000)
    })

    test('each edit restarts the delay (debounce)', async () => {
        await useSyntaxCheck('currentFile', 1)
        const {document} = await h.openRhai(file, INVALID)
        await h.sleep(600)
        // A second edit within the delay: the check must now run 1s after *this* edit.
        await h.openRhai(file, `${INVALID}// still typing\n`)

        // Without debouncing, the first edit's check would have fired ~400ms ago.
        await h.sleep(600)
        assert.deepStrictEqual(diagnosticsFor(document.uri), [], 'the first edit was checked; the delay was not restarted')
        await h.waitFor(() => diagnosticsFor(document.uri).length > 0, 'a syntax diagnostic after the last edit', 3000)
    })

    test('only the text after the last edit is checked', async () => {
        const {document} = await h.openRhai(file, INVALID)
        await h.openRhai(file, VALID)

        await h.sleep(DELAY_SECONDS * 1000 + 500)
        assert.deepStrictEqual(diagnosticsFor(document.uri), [])
    })

    test('fixing the error while typing clears it', async () => {
        const {document} = await h.openRhai(file, INVALID)
        await h.waitFor(() => diagnosticsFor(document.uri).length > 0, 'a syntax diagnostic')

        await h.openRhai(file, VALID)
        await h.waitFor(() => diagnosticsFor(document.uri).length === 0, 'the diagnostic to be cleared')
    })

    test('nothing is checked when rhai.syntaxCheckRhaiOnChange is "off"', async () => {
        await useSyntaxCheck('off')
        const {document} = await h.openRhai(file, INVALID)

        await h.sleep(DELAY_SECONDS * 1000 + 500)
        assert.deepStrictEqual(diagnosticsFor(document.uri), [])
    })

    test('the check is on by default when rhai.syntaxCheckRhaiOnChange is not set', async () => {
        // Remove the value `setup` wrote, so only the default from package.json applies.
        await h.updateSetting('rhai', 'syntaxCheckRhaiOnChange', undefined, vscode.ConfigurationTarget.Workspace)
        const setting = vscode.workspace.getConfiguration('rhai').inspect('syntaxCheckRhaiOnChange')
        assert.strictEqual(setting?.defaultValue, 'currentFile')
        assert.strictEqual(setting?.globalValue, undefined)
        assert.strictEqual(setting?.workspaceValue, undefined)

        const {document} = await h.openRhai(file, INVALID)
        await h.waitFor(() => diagnosticsFor(document.uri).length > 0, 'a syntax diagnostic with the default setting')
    })

    test('non-Rhai documents are never checked', async () => {
        const {document} = await h.openRhai(h.freshName('note', '.txt'), INVALID)
        assert.notStrictEqual(document.languageId, 'rhai')

        await h.sleep(DELAY_SECONDS * 1000 + 500)
        assert.deepStrictEqual(diagnosticsFor(document.uri), [])
    })


    /** `[start line, start character, end line, end character]`, all 0-based like VS Code. */
    function rangeOf(diagnostic: vscode.Diagnostic): [number, number, number, number] {
        const {start, end} = diagnostic.range
        return [start.line, start.character, end.line, end.character]
    }

    test('a lexer error underlines the whole token, not just its first character', async () => {
        const [diagnostic] = await checkNow('let a = 1 === 1;')
        // rhai: column 11 to 14 (1-based, exclusive end) -> VS Code: character 10 to 13.
        assert.deepStrictEqual(rangeOf(diagnostic), [0, 10, 0, 13])
    })

    test('a parser error, which has no end position, still gets a visible underline', async () => {
        const [diagnostic] = await checkNow('let x = ;')
        assert.deepStrictEqual([diagnostic.range.start.line, diagnostic.range.start.character], [0, 8])
        assert.ok(!diagnostic.range.isEmpty, `the underline is empty: ${JSON.stringify(rangeOf(diagnostic))}`)
    })

    test('an error deep in a real script lands on the right line and token', async () => {
        const script = [
            '// Code written by someone used to JavaScript.',
            'let values = [1, 2, 3];',
            'let total = 0;',
            '',
            'for v in values {',
            '    if v === 2 {',
            '        print(`skipping ${v}`);',
            '        continue;',
            '    }',
            '    total += v;',
            '}',
        ].join('\n')
        // `===` is on line 6, columns 10-12 (1-based) -> VS Code line 5, characters 9 to 12.
        assert.deepStrictEqual((await checkNow(script)).map(rangeOf), [[5, 9, 5, 12]])
    })

    test('an invalid operator shows rhai\'s hint at the operator', async () => {
        assert.deepStrictEqual(summarise(await checkNow('let a = 1 === 1;')), [
            ["'===' is not a valid operator. This is not JavaScript! Should it be '=='?", 0, 10],
        ])
    })

    test('an unexpected character is reported where it is', async () => {
        assert.deepStrictEqual(summarise(await checkNow('let x = 1 £ 2;')), [["Unexpected '£'", 0, 10]])
    })

    test('an invalid character literal is reported', async () => {
        assert.deepStrictEqual(summarise(await checkNow("let c = 'ab';")), [["Invalid character: 'ab'", 0, 8]])
    })

    test('every invalid token in the file is shown, not only the last one', async () => {
        assert.deepStrictEqual(summarise(await checkNow("let a = 1 === 1;\nlet c = 'ab';")), [
            ["'===' is not a valid operator. This is not JavaScript! Should it be '=='?", 0, 10],
            ["Invalid character: 'ab'", 1, 8],
        ])
    })

    test('only the first grammar error is shown', async () => {
        // rhai's parser stops at its first error, so the second `let y = ;` is not reported yet.
        assert.deepStrictEqual(summarise(await checkNow('let x = ;\nlet y = ;')), [["Unexpected ';'", 0, 8]])
    })

    test('a reserved symbol is reported by the parser fallback', async () => {
        assert.deepStrictEqual(summarise(await checkNow('let x = $;')), [["'$' is a reserved symbol", 0, 8]])
    })

    test('valid interpolated strings are not reported', async () => {
        assert.deepStrictEqual(
            summarise(await checkNow('let x = 1;\nlet s = `a ${ #{v: x}.v } b ${ `c ${x}` } d`;')),
            [],
        )
    })

    test('the rhai.syntaxCheckRhai command checks the active file immediately', async () => {
        await useSyntaxCheck('off')
        const {document} = await h.openRhai(file, INVALID)

        await vscode.commands.executeCommand('rhai.syntaxCheckRhai')
        assert.strictEqual(diagnosticsFor(document.uri)[0]?.message, "Unexpected ';'")

        await h.openRhai(file, VALID)
        await vscode.commands.executeCommand('rhai.syntaxCheckRhai')
        assert.deepStrictEqual(diagnosticsFor(document.uri), [])
        assert.strictEqual(await h.exists(h.grainUri(document.uri)), false, 'the syntax check should not write a .rgrn')
    })
})
