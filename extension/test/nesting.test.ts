import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import {resetSessionStateForTests} from '../extension'
import * as h from './helpers'

const VALID = 'let x = 1 + 2;\nprint(x);\n'

function inspect(section: string, key: string) {
    return vscode.workspace.getConfiguration(section).inspect(key)
}

suite('File-nesting prompt', () => {
    let sandbox: sinon.SinonSandbox
    let file: string

    suiteSetup(async () => {
        await h.activateExtension()
    })

    setup(async () => {
        await h.restoreSettings()
        resetSessionStateForTests()
        file = h.freshName('nesting')
        sandbox = sinon.createSandbox()
    })

    teardown(async () => {
        sandbox.restore()
        await h.closeAllEditors()
        await h.deleteCreatedFiles()
    })

    test('prompt after a successful compile', async () => {
        const prompt = h.stubInformationMessage(sandbox, undefined)

        await h.saveAndCompile(file, VALID)
        sinon.assert.calledOnce(prompt)
        const [message, ...buttons] = prompt.firstCall.args as string[]
        assert.match(message, /\.rgrn/)
        assert.deepStrictEqual(buttons, ['Enable', 'Not this time', 'Do not ask again'])
    })

    test('"Not this time" remembered for the rest of the session', async () => {
        const prompt = h.stubInformationMessage(sandbox, 'Not this time')

        await h.saveAndCompile(file, VALID)
        await h.saveAndCompile(file, VALID)
        sinon.assert.calledOnce(prompt)
    })

    test('closing the prompt remembered for the session, and asks again in a new session', async () => {
        const prompt = h.stubInformationMessage(sandbox, undefined)

        await h.saveAndCompile(file, VALID)
        await h.saveAndCompile(file, VALID)
        sinon.assert.calledOnce(prompt)

        // A window reload starts a new extension host, which resets the module state.
        resetSessionStateForTests()
        await h.saveAndCompile(file, VALID)
        sinon.assert.calledTwice(prompt)
    })

    test('"Enable" turns on file nesting for the workspace', async () => {
        h.stubInformationMessage(sandbox, 'Enable')

        await h.saveAndCompile(file, VALID)
        await h.waitFor(() => inspect('explorer.fileNesting', 'enabled')?.workspaceValue === true, 'file nesting to be enabled in the workspace')
        assert.strictEqual(inspect('explorer.fileNesting', 'enabled')?.globalValue, undefined)
    })

    test('"Do not ask again" turns rhai.promptFileNesting off for the user', async () => {
        h.stubInformationMessage(sandbox, 'Do not ask again')

        await h.saveAndCompile(file, VALID)
        await h.waitFor(() => inspect('rhai', 'promptFileNesting')?.globalValue === false, 'rhai.promptFileNesting to be false in user settings')
    })

    test('do not ask when rhai.promptFileNesting is false', async () => {
        await h.updateSetting('rhai', 'promptFileNesting', false, vscode.ConfigurationTarget.Global)
        const prompt = h.stubInformationMessage(sandbox, undefined)

        await h.saveAndCompile(file, VALID)
        sinon.assert.notCalled(prompt)
    })

    test('do not ask when file nesting is already enabled', async () => {
        await h.updateSetting('explorer.fileNesting', 'enabled', true, vscode.ConfigurationTarget.Workspace)
        const prompt = h.stubInformationMessage(sandbox, undefined)

        await h.saveAndCompile(file, VALID)
        sinon.assert.notCalled(prompt)
    })
})
