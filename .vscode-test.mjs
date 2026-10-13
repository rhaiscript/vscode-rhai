// See https://code.visualstudio.com/api/working-with-extensions/testing-extension
import { defineConfig } from '@vscode/test-cli'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

const TMP_PREFIX = 'vscode-rhai-test-'

// Clean up dir
for (const entry of fs.readdirSync(os.tmpdir())) {
    const dir = path.join(os.tmpdir(), entry)
    if (entry.startsWith(TMP_PREFIX) && Date.now() - fs.statSync(dir).mtimeMs > 60 * 60 * 1000) {
        fs.rmSync(dir, { recursive: true, force: true })
    }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX))
const workspaceFolder = path.join(tmp, 'workspace')
const userDataDir = path.join(tmp, 'user-data')
fs.cpSync(path.join(root, 'test', 'fixtures', 'workspace'), workspaceFolder, { recursive: true })

export default defineConfig({
    label: 'integration',
    files: 'dist/test/**/*.test.js',
    workspaceFolder,
    launchArgs: [
        '--disable-extensions',
        `--user-data-dir=${userDataDir}`,
    ],
    mocha: {
        ui: 'tdd',
        timeout: 20000,
    },
})
