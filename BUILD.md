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


Run Local
---------------------

Build first (`npm run build`), then from the `vscode-rhai` directory run:
```shell
# Vscode
# $PWD can be replaced by the absolute path to the `vscode-rhai` project directory
code --extensionDevelopmentPath="$PWD" path/to/rhai-project
```
This opens a new VS Code window running this checkout of the extension.
It takes the place of any installed Rhai extension in that window.


