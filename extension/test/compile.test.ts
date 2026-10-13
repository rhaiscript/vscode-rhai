import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import {resetSessionStateForTests} from '../extension'
import * as h from './helpers'

const VALID = 'let x = 1 + 2;\nprint(x);\n'
const INVALID = 'let x = ;\n'

suite('Compile Rhai to Grain', () => {
    let sandbox: sinon.SinonSandbox
    let file: string

    suiteSetup(async () => {
        await h.activateExtension()
    })

    setup(async () => {
        await h.restoreSettings()
        resetSessionStateForTests()
        file = h.freshName('compile')
        sandbox = sinon.createSandbox()
        // The file-nesting prompt has its own suite; answer it as "closed" here.
        h.stubInformationMessage(sandbox, undefined)
    })

    teardown(async () => {
        sandbox.restore()
        await h.closeAllEditors()
        await h.deleteCreatedFiles()
    })

    test('saving a valid .rhai file writes the .rgrn next to it', async () => {
        const document = await h.saveRhai(file, VALID)
        const output = h.grainUri(document.uri)

        await h.waitFor(() => h.exists(output), 'the .rgrn to be written')
        const bytes = await vscode.workspace.fs.readFile(output)
        assert.ok(bytes.length > 0, 'the bytecode file is empty')
        assert.deepStrictEqual(vscode.languages.getDiagnostics(document.uri), [])
    })

    test('saving invalid Rhai reports a diagnostic and writes no .rgrn', async () => {
        const document = await h.saveRhai(file, INVALID)

        await h.waitFor(() => vscode.languages.getDiagnostics(document.uri).length > 0, 'a Grain diagnostic')
        const [diagnostic] = vscode.languages.getDiagnostics(document.uri)
        assert.strictEqual(diagnostic.message, "Unexpected ';'")
        assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error)
        // The compiler reports line 1, column 9 (1-based); VS Code positions are 0-based.
        assert.deepStrictEqual([diagnostic.range.start.line, diagnostic.range.start.character], [0, 8])
        assert.strictEqual(await h.exists(h.grainUri(document.uri)), false)
    })

    test('fixing the error clears the diagnostic', async () => {
        const document = await h.saveRhai(file, INVALID)
        await h.waitFor(() => vscode.languages.getDiagnostics(document.uri).length > 0, 'a Grain diagnostic')

        await h.saveAndCompile(file, VALID)
        assert.deepStrictEqual(vscode.languages.getDiagnostics(document.uri), [])
    })

    test('nothing is compiled when rhai.compileGrainOnSave is "off"', async () => {
        await h.updateSetting('rhai', 'compileGrainOnSave', 'off', vscode.ConfigurationTarget.Workspace)

        const document = await h.saveRhai(file, VALID)
        // Waiting for something *not* to happen: give the save handler time to (not) run.
        await h.sleep(500)
        assert.strictEqual(await h.exists(h.grainUri(document.uri)), false)
    })

    test('the rhai.compileGrain command compiles the active .rhai file without saving', async () => {
        const {document} = await h.openRhai(file, VALID)

        await vscode.commands.executeCommand('rhai.compileGrain')
        assert.ok(await h.exists(h.grainUri(document.uri)), 'the .rgrn was not written')
        assert.ok(document.isDirty, 'the command should not save the document')
    })

    test('the rhai.compileGrain command warns when the active file is not Rhai', async () => {
        const warning = h.stubWarningMessage(sandbox)
        const uri = await h.createFile(h.freshName('note', '.txt'), 'not rhai')
        await vscode.window.showTextDocument(uri)

        await vscode.commands.executeCommand('rhai.compileGrain')
        sinon.assert.calledOnceWithExactly(warning, 'Rhai: open a .rhai file to compile it to Grain')
    })
})
