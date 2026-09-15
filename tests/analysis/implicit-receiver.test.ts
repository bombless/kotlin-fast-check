import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeFile } from "../../src/cli/main.js";
import { collectDeclarations } from "../../src/analysis/DeclarationPass.js";
import { collectDiagnostics } from "../../src/analysis/Diagnostics.js";
import { collectReferences } from "../../src/analysis/ReferencePass.js";
import { resolveReferences } from "../../src/analysis/ResolutionPass.js";
import { parseKotlin } from "../../src/parser/KotlinParser.js";
import { Scope } from "../../src/resolver/Scope.js";
import { TypeResolver } from "../../src/resolver/TypeResolver.js";
import { SymbolKind, type FunctionSymbol } from "../../src/symbols/Symbol.js";

async function analyze(source: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kcheck-receiver-"));
  const file = path.join(directory, "Main.kt");
  await writeFile(file, source.trim().replace(/^\s+/gm, ""), "utf8");
  try {
    return await analyzeFile(file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function resolveSource(source: string) {
  const ast = parseKotlin(source.trim().replace(/^\s+/gm, ""));
  const declarations = collectDeclarations(ast);
  const context = {
    packageName: declarations.packageName,
    imports: declarations.imports,
    projectSymbols: declarations.symbols,
    scope: new Scope(),
    callableParameters: new Map<string, import("../../src/symbols/Symbol.js").Symbol>(),
  };
  const types = new TypeResolver();
  for (const symbol of declarations.symbols.values()) {
    if (symbol.kind !== SymbolKind.Class) continue;
    const resolvedType = types.resolveType(symbol.name, context);
    if (resolvedType) context.scope.define("this", resolvedType);
    break;
  }
  for (const symbol of declarations.symbols.values()) {
    if (symbol.kind !== SymbolKind.Function) continue;
    const functionSymbol = symbol as FunctionSymbol;
    for (const parameter of functionSymbol.parameters) {
      if (parameter.type?.includes("->")) context.callableParameters.set(parameter.name, parameter);
      if (!parameter.type) continue;
      const resolvedType = types.resolveType(parameter.type, context);
      if (resolvedType) context.scope.define(parameter.name, resolvedType);
    }
  }
  return collectDiagnostics(resolveReferences(collectReferences(ast), context));
}

describe("implicit receiver context", () => {
  it("resolves calls through a receiver lambda parameter", async () => {
    const diagnostics = await analyze(`
      class Scope { fun drawSomething() {} }
      fun test(block: Scope.() -> Unit) {}
      test({ drawSomething() })
    `);

    expect(diagnostics.filter((diagnostic) => diagnostic.code === "UNRESOLVED_FUNCTION" && diagnostic.message.includes("drawSomething"))).toHaveLength(0);
  });

  it("does not turn an ordinary lambda parameter into an implicit receiver", async () => {
    const diagnostics = resolveSource(`
      class Scope { fun drawSomething() {} }
      fun test(block: (Scope) -> Unit) {}
      test({ drawSomething() })
    `);

    expect(diagnostics.filter((diagnostic) => diagnostic.code === "UNRESOLVED_FUNCTION" && diagnostic.message.includes("drawSomething"))).toHaveLength(1);
  });

  it("restores the outer receiver after a nested receiver lambda", async () => {
    const diagnostics = await analyze(`
      class Scope { fun drawSomething() {} }
      fun outer(block: Scope.() -> Unit) {}
      fun inner(block: Scope.() -> Unit) {}
      outer({
        drawSomething()
        inner({ drawSomething() })
        drawSomething()
      })
    `);

    expect(diagnostics.filter((diagnostic) => diagnostic.code === "UNRESOLVED_FUNCTION" && diagnostic.message.includes("drawSomething"))).toHaveLength(0);
  });

  it("keeps callable parameters ahead of implicit receiver members", async () => {
    const diagnostics = await analyze(`
      class Scope { fun callback() {} }
      fun test(callback: () -> Unit, block: Scope.() -> Unit) {
        block({ callback() })
      }
    `);

    expect(diagnostics.filter((diagnostic) => diagnostic.code === "UNRESOLVED_FUNCTION" && diagnostic.message.includes("callback"))).toHaveLength(0);
  });
});
