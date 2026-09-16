# kcheck

Fast, lightweight Kotlin source checking for the moments when you want compiler-like feedback without waiting for a full Android/Gradle build.

`kcheck` is a TypeScript-based Kotlin analyzer. It parses Kotlin source, builds a semantic model, resolves project and JVM symbols, and reports diagnostics with source locations. The goal is to make Kotlin refactoring and source inspection fast enough to use continuously while you work.

## Two ways to use kcheck

### 1. VS Code — one click from the status bar

The primary editor experience is a VS Code extension with a small status-bar icon.

Open a Kotlin project in VS Code, click the `kcheck` status-bar icon, and the extension runs the checker and shows its output directly in the **Output** panel. No terminal command is required for the normal workflow.

The intended experience is:

```text
Open Kotlin project
      |
      v
Click kcheck in the VS Code status bar
      |
      v
Run the checker
      |
      v
Show diagnostics and analysis output in Output
```

The extension is designed to stay lightweight: the analyzer remains a standalone CLI/library, while the VS Code layer provides editor integration and a convenient entry point.

### 2. npm — install the CLI globally

The same analyzer is also distributed as an npm package so it can be used from any terminal:

```bash
npm install -g kcheck
```

Then run it against a Kotlin source file:

```bash
kcheck path/to/MainActivity.kt
```

This makes `kcheck` useful in scripts, local refactoring workflows, CI jobs, and editor integrations beyond VS Code.

## What kcheck is for

- Fast pre/post-refactoring validation of Kotlin source.
- Finding unresolved types, functions, properties, and members without requiring a complete Android build.
- Inspecting Android-oriented Kotlin source quickly.
- Providing a reusable semantic-checking engine for both the CLI and editor integrations.
- Keeping diagnostics tied to precise source locations so they can be consumed by tools and UIs.

`kcheck` is intentionally **not** a replacement for the Kotlin compiler or Gradle. It focuses on a useful semantic slice that can run quickly and incrementally.

## Current status

The parser and semantic-analysis foundation is implemented and actively being expanded.

- Tree-sitter Kotlin provides the parsing layer.
- Source locations and offsets are preserved through the internal AST model.
- Syntax errors are surfaced through parser diagnostics.
- The `kcheck` CLI can analyze Kotlin files directly.
- Project declarations and JVM/external symbols can participate in resolution.
- Kotlin standard-library symbols used by common source patterns are recognized without requiring a complete external classpath.
- Regression coverage includes a real Android-oriented `MainActivity.kt`.

The current analyzer is already useful as a command-line checker; the next product layer is the VS Code extension and npm distribution described above.

## Architecture

```text
                         +----------------------+
                         |      VS Code         |
                         |  status-bar action   |
                         +----------+-----------+
                                    |
                                    v
+-------------+             +------------------+
| npm / CLI   +------------>|  kcheck engine   |
| `kcheck ...`|             +--------+---------+
+-------------+                      |
                                     v
                              Kotlin Parser
                                     |
                                     v
                                    AST
                                     |
                    +----------------+----------------+
                    |                |                |
                    v                v                v
             Declaration       Reference         Type / Scope
                Index             Finder           Analysis
                    \                |                /
                     +---------------+---------------+
                                     |
                                     v
                              Symbol Resolver
                           /         |          \
                    Project       JVM/JAR      Android SDK
                    symbols       symbols        symbols
                           \         |          /
                            +--------+---------+
                                     |
                                     v
                                Diagnostics
                                     |
                         +-----------+-----------+
                         |                       |
                         v                       v
                    CLI output              VS Code Output
```

The semantic model stays separate from the parser AST. Project declarations and JVM external symbols are separate inputs to the resolver, allowing the same analysis engine to serve the CLI and editor integrations.

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run TypeScript checks:

```bash
npm run typecheck
```

Build the CLI:

```bash
npm run build
```

Run the development CLI directly:

```bash
node dist/cli/main.js path/to/Main.kt
```

## Roadmap

### Analyzer

1. Kotlin parser foundation — done
2. Project declaration index — in progress
3. JVM class/JAR symbol loading
4. Import and type resolution
5. Local scopes, expression types, and member lookup
6. Java interop and constructors
7. External JARs, Kotlin stdlib, and AndroidX
8. Optional Gradle classpath discovery
9. Faster incremental analysis for editor workflows

### VS Code extension

1. Add a `kcheck` status-bar item.
2. Run the analyzer against the current workspace/project.
3. Open or focus a dedicated `kcheck` Output channel when the status-bar item is clicked.
4. Stream analyzer output and diagnostics into that channel.
5. Add workspace-aware configuration and project/classpath discovery.
6. Evolve diagnostics toward native VS Code problem integration where useful.

### npm package

1. Publish the CLI as `kcheck` on npm.
2. Support `npm install -g kcheck` and the `kcheck` executable.
3. Keep the CLI independently usable from the VS Code extension.
4. Provide a stable programmatic API so other integrations can reuse the analyzer.

## Example

Analyze an Android activity directly:

```bash
kcheck app/src/main/java/com/example/spaceinspector/MainActivity.kt
```

Or install once and use it anywhere:

```bash
npm install -g kcheck
kcheck app/src/main/java/com/example/spaceinspector/MainActivity.kt
```

In VS Code, the long-term workflow is simply to click the **kcheck** icon in the status bar and inspect the result in the **Output** window.

## Project vision

`kcheck` is intended to become a small, fast Kotlin analysis engine with two first-class distribution surfaces:

- **VS Code:** a frictionless one-click developer experience through the status bar and Output panel.
- **npm:** a globally installable CLI available through `npm install -g kcheck`.

Both surfaces should share the same analyzer rather than maintaining separate implementations. That keeps the command line, editor integration, automation, and future tooling consistent as Kotlin semantic analysis grows.
