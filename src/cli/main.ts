#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { collectDeclarations } from "../analysis/DeclarationPass.js";
import { collectDiagnostics, type Diagnostic } from "../analysis/Diagnostics.js";
import { collectReferences } from "../analysis/ReferencePass.js";
import { resolveReferences } from "../analysis/ResolutionPass.js";
import { parseKotlin } from "../parser/KotlinParser.js";

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

export async function analyzeFile(file: string): Promise<Diagnostic[]> {
  const source = await readFile(file, "utf8");
  const ast = parseKotlin(source);
  if (ast.hasErrors) return [];

  const declarations = collectDeclarations(ast);
  const references = collectReferences(ast, file);
  const resolved = resolveReferences(references, {
    packageName: declarations.packageName,
    imports: declarations.imports,
    projectSymbols: declarations.symbols,
  });
  return collectDiagnostics(resolved);
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  let format: "human" | "json" = "human";
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
    if (arg.startsWith("--")) continue;
    files.push(arg);
  }

  if (files.length === 0) {
    console.error("Usage: kcheck [--format human|json] <file.kt> [...files]");
    process.exitCode = 2;
    return;
  }

  let failed = false;
  const allDiagnostics: Diagnostic[] = [];
  for (const file of files) {
    const diagnostics = await analyzeFile(file);
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
