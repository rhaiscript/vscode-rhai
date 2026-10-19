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

    test('non-Rhai documents are never checked', async () => {
        const {document} = await h.openRhai(h.freshName('note', '.txt'), INVALID)
        assert.notStrictEqual(document.languageId, 'rhai')

        await h.sleep(DELAY_SECONDS * 1000 + 500)
        assert.deepStrictEqual(diagnosticsFor(document.uri), [])
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
