import { describe, expect, it } from "vitest";
import { AndroidSdk } from "../src/android/AndroidSdk.js";
import { MemberResolver } from "../src/resolver/MemberResolver.js";
import { ConstructorResolver } from "../src/resolver/ConstructorResolver.js";
import { TypeResolver } from "../src/resolver/TypeResolver.js";
import { collectDeclarations } from "../src/analysis/index.js";
import { parseKotlin } from "../src/parser/index.js";

const android = new AndroidSdk("d:/android-sdk").load(35);
const types = new TypeResolver();
const members = new MemberResolver();
const constructors = new ConstructorResolver();

describe("member and constructor resolution", () => {
  it("resolves inherited Activity methods", () => {
    const index = collectDeclarations(parseKotlin(`package com.example\nimport android.app.Activity`));
    const context = { packageName: index.packageName, imports: index.imports, projectSymbols: index.symbols, jvmSymbols: android };
    const activity = types.resolveType("Activity", context)!;
    expect(members.resolveMethod(activity, "setContentView", context, 1)).toMatchObject({ name: "setContentView" });
  });

  it("resolves Java getters as Kotlin properties", () => {
    const index = collectDeclarations(parseKotlin(`package com.example\nimport android.view.View`));
    const context = { packageName: index.packageName, imports: index.imports, projectSymbols: index.symbols, jvmSymbols: android };
    const view = types.resolveType("View", context)!;
    expect(members.resolveProperty(view, "context", context)).toMatchObject({ name: "getContext" });
    expect(members.resolveProperty(view, "VISIBLE", context)).toMatchObject({ name: "VISIBLE" });
  });

  it("resolves JVM constructors by arity", () => {
    const index = collectDeclarations(parseKotlin(`package com.example\nimport android.view.View`));
    const context = { packageName: index.packageName, imports: index.imports, projectSymbols: index.symbols, jvmSymbols: android };
    const view = types.resolveType("View", context)!;
    expect(constructors.resolveConstructor(view, context, 1)).toBeDefined();
  });
});