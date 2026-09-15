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
});
