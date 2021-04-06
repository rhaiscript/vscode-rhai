import * as vscode from 'vscode'
import * as child_process from 'child_process'

import
    {
        LanguageClient,
        LanguageClientOptions,
        Executable,
    } from 'vscode-languageclient'


let client: LanguageClient

function start_client()
{
    let serverOptions: Executable = {
        command: 'rhai-lsp',
    }

    let clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'rhai' }],
    }

    client = new LanguageClient(
        'rhaiLanguageServer',
        'Rhai Language Server',
        serverOptions,
        clientOptions,
    )

    client.start()
}


async function is_installed(cmd: string): Promise<boolean>
{
    return new Promise<boolean>((resolve) =>
    {
        const checkCommand = process.platform === 'win32' ? 'where' : 'command -v'
        const proc = child_process.exec(`${checkCommand} ${cmd}`)
        proc.on('exit', (code) => { resolve(code === 0) })
    })
}

async function installServerBinary(): Promise<boolean>
{
    await is_installed('cargo')
    // cargo install
    // download from github
    const task = new vscode.Task(
        { type: 'cargo', task: 'install' },
        vscode.workspace.workspaceFolders![0],
        'Installing lsp server',
        'rhai-lsp',
        new vscode.ShellExecution('cargo install rhai-lsp'),
    )
    const promise = new Promise<boolean>((resolve) =>
    {
        vscode.tasks.onDidEndTask((e) =>
        {
            if (e.execution.task === task) {
                e.execution.terminate()
            }
        })
        vscode.tasks.onDidEndTaskProcess((e) =>
        {
            resolve(e.exitCode === 0)
        })
    })
    vscode.tasks.executeTask(task)

    return promise
}

async function tryToInstallLanguageServer(configuration: vscode.WorkspaceConfiguration)
{
    const selected = await vscode.window.showInformationMessage(
        'Install rhai-lsp-server (Rust toolchain required) ?',
        'Install',
        'Never',
    )
    if (selected === 'Install') {
        const installed = await installServerBinary()
        if (installed) {
            start_client()
        }
    }
    else if (selected === 'Never') {
        configuration.update('useLanguageServer', false)
    }
}

export async function activate(context: vscode.ExtensionContext)
{
    const configuration = vscode.workspace.getConfiguration('notedown')
    const useLanguageServer = configuration.get<boolean>('useLanguageServer')
    const shouldStartClient = useLanguageServer && (await is_installed('rhai-lsp'))
    if (shouldStartClient) {
        start_client()
    } else if (useLanguageServer) {
        // tryToInstallLanguageServer(configuration)
    }
}

export function deactivate(): Thenable<void> | undefined
{
    if (!client) {
        return undefined
    }
    return client.stop()
}
