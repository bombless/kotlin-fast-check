import { describe, expect, it } from "vitest";
import { parseKotlin } from "../src/parser/index.js";

describe("Kotlin parser", () => {
  it("parses the Android-oriented MVP sample without syntax errors", () => {
    const ast = parseKotlin(`
      package com.example

      import android.app.Activity
      import android.view.View

      class MyActivity : Activity() {
        fun foo(view: View) {
          setContentView(view)
          doesNotExist(view)
        }
      }
    `);

    expect(ast.hasErrors).toBe(false);
    expect(ast.root.type).toBe("source_file");
  });

  it("preserves source ranges and text", () => {
    const source = "class Foo";
    const ast = parseKotlin(source);
    const declaration = ast.root.children.find((node) => node.type === "class_declaration");

    expect(declaration).toBeDefined();
    expect(declaration?.text).toBe(source);
    expect(declaration?.range.start).toMatchObject({ row: 0, column: 0, offset: 0 });
    expect(declaration?.range.end).toMatchObject({ row: 0, column: 9, offset: 9 });
  });

  it("marks malformed input", () => {
    const ast = parseKotlin("class Foo {");
    expect(ast.hasErrors).toBe(true);
  });
});
