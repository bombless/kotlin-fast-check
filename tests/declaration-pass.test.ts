import { describe, expect, it } from "vitest";
import { collectDeclarations } from "../src/analysis/index.js";
import { parseKotlin } from "../src/parser/index.js";
import { SymbolKind } from "../src/symbols/Symbol.js";

describe("declaration pass", () => {
  it("indexes package, types, functions, properties and imports", () => {
    const ast = parseKotlin(`
      package com.example
      import android.app.Activity
      import android.view.View as AndroidView

      class MainActivity : Activity() {
        val title: String = "x"
        fun foo(view: AndroidView) {}
      }
    `);

    const index = collectDeclarations(ast);

    expect(index.packageName).toBe("com.example");
    expect(index.imports).toEqual([
      expect.objectContaining({ path: "android.app.Activity", wildcard: false }),
      expect.objectContaining({ path: "android.view.View", alias: "AndroidView", wildcard: false }),
    ]);

    const type = index.symbols.get("com.example.MainActivity");
    expect(type).toMatchObject({ kind: SymbolKind.Class, superclass: "Activity" });
    expect(index.symbols.get("com.example.MainActivity.foo")).toMatchObject({ kind: SymbolKind.Function });
    expect(index.symbols.get("com.example.MainActivity.title")).toMatchObject({ kind: SymbolKind.Property });
  });

  it("indexes interfaces, inheritance, constructor overloads, parameters, and return types", () => {
    const ast = parseKotlin(`
      package com.example

      interface Base
      open class Parent : Base
      class Child(val name: String) : Parent() {
        val count: Int = 0
        constructor(id: Long)
        fun foo(view: View, value: Int): String = ""
      }
    `);

    const index = collectDeclarations(ast);
    const base = index.symbols.get("com.example.Base");
    const parent = index.symbols.get("com.example.Parent");
    const child = index.symbols.get("com.example.Child");

    expect(base).toMatchObject({ kind: SymbolKind.Interface, interfaces: [] });
    expect(parent).toMatchObject({ kind: SymbolKind.Class, superclass: "Base", interfaces: [] });
    expect(child).toMatchObject({ kind: SymbolKind.Class, superclass: "Parent", interfaces: [] });

    expect(index.symbols.get("com.example.Child.constructor(String)")).toMatchObject({
      kind: SymbolKind.Constructor,
      parameterTypes: ["String"],
    });
    expect(index.symbols.get("com.example.Child.constructor(Long)")).toMatchObject({
      kind: SymbolKind.Constructor,
      parameterTypes: ["Long"],
    });
    expect(index.symbols.get("com.example.Child.name")).toMatchObject({ kind: SymbolKind.Property, type: "String" });
    expect(index.symbols.get("com.example.Child.count")).toMatchObject({ kind: SymbolKind.Property, type: "Int" });

    const foo = index.symbols.get("com.example.Child.foo");
    expect(foo).toMatchObject({
      kind: SymbolKind.Function,
      parameterTypes: ["View", "Int"],
      returnType: "String",
    });
    expect((foo as { parameters: unknown[] }).parameters).toHaveLength(2);
  });

  it("indexes type aliases and nested declarations", () => {
    const ast = parseKotlin(`
      package com.example
      typealias UserId = String
      class Outer {
        class Inner
        object Factory
      }
    `);

    const index = collectDeclarations(ast);
    expect(index.symbols.get("com.example.UserId")).toMatchObject({
      kind: SymbolKind.TypeAlias,
      typeAliasTarget: "String",
    });
    expect(index.symbols.get("com.example.Outer.Inner")).toMatchObject({ kind: SymbolKind.Class });
    expect(index.symbols.get("com.example.Outer.Factory")).toMatchObject({ kind: SymbolKind.Object });
  });
});