# kotlin-fast-check

Lightweight Kotlin source semantic checking for fast pre/post-refactoring validation. The analyzer is written in TypeScript and deliberately implements a small, useful semantic slice instead of attempting to replace the Kotlin compiler.

## Current status

**Phase 1 — Kotlin parser foundation** is implemented.

- Tree-sitter Kotlin is used for parsing; the parser is kept behind our own API.
- Source locations and source offsets are preserved in a small, compiler-independent AST model.
- Syntax errors are surfaced through `hasErrors`.
- A minimal `kcheck` CLI can parse one or more Kotlin files.
- Parser tests cover the Android-oriented MVP sample, source ranges, and malformed input.

The selected `tree-sitter-kotlin` package is the Node binding for the `fwcd/tree-sitter-kotlin` grammar. Its package metadata exposes Node bindings/types and declares `tree-sitter` as a peer dependency.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

Parse Kotlin files directly:

```bash
node dist/cli/main.js src/Main.kt
```

or, after installing the package globally/linking it:

```bash
kcheck src/Main.kt
```

## Planned architecture

```text
Kotlin sources
      |
      v
Kotlin Parser -> AST
      |
      +--> Declaration Index
      |
      +--> Reference Finder
                |
                v
          Symbol Resolver
          /      |       \
 Project      JAR      Android SDK
 symbols     symbols    (android.jar)
          \      |       /
                v
           Diagnostics
```

The semantic model will remain separate from the parser AST. Project declarations and JVM external symbols will also remain separate sources for the resolver. Android SDKs are ordinary JVM classpath inputs rather than a special Kotlin type system.

## Planned phases

1. Parser foundation — **done**
2. Project declaration index
3. JVM class/JAR symbol loader
4. Import and type resolution
5. Local scopes, expression types, and member lookup
6. Basic Java interop and constructors
7. External JARs, stdlib, and AndroidX
8. Optional Gradle classpath discovery

The first semantic milestone is resolving `Activity`, `View`, `MyActivity`, inherited `setContentView`, and reporting `doesNotExist` as an unresolved member/function at its source range.

The checker also has a regression test against the real `android-space-inspector` `MainActivity.kt`; it detects the missing local `DirStat` type definition as `UNRESOLVED_TYPE`. Common Kotlin standard-library types such as `String`, `List`, `ArrayList`, `ArrayDeque`, and `Throwable` are recognized without requiring an external classpath.
