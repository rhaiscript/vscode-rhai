import * as child_process from 'child_process'
import {compileRhaiHandler, compileGrainHandler, isRhaiDocument} from "./handlers"
import * as vscode from "vscode";

import
{
    LanguageClient,
    LanguageClientOptions,
    Executable,
} from 'vscode-languageclient/node'


let client: LanguageClient
let askedNestingThisSession: boolean = false
let syntaxCheckRhaiTimeout: NodeJS.Timeout | undefined = undefined;

type CompileGrainOnSave = 'off' | 'currentFile';
type SyntaxCheckRhaiOnChange = 'off' | 'currentFile';

interface RhaiConfig {
    useLanguageServer: boolean
    compileGrainOnSave: CompileGrainOnSave,
    syntaxCheckRhaiOnChange: SyntaxCheckRhaiOnChange,
    syntaxCheckRhaiDelaySeconds: number,
    promptFileNesting: boolean,
}

function getRhaiConfig(scope?: vscode.ConfigurationScope): RhaiConfig {
    const c = vscode.workspace.getConfiguration('rhai', scope)
    return {
        useLanguageServer: c.get('useLanguageServer', true),
        compileGrainOnSave: c.get('compileGrainOnSave', 'off'),
        syntaxCheckRhaiOnChange: c.get('syntaxCheckRhaiOnChange', 'currentFile'),
        syntaxCheckRhaiDelaySeconds: c.get('syntaxCheckRhaiDelaySeconds', 3),
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
    const diagnostics = vscode.languages.createDiagnosticCollection('rhai')
    context.subscriptions.push(vscode.commands.registerCommand('rhai.compileGrain', (uri?: vscode.Uri) => compileGrainHandler(diagnostics, uri)))
    context.subscriptions.push(vscode.commands.registerCommand('rhai.syntaxCheckRhai', (uri?: vscode.Uri) => compileRhaiHandler(diagnostics, uri)))
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (document) => {
        const config = getRhaiConfig(document)
        const compileGrainOnSave = config.compileGrainOnSave
        if (isRhaiDocument(document) && compileGrainOnSave === 'currentFile') {
            await compileGrainHandler(diagnostics, document.uri)
            await promptFileNesting(config, document)
        }
    }))
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument( (docsChangeEvent: vscode.TextDocumentChangeEvent) => {
        const config = getRhaiConfig(docsChangeEvent.document)
        const timeoutSecs = config.syntaxCheckRhaiDelaySeconds;
        const syntaxCheckRhaiOnChange = config.syntaxCheckRhaiOnChange
        if (isRhaiDocument(docsChangeEvent.document) && syntaxCheckRhaiOnChange === 'currentFile') {
            if (syntaxCheckRhaiTimeout) {
                clearTimeout(syntaxCheckRhaiTimeout)
            }
            syntaxCheckRhaiTimeout = setTimeout(
                 () => {
                     void compileRhaiHandler(diagnostics, docsChangeEvent.document.uri)
                }, timeoutSecs * 1000,
            )
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



export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined
    }
    return client.stop()
}

// Only used by the integration tests, which share this module instance with the extension host.
export function resetSessionStateForTests() {
    askedNestingThisSession = false
}
