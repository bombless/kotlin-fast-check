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
  const files = args.filter((arg) => !arg.startsWith("--"));
  if (files.length === 0) {
    console.error("Usage: kcheck <file.kt> [...files]");
    process.exitCode = 2;
    return;
  }

  let failed = false;
  for (const file of files) {
    const diagnostics = await analyzeFile(file);
    for (const diagnostic of diagnostics) console.log(formatDiagnostic(diagnostic));
    if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) failed = true;
  }

  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
