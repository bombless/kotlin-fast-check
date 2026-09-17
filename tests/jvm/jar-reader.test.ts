import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { JvmSymbolIndex, readJar } from "../../src/jvm/JarReader.js";
import type { JvmClassSymbol } from "../../src/jvm/JvmSymbols.js";

const fixture = fileURLToPath(new URL("./fixtures/example.jar", import.meta.url));

describe("JarReader", () => {
  it("indexes class files from a jar", () => {
    const index = readJar(fixture);
    expect(index.getClass("fixtures.Example")).toBeDefined();
    expect(index.getMethod("fixtures.Example", "names")).toMatchObject({ name: "names" });
    expect(index.getField("fixtures.Example", "VISIBLE")).toMatchObject({ type: "int" });
  });

  it("preserves method candidate order while using the name index", () => {
    const method = (name: string, descriptor: string) => ({
      name,
      descriptor,
      parameterTypes: [],
      returnType: "V",
      accessFlags: 0,
      static: true,
      abstract: false,
      constructor: false,
    });
    const classA: JvmClassSymbol = {
      name: "A", qualifiedName: "pkg.A", accessFlags: 0, interfaces: [], fields: [], constructors: [],
      methods: [method("foo", "()V"), method("bar", "()V")],
    };
    const classB: JvmClassSymbol = {
      name: "B", qualifiedName: "pkg.B", accessFlags: 0, interfaces: [], fields: [], constructors: [],
      methods: [method("foo-impl", "()V"), method("foo", "(I)V")],
    };
    const index = new JvmSymbolIndex();
    index.addAll([classA, classB]);

    expect(index.getClasses("pkg", "A")).toEqual([classA]);
    expect(index.getClasses("pkg", "Missing")).toEqual([]);
    expect(index.findMethods("foo").map(({ className, method }) => `${className}.${method.name}`))
      .toEqual(["pkg.A.foo", "pkg.B.foo-impl", "pkg.B.foo"]);
    expect(index.findMethods("foo", "pkg")).toHaveLength(3);
    expect(index.findMethods("").map(({ className, method }) => `${className}.${method.name}`))
      .toEqual(["pkg.A.foo", "pkg.A.bar", "pkg.B.foo-impl", "pkg.B.foo"]);
  });
});