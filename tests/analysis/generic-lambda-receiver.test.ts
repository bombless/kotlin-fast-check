import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectDeclarations } from "../../src/analysis/DeclarationPass.js";
import { collectDiagnostics } from "../../src/analysis/Diagnostics.js";
import { collectReferences } from "../../src/analysis/ReferencePass.js";
import { resolveReferences } from "../../src/analysis/ResolutionPass.js";
import { parseKotlin } from "../../src/parser/KotlinParser.js";
import { Scope } from "../../src/resolver/Scope.js";
import { TypeResolver } from "../../src/resolver/TypeResolver.js";
import { SymbolKind, type FunctionSymbol, type Symbol } from "../../src/symbols/Symbol.js";

async function analyze(source: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kcheck-generic-receiver-"));
  const file = path.join(directory, "Main.kt");
  await writeFile(file, source.trim().replace(/^\s+/gm, ""), "utf8");
  try {
    const ast = parseKotlin(source.trim().replace(/^\s+/gm, ""));
    const declarations = collectDeclarations(ast);
    const context = {
      packageName: declarations.packageName,
      imports: declarations.imports,
      projectSymbols: declarations.symbols,
      scope: new Scope(),
      callableParameters: new Map<string, Symbol>(),
    };
    const types = new TypeResolver();
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
    return collectDiagnostics(resolveReferences(collectReferences(ast, file), context));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function unresolvedFunction(diagnostics: Array<{ code: string; message: string }>, name: string) {
  return diagnostics.filter((diagnostic) => diagnostic.code === "UNRESOLVED_FUNCTION" && diagnostic.message.includes(`'${name}'`));
}

describe("generic lambda receiver resolution", () => {
  it("derives a receiver from a real function parameter signature", async () => {
    const diagnostics = await analyze(`
      class Scope { fun member() {} }
      fun accept(block: Scope.() -> Unit) {}
      accept { member() }
    `);

    expect(unresolvedFunction(diagnostics, "member")).toHaveLength(0);
  });

  it("does not derive a receiver from an ordinary function parameter", async () => {
    const diagnostics = await analyze(`
      class Scope { fun member() {} }
      fun accept(block: (Scope) -> Unit) {}
      accept { member() }
    `);

    expect(unresolvedFunction(diagnostics, "member")).toHaveLength(1);
  });

  it("maps a trailing lambda to the final function parameter", async () => {
    const diagnostics = await analyze(`
      class Scope { fun member() {} }
      fun accept(value: Int, block: Scope.() -> Unit) {}
      accept(1) { member() }
    `);

    expect(unresolvedFunction(diagnostics, "member")).toHaveLength(0);
  });

  it("maps a receiver lambda after multiple value parameters", async () => {
    const diagnostics = await analyze(`
      class Scope { fun member() {} }
      fun accept(first: Int, second: String, block: Scope.() -> Unit) {}
      accept(1, "x") { member() }
    `);

    expect(unresolvedFunction(diagnostics, "member")).toHaveLength(0);
  });

  it("pushes and restores distinct nested receiver types", async () => {
    const diagnostics = await analyze(`
      class Unrelated { fun unrelated() {} }
      class Outer { fun outerMember() {} }
      class Inner { fun innerMember() {} }
      fun outer(block: Outer.() -> Unit) {}
      fun inner(block: Inner.() -> Unit) {}
      outer {
        outerMember()
        inner { innerMember() }
        outerMember()
      }
    `);

    expect(unresolvedFunction(diagnostics, "outerMember")).toHaveLength(0);
    expect(unresolvedFunction(diagnostics, "innerMember")).toHaveLength(0);
  });

  it("keeps callable parameters ahead of an implicit receiver member", async () => {
    const diagnostics = await analyze(`
      class Scope { fun callback() {} }
      fun test(callback: () -> Unit, block: Scope.() -> Unit) {
        block { callback() }
      }
    `);

    expect(unresolvedFunction(diagnostics, "callback")).toHaveLength(0);
  });
});
