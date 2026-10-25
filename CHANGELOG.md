Version 0.7.2
=============

* Improved error reporting for rhai files.

Version 0.7.1
=============

* Added bare metal syntax check on rhai files support.
* Default bare metal syntax check to on

Version 0.7.0
=============

* Added Grain Bytecode Compiler support
* Added compile on save for bytecode
* Added inline Grain compilation errors in rhai files
* Added bytecode file nested under rhai files
* Added support for CICD
* Added integration testing
* Updated typescript dependencies

Version 0.6.9
=============

* Fixed highlighting for dot-separated property access.

Version 0.6.8
=============

* Add Rhai icon.

Version 0.6.7
=============

* Fixed recognition for `..=` (inclusive range) operator.
* Fixed parsing for `|` in `switch` case conditions (previously parses as a closure).
* White-spaces no longer highlights.


Version 0.6.6
=============

* Add the range operator `..`
* Add elvis operators.


Version 0.6.5
=============

* Fix Highlighting styles of `private` and `fn`.
* Recognize `Fn` as a reserved keyword.


Version 0.6.4
=============

* Remove keywords that are no longer reserved.


Version 0.6.3
=============

* Support untrusted workspaces.
* Refine styling of automatic `global` modules.
