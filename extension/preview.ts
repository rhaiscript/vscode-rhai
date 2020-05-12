import * as vscode from 'vscode'
import * as path from 'path'

export function openPreview(context: vscode.ExtensionContext) {
    const panel = vscode.window.createWebviewPanel(
        'notedown',
        'Notedown Previewing',
        {
            viewColumn: vscode.ViewColumn.Two,
            preserveFocus: true,
        },
        {
            // danger!!!
            enableScripts: true,
            //enableFindWidget: true,
            //enableCommandUris: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                // vscode.Uri.file(path.join(context.extensionPath, 'assets', 'img')),
                // vscode.Uri.file(path.join(context.extensionPath, 'assets', 'css')),
                // vscode.Uri.file(path.join(context.extensionPath, 'assets', 'js')),
            ],
        },
    )
    panel.webview.html = getWebviewContent()
}

function getWebviewContent() {
    const head = `
        <meta charset="utf-8"/>
        <title>Notedown editor</title>

        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css"/>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.css">

        <script src="https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/meting@2/dist/Meting.min.js"></script>
    `
    const body = '<p>GG</p><meting-js server="netease" type="song" id="474739593"></meting-js>'
    return `
    <!DOCTYPE html>
    <html lang="zh">
    <head>${head}</head>
    <body>${body}</body>
    </html>
`}
