import { describe, expect, it } from "vitest";
import { AndroidSdk } from "../src/android/AndroidSdk.js";
import { collectDeclarations } from "../src/analysis/index.js";
import { parseKotlin } from "../src/parser/index.js";
import { TypeResolver } from "../src/resolver/TypeResolver.js";

const android = new AndroidSdk("d:/android-sdk").load(35);
const resolver = new TypeResolver();

describe("TypeResolver", () => {
  it("resolves explicit and aliased imports against android.jar", () => {
    const index = collectDeclarations(parseKotlin(`
      package com.example
      import android.view.View as AndroidView
      import android.app.Activity
    `));
    const context = { packageName: index.packageName, imports: index.imports, projectSymbols: index.symbols, jvmSymbols: android };
    expect(resolver.resolveType("AndroidView", context)?.qualifiedName).toBe("android.view.View");
    expect(resolver.resolveType("Activity", context)?.qualifiedName).toBe("android.app.Activity");
  });

  it("resolves wildcard imports and fully qualified JVM names", () => {
    const index = collectDeclarations(parseKotlin(`package com.example\nimport android.view.*`));
    const context = { packageName: index.packageName, imports: index.imports, projectSymbols: index.symbols, jvmSymbols: android };
    expect(resolver.resolveType("View", context)?.qualifiedName).toBe("android.view.View");
    expect(resolver.resolveType("android.content.Context", context)?.qualifiedName).toBe("android.content.Context");
  });

  it("prefers a project type in the current package", () => {
    const project = collectDeclarations(parseKotlin(`package com.example\nclass Foo`));
    const context = { packageName: project.packageName, imports: [], projectSymbols: project.symbols, jvmSymbols: android };
    expect(resolver.resolveType("Foo", context)?.qualifiedName).toBe("com.example.Foo");
  });
});