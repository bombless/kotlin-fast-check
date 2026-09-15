import { describe, expect, it } from "vitest";
import { collectReferences } from "../src/analysis/ReferencePass.js";
import { resolveReferences } from "../src/analysis/ResolutionPass.js";
import { parseKotlin } from "../src/parser/index.js";
import { ProjectIndex } from "../src/project/index.js";

function resolveSource(index: ProjectIndex, source: string) {
  const ast = parseKotlin(source);
  const declarations = index.addSource("B.kt", ast);
  const references = collectReferences(ast, "B.kt");
  return resolveReferences(references, {
    packageName: declarations.packageName,
    imports: declarations.imports,
    projectSymbols: index.symbolTable,
  });
}

describe("project index", () => {
  it("resolves a cross-file type", () => {
    const index = new ProjectIndex();
    index.addSource("A.kt", parseKotlin("class Foo"));
    const resolved = resolveSource(index, "fun test(): Foo = Foo()");
    expect(resolved.filter((r) => r.reference.kind === "type" && r.reference.name === "Foo").every((r) => r.symbol)).toBe(true);
  });

  it("resolves a cross-file function and constructor", () => {
    const index = new ProjectIndex();
    index.addSource("A.kt", parseKotlin("class Foo(val id: Int)\nfun makeFoo(): Foo = Foo(1)"));
    const resolved = resolveSource(index, "fun test() { val foo = makeFoo(); Foo(1) }");
    expect(resolved.find((r) => r.reference.kind === "function" && r.reference.name === "makeFoo")?.symbol).toBeDefined();
    expect(resolved.find((r) => r.reference.kind === "constructor" && r.reference.name === "Foo")?.symbol).toBeDefined();
  });

  it("resolves same-package declarations", () => {
    const index = new ProjectIndex();
    index.addSource("A.kt", parseKotlin("package foo\nclass Foo"));
    const resolved = resolveSource(index, "package foo\nfun test(): Foo = Foo()");
    expect(resolved.filter((r) => r.reference.kind === "type" && r.reference.name === "Foo").every((r) => r.symbol)).toBe(true);
  });

  it("resolves explicitly imported declarations", () => {
    const index = new ProjectIndex();
    index.addSource("A.kt", parseKotlin("package foo\nclass Foo"));
    const resolved = resolveSource(index, "package bar\nimport foo.Foo\nfun test(): Foo = Foo()");
    expect(resolved.filter((r) => r.reference.kind === "type" && r.reference.name === "Foo").every((r) => r.symbol)).toBe(true);
  });

  it("exposes indexed declarations through qualified and simple-name lookup", () => {
    const index = new ProjectIndex();
    index.addSource("A.kt", parseKotlin("package foo\nclass Foo\nfun makeFoo(): Foo = Foo()"));
    expect(index.get("foo.Foo")).toBeDefined();
    expect(index.findTypesByName("Foo")).toHaveLength(1);
    expect(index.findFunctionsByName("makeFoo")).toHaveLength(1);
  });
});
