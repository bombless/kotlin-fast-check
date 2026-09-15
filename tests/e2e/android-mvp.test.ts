import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { AndroidSdk } from "../../src/android/AndroidSdk.js";
import { collectDeclarations } from "../../src/analysis/DeclarationPass.js";
import { collectDiagnostics } from "../../src/analysis/Diagnostics.js";
import { collectReferences } from "../../src/analysis/ReferencePass.js";
import { resolveReferences } from "../../src/analysis/ResolutionPass.js";
import { parseKotlin } from "../../src/parser/KotlinParser.js";
import { Scope } from "../../src/resolver/Scope.js";
import { TypeResolver } from "../../src/resolver/TypeResolver.js";

const sdkRoot = fileURLToPath(new URL("../android-sdk", import.meta.url));

const source = `import android.app.Activity
import android.view.View

class MyActivity : Activity() {
    fun foo(view: View) {
        setContentView(view)
        doesNotExist(view)
    }
}
`;

describe("Android MVP E2E", () => {
  it("resolves Android types and inherited members and reports only the unresolved function", () => {
    const ast = parseKotlin(source);
    expect(ast.hasErrors).toBe(false);

    const declarations = collectDeclarations(ast);
    const references = collectReferences(ast, "MyActivity.kt");
    const android = new AndroidSdk(sdkRoot).load(35);
    const context = {
      packageName: declarations.packageName,
      imports: declarations.imports,
      projectSymbols: declarations.symbols,
      jvmSymbols: android,
      scope: new Scope(),
    };

    const myActivity = declarations.symbols.get("MyActivity");
    expect(myActivity).toBeDefined();
    expect(myActivity?.kind).toBe("class");
    expect(myActivity && "superclass" in myActivity ? myActivity.superclass : undefined).toBe("Activity");

    const typeResolver = new TypeResolver();
    const activity = typeResolver.resolveType("Activity", context);
    const view = typeResolver.resolveType("View", context);
    expect(activity?.qualifiedName).toBe("android.app.Activity");
    expect(view?.qualifiedName).toBe("android.view.View");
    expect(activity && "superclass" in activity ? activity.superclass : undefined).toBe("android.content.ContextThemeWrapper");

    const foo = declarations.symbols.findFunctionsByName("foo")[0];
    expect(foo).toBeDefined();
    const viewParameter = foo?.parameters.find((parameter) => parameter.name === "view");
    expect(viewParameter?.type).toBe("View");
    const parameterType = viewParameter?.type ? typeResolver.resolveType(viewParameter.type, context) : undefined;
    expect(parameterType?.qualifiedName).toBe("android.view.View");
    if (parameterType) context.scope?.define("view", parameterType);

    const myActivityType = typeResolver.resolveType("MyActivity", context);
    expect(myActivityType?.qualifiedName).toBe("MyActivity");
    if (myActivityType) context.scope?.define("this", myActivityType);

    const resolved = resolveReferences(references, context);
    const resolvedByName = new Map(resolved.map((result) => [result.reference.name, result]));

    expect(resolvedByName.get("Activity")?.symbol).toBeDefined();
    expect(resolvedByName.get("View")?.symbol).toBeDefined();
    expect(resolvedByName.get("setContentView")?.symbol).toBeDefined();
    expect(resolvedByName.get("doesNotExist")?.symbol).toBeUndefined();

    const diagnostics = collectDiagnostics(resolved);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "UNRESOLVED_FUNCTION",
      message: "Unresolved function 'doesNotExist'",
      severity: "error",
      file: "MyActivity.kt",
    });

    const unresolved = diagnostics[0];
    const expectedStart = source.indexOf("doesNotExist");
    expect(unresolved.range.start.offset).toBe(expectedStart);
    expect(unresolved.range.end.offset).toBe(expectedStart + "doesNotExist".length);
    expect(source.slice(unresolved.range.start.offset, unresolved.range.end.offset)).toBe("doesNotExist");
  });
});
