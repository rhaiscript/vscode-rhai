How to Build Extension from Source
=================================

Prerequisites
-------------

- Install [Node.js](https://nodejs.org)

- Install [TypeScript](https://www.typescriptlang.org)
- Install [Rust](https://rust-lang.org/tools/install/)

```sh
npm install -g typescript
```

- Install [VSCE](https://github.com/Microsoft/vscode-vsce)

```sh
npm install -g vsce
```

- Add Rust target
```shell
rustup target add wasm32-unknown-unknown
```

- Install Wasm CLI
```shell
cargo install wasm-bindgen-cli
```


Build the Grain WASM module
---------------------------

```sh
npm run build:wasm
```
Output goes to `dist/grain`.


Fetch Node packages
-------------------

```sh
npm install
```

Compile with TypeScript
-----------------------

```sh
tsc
```

Compiled files are in the `dist` directory.

Build VSIX package
------------------

```sh
vsce package
```

Compiled package is `vscode-rhai-`_version_`.vsix` within the main directory.


