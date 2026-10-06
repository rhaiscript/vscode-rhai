How to Build Extension from Source
=================================

Prerequisites
-------------

- Install [Node.js](https://nodejs.org)
- Install [TypeScript](https://www.typescriptlang.org)
- Install [Rust](https://rust-lang.org/tools/install/)

Add Rust target
```shell
rustup target add wasm32-unknown-unknown
```

- Install Wasm CLI
```shell
cargo install wasm-bindgen-cli
```

Fetch Node packages
-------------------

```sh
npm install
```

Build the Grain WASM module with Rust and Build the extension
---------------------------

```sh
npm run build
```
Output goes to `dist/grain`.


Run - Local Development
---------------------

Build first
```shell
npm run build
```
then from the `vscode-rhai` directory run:
```shell
# Vscode
# $PWD can be replaced by the absolute path to the `vscode-rhai` project directory
code --extensionDevelopmentPath="$PWD" path/to/rhai-project
```
This opens a new VS Code window running this checkout of the extension.

Run - Local packaging and installing extension on VSCode
----------------------------------------------
Package the extension with
```shell
npm run pack
```
This will generate a `vscode-rhai-x.x.x.vsix` extension file.
To install, run from the `vscode-rhai` directory:
```shell
code --install-extension vscode-rhai-x.x.x.vsix
```

