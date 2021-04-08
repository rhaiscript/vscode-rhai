Rhai Language Support for Visual Studio Code
===========================================

[![Rhai logo](https://rhai.rs/book/images/logo/rhai-banner-transparent-colour.png)](https://rhai.rs)

[Rhai](https://rhai.rs) is an embedded scripting language and evaluation engine for Rust that gives
a safe and easy way to add scripting to any application.


Features
--------

- [x] Syntax highlighting


Todo list
---------

- [ ] Auto formatter
- [ ] Language server


How to build extension from source
---------------------------------

### Prerequisites

- Install [Node.js](https://nodejs.org)

- Install [TypeScript](https://www.typescriptlang.org)

```sh
npm install -g typescript
```

- Install [VSCE](https://github.com/Microsoft/vscode-vsce)

```sh
npm install -g vsce
```

### Fetch Node packages

```sh
npm install
```

### Compile with TypeScript

```sh
tsc
```

Compiled files are in the `dist` directory.

### Build VSIX package

```sh
vsce package
```

Compiled package is `vscode-rhai-`_version_`.vsix` within the main directory.
