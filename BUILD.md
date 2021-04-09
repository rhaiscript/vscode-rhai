How to Build Extension from Source
=================================

Prerequisites
-------------

- Install [Node.js](https://nodejs.org)

- Install [TypeScript](https://www.typescriptlang.org)

```sh
npm install -g typescript
```

- Install [VSCE](https://github.com/Microsoft/vscode-vsce)

```sh
npm install -g vsce
```

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
