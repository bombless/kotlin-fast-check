import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectDeclarations } from "../src/analysis/DeclarationPass.js";
import { collectDiagnostics } from "../src/analysis/Diagnostics.js";
import { collectReferences } from "../src/analysis/ReferencePass.js";
import { resolveReferences } from "../src/analysis/ResolutionPass.js";
import { parseKotlin } from "../src/parser/index.js";
import { ProjectIndexCache } from "../src/project/index.js";

const fixtureRoot = path.resolve("tests/fixtures/project-index-cache");

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

function resolveSource(index: Awaited<ReturnType<ProjectIndexCache["getOrCreate"]>>, source: string) {
  const ast = parseKotlin(source);
  const declarations = collectDeclarations(ast);
  const references = collectReferences(ast, "__query__.kt");
  return resolveReferences(references, {
    packageName: declarations.packageName,
    imports: declarations.imports,
    projectSymbols: index.symbolTable,
  });
}

describe("ProjectIndexCache", () => {
  it("reuses the same index when source content is unchanged", async () => {
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(path.join(fixtureRoot, "A.kt"), "class Foo\n");

    const cache = new ProjectIndexCache();
    const first = await cache.getOrCreate(fixtureRoot);
    const second = await cache.getOrCreate(fixtureRoot);

    expect(second).toBe(first);
    expect(cache.size).toBe(1);
  });

  it("invalidates when source content changes", async () => {
    await mkdir(fixtureRoot, { recursive: true });
    const file = path.join(fixtureRoot, "A.kt");
    await writeFile(file, "class Foo\n");

    const cache = new ProjectIndexCache();
    const first = await cache.getOrCreate(fixtureRoot);
    await writeFile(file, "class Bar\n");
    const second = await cache.getOrCreate(fixtureRoot);

    expect(second).not.toBe(first);
    expect(second.get("Bar")).toBeDefined();
    expect(second.get("Foo")).toBeUndefined();
  });

  it("invalidates when a source file is added", async () => {
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(path.join(fixtureRoot, "A.kt"), "class Foo\n");

    const cache = new ProjectIndexCache();
    const first = await cache.getOrCreate(fixtureRoot);
    await writeFile(path.join(fixtureRoot, "B.kt"), "class Bar\n");
    const second = await cache.getOrCreate(fixtureRoot);

    expect(second).not.toBe(first);
    expect(second.get("Foo")).toBeDefined();
    expect(second.get("Bar")).toBeDefined();
  });

  it("invalidates when a source file is deleted", async () => {
    await mkdir(fixtureRoot, { recursive: true });
    const file = path.join(fixtureRoot, "A.kt");
    await writeFile(file, "class Foo\n");
    await writeFile(path.join(fixtureRoot, "B.kt"), "class Bar\n");

    const cache = new ProjectIndexCache();
    const first = await cache.getOrCreate(fixtureRoot);
    await rm(file);
    const second = await cache.getOrCreate(fixtureRoot);

    expect(second).not.toBe(first);
    expect(second.get("Foo")).toBeUndefined();
    expect(second.get("Bar")).toBeDefined();
  });

  it("preserves resolution semantics after cache reuse", async () => {
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(path.join(fixtureRoot, "A.kt"), "package foo\nclass Foo\nfun makeFoo(): Foo = Foo()\n");

    const cache = new ProjectIndexCache();
    const first = await cache.getOrCreate(fixtureRoot);
    const second = await cache.getOrCreate(fixtureRoot);
    const source = "package foo\nfun test(): Foo { makeFoo(); doesNotExist() }\n";

    const firstResults = resolveSource(first, source);
    const secondResults = resolveSource(second, source);

    expect(second).toBe(first);
    expect(secondResults.map((result) => [result.reference.kind, result.reference.name, result.symbol?.qualifiedName])).toEqual(
      firstResults.map((result) => [result.reference.kind, result.reference.name, result.symbol?.qualifiedName]),
    );
    expect(collectDiagnostics(secondResults)).toEqual(collectDiagnostics(firstResults));
  });
});
