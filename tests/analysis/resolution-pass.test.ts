import { describe, expect, it } from "vitest";
import { ResolutionPass } from "../../src/analysis/ResolutionPass.js";
import type { SymbolReference } from "../../src/analysis/ReferencePass.js";
import { Scope } from "../../src/resolver/Scope.js";
import { SymbolKind, type FunctionSymbol, type PropertySymbol, type TypeSymbol } from "../../src/symbols/Symbol.js";
import { SymbolTable } from "../../src/symbols/SymbolTable.js";

const range = {
  start: { row: 0, column: 0, offset: 0 },
  end: { row: 0, column: 1, offset: 1 },
};

function ref(kind: SymbolReference["kind"], name: string, receiver?: SymbolReference): SymbolReference {
  return { kind, name, range, receiver };
}

function context(symbols: SymbolTable, scope?: Scope) {
  return { packageName: "", imports: [], projectSymbols: symbols, scope };
}

describe("ResolutionPass", () => {
  it("resolves and rejects types", () => {
    const symbols = new SymbolTable();
    const known: TypeSymbol = { name: "Known", qualifiedName: "Known", kind: SymbolKind.Class, interfaces: [], members: [] };
    symbols.add(known);

    const results = new ResolutionPass().resolve([ref("type", "Known"), ref("type", "Missing")], context(symbols));
    expect(results[0].symbol).toBe(known);
    expect(results[1].symbol).toBeUndefined();
  });

  it("resolves top-level functions and rejects missing functions", () => {
    const symbols = new SymbolTable();
    const fn: FunctionSymbol = {
      name: "top", qualifiedName: "top", kind: SymbolKind.Function,
      parameterTypes: [], parameterTypeRefs: [], parameters: [],
    };
    symbols.add(fn);

    const results = new ResolutionPass().resolve([ref("function", "top"), ref("function", "missing")], context(symbols));
    expect(results[0].symbol).toBe(fn);
    expect(results[1].symbol).toBeUndefined();
  });

  it("resolves members from a scoped receiver", () => {
    const symbols = new SymbolTable();
    const value: PropertySymbol = { name: "value", qualifiedName: "Foo.value", kind: SymbolKind.Property, type: "Int" };
    const foo: TypeSymbol = { name: "Foo", qualifiedName: "Foo", kind: SymbolKind.Class, interfaces: [], members: [value] };
    symbols.add(foo);
    symbols.add(value);
    const scope = new Scope();
    scope.define("foo", foo);

    const results = new ResolutionPass().resolve([
      ref("member", "value", ref("property", "foo")),
      ref("member", "missing", ref("property", "foo")),
    ], context(symbols, scope));
    expect(results[0].symbol).toBe(value);
    expect(results[1].symbol).toBeUndefined();
  });

  it("resolves constructors and rejects unknown constructors", () => {
    const symbols = new SymbolTable();
    const ctor = { name: "Foo", qualifiedName: "Foo.constructor()", kind: SymbolKind.Constructor, parameterTypes: [], parameterTypeRefs: [] } as const;
    const foo: TypeSymbol = { name: "Foo", qualifiedName: "Foo", kind: SymbolKind.Class, interfaces: [], members: [ctor] };
    symbols.add(foo);
    symbols.add(ctor);

    const results = new ResolutionPass().resolve([ref("constructor", "Foo"), ref("constructor", "Missing")], context(symbols));
    expect(results[0].symbol).toBe(ctor);
    expect(results[1].symbol).toBeUndefined();
  });

  it("resolves inherited members through MemberResolver", () => {
    const symbols = new SymbolTable();
    const inherited: FunctionSymbol = {
      name: "run", qualifiedName: "Parent.run", kind: SymbolKind.Function,
      parameterTypes: [], parameterTypeRefs: [], parameters: [],
    };
    const parent: TypeSymbol = { name: "Parent", qualifiedName: "Parent", kind: SymbolKind.Class, interfaces: [], members: [inherited] };
    const child: TypeSymbol = { name: "Child", qualifiedName: "Child", kind: SymbolKind.Class, superclass: "Parent", interfaces: [], members: [] };
    symbols.add(parent);
    symbols.add(inherited);
    symbols.add(child);
    const scope = new Scope();
    scope.define("child", child);

    const result = new ResolutionPass().resolve([ref("member", "run", ref("property", "child"))], context(symbols, scope))[0];
    expect(result.symbol).toBe(inherited);
  });

  it("resolves imports and rejects unresolved imports", () => {
    const symbols = new SymbolTable();
    const imported: TypeSymbol = { name: "Foo", qualifiedName: "pkg.Foo", kind: SymbolKind.Class, interfaces: [], members: [] };
    symbols.add(imported);
    const ctx = { packageName: "", imports: [{ path: "pkg.Foo", wildcard: false, range }], projectSymbols: symbols };

    const results = new ResolutionPass().resolve([ref("import", "Foo"), ref("import", "Missing")], ctx);
    expect(results[0].symbol).toBe(imported);
    expect(results[1].symbol).toBeUndefined();
  });
});
