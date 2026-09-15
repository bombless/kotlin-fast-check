import { describe, expect, it } from "vitest";
import { AndroidSdk } from "../src/android/AndroidSdk.js";
import { parseKotlin } from "../src/parser/index.js";
import { collectDeclarations } from "../src/analysis/index.js";
import { TypeResolver } from "../src/resolver/TypeResolver.js";
import { ExpressionTypeResolver } from "../src/resolver/ExpressionTypeResolver.js";
import { Scope } from "../src/resolver/Scope.js";
import type { KotlinAstNode } from "../src/parser/Ast.js";

const android = new AndroidSdk("d:/android-sdk").load(35);
const types = new TypeResolver();
const expressions = new ExpressionTypeResolver();

function find(node: KotlinAstNode, type: string): KotlinAstNode | undefined {
  if (node.type === type) return node;
  for (const child of node.children) { const match = find(child, type); if (match) return match; }
  return undefined;
}

describe("ExpressionTypeResolver", () => {
  it("infers a Java getter property type", () => {
    const ast = parseKotlin(`import android.view.View\nfun foo(view: View) { val context = view.context }`);
    const index = collectDeclarations(ast);
    const context = { packageName: index.packageName, imports: index.imports, projectSymbols: index.symbols, jvmSymbols: android };
    const view = types.resolveType("View", context)!;
    const scope = new Scope();
    scope.define("view", view);
    const expression = find(ast.root, "navigation_expression")!;
    expect(expressions.resolve(expression, scope, context)?.qualifiedName).toBe("android.content.Context");
  });

  it("resolves an implicit receiver call through inheritance", () => {
    const ast = parseKotlin(`import android.app.Activity\nfun foo() { setContentView(null) }`);
    const index = collectDeclarations(ast);
    const context = { packageName: index.packageName, imports: index.imports, projectSymbols: index.symbols, jvmSymbols: android };
    const activity = types.resolveType("Activity", context)!;
    const scope = new Scope();
    const expression = find(ast.root, "call_expression")!;
    expect(expressions.resolve(expression, scope, context, activity)?.qualifiedName ?? "").toBe("void");
  });
});