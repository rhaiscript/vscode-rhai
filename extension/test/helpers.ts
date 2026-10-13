import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

export const EXTENSION_ID = 'rhaiscript.vscode-rhai'

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Polls `condition` until it is true. Needed because VS Code does not wait for
 * `onDidSaveTextDocument` listeners, so `document.save()` resolves before the compile finishes.
 */
export async function waitFor(condition: () => boolean | Promise<boolean>, description: string, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!(await condition())) {
        if (Date.now() > deadline) {
            assert.fail(`Timed out after ${timeoutMs}ms waiting for: ${description}`)
        }
        await sleep(50)
    }
}

export async function activateExtension(): Promise<void> {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)
    assert.ok(extension, `${EXTENSION_ID} is not loaded in the test instance`)
    await extension.activate()
}

export function workspaceUri(name: string): vscode.Uri {
    const folder = vscode.workspace.workspaceFolders?.[0]
    assert.ok(folder, 'the tests must run with the fixture workspace open')
    return vscode.Uri.joinPath(folder.uri, name)
}

export function grainUri(rhai: vscode.Uri): vscode.Uri {
    return rhai.with({path: rhai.path.replace(/\.rhai$/, '.rgrn')})
}

export async function exists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri)
        return true
    } catch {
        return false
    }
}

export async function deleteIfExists(uri: vscode.Uri): Promise<void> {
    if (await exists(uri)) {
        await vscode.workspace.fs.delete(uri)
    }
}

let fileCounter = 0
const createdFiles: vscode.Uri[] = []

/**
 * A file name no other test has used in this run. Names are never reused because VS Code keeps
 * closed documents cached for a while; recreating a deleted file under the same name makes the
 * next save fail with "File Modified Since".
 */
export function freshName(base: string, extension = '.rhai'): string {
    fileCounter += 1
    return `${base}-${fileCounter}${extension}`
}

/** Creates an empty file in the workspace; it is removed by `deleteCreatedFiles`. */
export async function createFile(name: string, content = ''): Promise<vscode.Uri> {
    const uri = workspaceUri(name)
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content))
    createdFiles.push(uri)
    return uri
}

/** Deletes every file made through `createFile`, plus any .rgrn compiled from it. */
export async function deleteCreatedFiles(): Promise<void> {
    for (const uri of createdFiles.splice(0)) {
        await deleteIfExists(uri)
        await deleteIfExists(grainUri(uri))
    }
}

/** Opens `name` in an editor with `content` and makes sure the document is dirty. */
export async function openRhai(name: string, content: string): Promise<{document: vscode.TextDocument, editor: vscode.TextEditor}> {
    const uri = workspaceUri(name)
    if (!(await exists(uri))) {
        await createFile(name)
    }
    const document = await vscode.workspace.openTextDocument(uri)
    const editor = await vscode.window.showTextDocument(document)
    const all = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
    await editor.edit((edit) => edit.replace(all, content))
    if (!document.isDirty) {
        await editor.edit((edit) => edit.insert(document.positionAt(document.getText().length), '\n'))
    }
    return {document, editor}
}

/** Writes `content` into `name` through the editor and saves it, like a user would. */
export async function saveRhai(name: string, content: string): Promise<vscode.TextDocument> {
    const {document} = await openRhai(name, content)
    assert.ok(await document.save(), `saving ${name} failed`)
    return document
}

/**
 * Saves valid Rhai and waits until the save handler has written the .rgrn file, then gives
 * the handler a moment to run its post-compile step (the file-nesting prompt).
 */
export async function saveAndCompile(name: string, content: string): Promise<vscode.TextDocument> {
    const output = grainUri(workspaceUri(name))
    await deleteIfExists(output)
    const document = await saveRhai(name, content)
    await waitFor(() => exists(output), `${output.path} to be written`)
    await sleep(200)
    return document
}

export async function closeAllEditors(): Promise<void> {
    // Closing a dirty editor opens a "Save changes?" dialog that would hang the run, so revert first.
    for (const document of vscode.workspace.textDocuments.filter((d) => d.isDirty)) {
        await vscode.window.showTextDocument(document)
        await vscode.commands.executeCommand('workbench.action.files.revert')
    }
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
}

/** Settings the tests change, with the value the fixture workspace starts with (undefined = unset). */
const TOUCHED_SETTINGS: {section: string, key: string, workspaceValue: unknown}[] = [
    {section: 'rhai', key: 'compileGrainOnSave', workspaceValue: 'currentFile'},
    {section: 'rhai', key: 'promptFileNesting', workspaceValue: undefined},
    {section: 'explorer.fileNesting', key: 'enabled', workspaceValue: undefined},
]

/** Puts every setting the tests touch back to the fixture's starting point. */
export async function restoreSettings(): Promise<void> {
    for (const {section, key, workspaceValue} of TOUCHED_SETTINGS) {
        const config = vscode.workspace.getConfiguration(section)
        await config.update(key, undefined, vscode.ConfigurationTarget.Global)
        await config.update(key, workspaceValue, vscode.ConfigurationTarget.Workspace)
    }
}

export async function updateSetting(section: string, key: string, value: unknown, target: vscode.ConfigurationTarget): Promise<void> {
    await vscode.workspace.getConfiguration(section).update(key, value, target)
}

/**
 * Replaces `vscode.window.showInformationMessage` with a fake that answers `answer`, as if the
 * user had clicked that button (`undefined` = closed without choosing).
 */
export function stubInformationMessage(sandbox: sinon.SinonSandbox, answer: string | undefined): sinon.SinonStub {
    return sandbox.stub(vscode.window, 'showInformationMessage').resolves(answer as never)
}

export function stubWarningMessage(sandbox: sinon.SinonSandbox): sinon.SinonStub {
    return sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined)
}
