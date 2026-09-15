#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectDeclarations } from "../analysis/DeclarationPass.js";
import { collectDiagnostics, type Diagnostic } from "../analysis/Diagnostics.js";
import { collectReferences } from "../analysis/ReferencePass.js";
import { resolveReferences } from "../analysis/ResolutionPass.js";
import { AndroidSdk } from "../android/AndroidSdk.js";
import { parseKotlin } from "../parser/KotlinParser.js";
import { Scope } from "../resolver/Scope.js";
import { TypeResolver } from "../resolver/TypeResolver.js";
import { SymbolKind, type FunctionSymbol } from "../symbols/Symbol.js";
import { IndexedJvmSymbolProvider, JarReader, JvmSymbolIndex, type JvmSymbolProvider } from "../jvm/index.js";

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const file = diagnostic.file ?? "<unknown>";
  return `${file}:${diagnostic.range.start.row + 1}:${diagnostic.range.start.column + 1} ${diagnostic.severity} ${diagnostic.code}\n${diagnostic.message}`;
}

export interface JsonDiagnostic {
  file: string;
  code: Diagnostic["code"];
  severity: Diagnostic["severity"];
  message: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

export function formatDiagnosticJson(diagnostic: Diagnostic): JsonDiagnostic {
  return {
    file: diagnostic.file ?? "<unknown>",
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    range: {
      start: {
        line: diagnostic.range.start.row + 1,
        column: diagnostic.range.start.column + 1,
      },
      end: {
        line: diagnostic.range.end.row + 1,
        column: diagnostic.range.end.column + 1,
      },
    },
  };
}

export function loadClasspath(classpath: string): JvmSymbolProvider {
  const entries = classpath.split(path.delimiter);
  if (!classpath || entries.some((entry) => !entry.trim())) {
    throw new Error("Invalid --classpath value; entries must not be empty");
  }

  const index = new JvmSymbolIndex();
  const reader = new JarReader();
  for (const entry of entries) {
    index.addAll(reader.read(path.resolve(entry)).values());
  }
  return new IndexedJvmSymbolProvider(index);
}

export async function analyzeFile(file: string, jvmSymbols?: JvmSymbolProvider): Promise<Diagnostic[]> {
  const source = await readFile(file, "utf8");
  const ast = parseKotlin(source);
  if (ast.hasErrors) return [];

  const declarations = collectDeclarations(ast);
  const references = collectReferences(ast, file);
  const context = {
    packageName: declarations.packageName,
    imports: declarations.imports,
    projectSymbols: declarations.symbols,
    jvmSymbols,
    scope: new Scope(),
  };
  const typeResolver = new TypeResolver();
  for (const symbol of declarations.symbols.values()) {
    if (symbol.kind !== "class") continue;
    const resolvedType = typeResolver.resolveType(symbol.name, context);
    if (resolvedType) context.scope.define("this", resolvedType);
    break;
  }
  for (const symbol of declarations.symbols.values()) {
    if (symbol.kind !== SymbolKind.Function) continue;
    const functionSymbol = symbol as FunctionSymbol;
    for (const parameter of functionSymbol.parameters) {
      if (!parameter.type) continue;
      const resolvedType = typeResolver.resolveType(parameter.type, context);
      if (resolvedType) context.scope.define(parameter.name, resolvedType);
    }
  }
  const resolved = resolveReferences(references, context);
  return collectDiagnostics(resolved);
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  let format: "human" | "json" = "human";
  let classpath: string | undefined;
  let androidSdk: string | undefined;
  let androidApi: number | undefined;
  const files: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--format") {
      const value = args[index + 1];
      if (value !== "human" && value !== "json") {
        console.error("Invalid --format value; expected 'human' or 'json'");
        process.exitCode = 2;
        return;
      }
      format = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--format=")) {
      const value = arg.slice("--format=".length);
      if (value !== "human" && value !== "json") {
        console.error("Invalid --format value; expected 'human' or 'json'");
        process.exitCode = 2;
        return;
      }
      format = value;
      continue;
    }
    if (arg === "--classpath") {
      const value = args[index + 1];
      if (value === undefined) {
        console.error("Missing --classpath value");
        process.exitCode = 2;
        return;
      }
      classpath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--classpath=")) {
      classpath = arg.slice("--classpath=".length);
      continue;
    }
    if (arg === "--android-sdk") {
      const value = args[index + 1];
      if (value === undefined) {
        console.error("Missing --android-sdk value");
        process.exitCode = 2;
        return;
      }
      androidSdk = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--android-sdk=")) {
      androidSdk = arg.slice("--android-sdk=".length);
      continue;
    }
    if (arg === "--api") {
      const value = args[index + 1];
      const parsed = value === undefined ? NaN : Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        console.error("Invalid --api value; expected a positive API level");
        process.exitCode = 2;
        return;
      }
      androidApi = parsed;
      index += 1;
      continue;
    }
    if (arg.startsWith("--api=")) {
      const parsed = Number(arg.slice("--api=".length));
      if (!Number.isInteger(parsed) || parsed < 1) {
        console.error("Invalid --api value; expected a positive API level");
        process.exitCode = 2;
        return;
      }
      androidApi = parsed;
      continue;
    }
    if (arg.startsWith("--")) continue;
    files.push(arg);
  }

  if (files.length === 0) {
    console.error("Usage: kcheck [--format human|json] [--classpath <jar>[<separator><jar>...]] [--android-sdk <sdk>] [--api <level>] <file.kt> [...files]");
    process.exitCode = 2;
    return;
  }

  let jvmSymbols: JvmSymbolProvider | undefined;
  if (classpath !== undefined) {
    try {
      jvmSymbols = loadClasspath(classpath);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
      return;
    }
  }

  if (androidSdk !== undefined || androidApi !== undefined) {
    if (androidApi === undefined) {
      console.error("Missing --api value; specify the Android API level explicitly");
      process.exitCode = 2;
      return;
    }
    if (classpath !== undefined) {
      console.error("--android-sdk/--api cannot be combined with --classpath");
      process.exitCode = 2;
      return;
    }
    const sdk = new AndroidSdk(androidSdk);
    if (!sdk.root) {
      console.error("Android SDK not configured; use --android-sdk <path> or set ANDROID_SDK_ROOT/ANDROID_HOME");
      process.exitCode = 2;
      return;
    }
    try {
      const index = sdk.load(androidApi);
      jvmSymbols = {
        getClass: (name) => index.getClass(name),
        getMethod: (className, methodName) => index.getMethod(className, methodName),
        getField: (className, fieldName) => index.getField(className, fieldName),
      };
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
      return;
    }
  }

  let failed = false;
  const allDiagnostics: Diagnostic[] = [];
  for (const file of files) {
    const diagnostics = await analyzeFile(file, jvmSymbols);
    allDiagnostics.push(...diagnostics);
    if (format === "human") {
      for (const diagnostic of diagnostics) console.log(formatDiagnostic(diagnostic));
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) failed = true;
  }

  if (format === "json") console.log(JSON.stringify(allDiagnostics.map(formatDiagnosticJson), null, 2));

  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
