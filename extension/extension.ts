import * as vscode from 'vscode'
import * as child_process from 'child_process'
import * as grain from '../dist/grain/grain_wasm.js'

import
{
    LanguageClient,
    LanguageClientOptions,
    Executable,
} from 'vscode-languageclient/node'


let client: LanguageClient
let askedNestingThisSession: boolean = false

type CompileOnSave = 'off' | 'currentFile';

interface RhaiConfig {
    useLanguageServer: boolean
    compileGrainOnSave: CompileOnSave,
    promptFileNesting: boolean,
}

function getRhaiConfig(scope?: vscode.ConfigurationScope): RhaiConfig {
    const c = vscode.workspace.getConfiguration('rhai', scope)
    return {
        useLanguageServer: c.get('useLanguageServer', true),
        compileGrainOnSave: c.get('compileGrainOnSave', 'currentFile'),
        promptFileNesting: c.get('promptFileNesting', true),
    }
}


async function start_client() {
    const serverOptions: Executable = {
        command: 'rhai-lsp',
    }

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{scheme: 'file', language: 'rhai'}],
    }

    client = new LanguageClient(
        'rhaiLanguageServer',
        'Rhai Language Server',
        serverOptions,
        clientOptions,
    )

    await client.start()
}


async function is_installed(cmd: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const checkCommand = process.platform === 'win32' ? 'where' : 'command -v'
        const proc = child_process.exec(`${checkCommand} ${cmd}`)
        proc.on('exit', (code) => {
            resolve(code === 0)
        })
    })
}

async function installServerBinary(): Promise<boolean> {
    await is_installed('cargo')
    // cargo install
    // download from github
    const task = new vscode.Task(
        {type: 'cargo', task: 'install'},
        vscode.workspace.workspaceFolders![0],
        'Installing lsp server',
        'rhai-lsp',
        new vscode.ShellExecution('cargo install rhai-lsp'),
    )
    const promise = new Promise<boolean>((resolve) => {
        vscode.tasks.onDidEndTask((e) => {
            if (e.execution.task === task) {
                e.execution.terminate()
            }
        })
        vscode.tasks.onDidEndTaskProcess((e) => {
            resolve(e.exitCode === 0)
        })
    })
    await vscode.tasks.executeTask(task)

    return promise
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function tryToInstallLanguageServer(configuration: vscode.WorkspaceConfiguration) {
    const selected = await vscode.window.showInformationMessage(
        'Install rhai-lsp-server (Rust toolchain required) ?',
        'Install',
        'Never',
    )
    if (selected === 'Install') {
        const installed = await installServerBinary()
        if (installed) {
            await start_client()
        }
    } else if (selected === 'Never') {
        await configuration.update('useLanguageServer', false)
    }
}

export async function activate(context: vscode.ExtensionContext) {
    const configuration = vscode.workspace.getConfiguration('rhai')
    const useLanguageServer = configuration.get<boolean>('useLanguageServer')
    const diagnostics = vscode.languages.createDiagnosticCollection('rhai-grain')
    context.subscriptions.push(vscode.commands.registerCommand('rhai.compileGrain', (uri?: vscode.Uri) => compileGrainHandler(diagnostics, uri)))
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (document) => {
        const config = getRhaiConfig(document)
        const compileGrainOnSave = config.compileGrainOnSave
        if (isRhaiDocument(document) && compileGrainOnSave === 'currentFile') {
            await compileGrainHandler(diagnostics, document.uri)
            await promptFileNesting(config, document)
        }
    }))
    const shouldStartClient = useLanguageServer && (await is_installed('rhai-lsp'))
    if (shouldStartClient) {
        await start_client()
    } else if (useLanguageServer) {
        // tryToInstallLanguageServer(configuration)
    }
}

async function promptFileNesting(configuration: RhaiConfig, document: vscode.TextDocument) {
    const enabled = vscode.workspace.getConfiguration('explorer.fileNesting', document.uri).get<boolean>('enabled', false)
    if (!enabled && configuration.promptFileNesting && !askedNestingThisSession) {
        const result = await vscode.window.showInformationMessage('Rhai: Would you like to enable file nesting so compiled `.rgrn` files nest under their `.rhai` source?', 'Enable', 'Not this time', 'Do not ask again')
        if (result === 'Enable') {
            if (vscode.workspace.workspaceFolders?.length) {
                await vscode.workspace.getConfiguration('explorer.fileNesting', document.uri).update('enabled', true,vscode.ConfigurationTarget.Workspace)
            } else {
                await vscode.workspace.getConfiguration('explorer.fileNesting', document.uri).update('enabled', true, vscode.ConfigurationTarget.Global)
            }
        } else if (result === 'Do not ask again') {
            await vscode.workspace.getConfiguration('rhai').update('promptFileNesting', false, vscode.ConfigurationTarget.Global)
        }else {
            askedNestingThisSession = true
        }
    }
}

function isRhaiDocument(document: vscode.TextDocument) {
    return document.languageId === 'rhai' && document.uri.path.endsWith('.rhai')
}

async function compileGrainHandler(diagnostics: vscode.DiagnosticCollection, uri?: vscode.Uri) {
    const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document
    if (!document) {
        return
    }
    try {
        if (!isRhaiDocument(document)) {
            await vscode.window.showWarningMessage('Rhai: open a .rhai file to compile it to Grain')
            return
        }
        const bytes = grain.compile(document.getText())
        diagnostics.delete(document.uri)
        await vscode.workspace.fs.writeFile(document.uri.with({path: document.uri.path.replace(/\.rhai$/, '.rgrn')}), bytes)
    } catch (error) {
        const e = error as { name?: string; message: string; line?: number; column?: number }
        if (e.name !== 'GrainError') {
            await vscode.window.showErrorMessage(`Rhai: ${e.message}`)
            return
        }
        const line = (e.line ?? 1) - 1
        const col = (e.column ?? 1) - 1
        const range = new vscode.Range(line, col, line, col + 1)
        diagnostics.set(document.uri, [
            new vscode.Diagnostic(range, e.message, vscode.DiagnosticSeverity.Error),
        ])
        console.error(error)
    }
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined
    }
    return client.stop()
}
