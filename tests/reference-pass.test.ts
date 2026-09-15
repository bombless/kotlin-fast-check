import { describe, expect, it } from "vitest";
import { collectReferences } from "../src/analysis/index.js";
import { parseKotlin } from "../src/parser/index.js";

describe("ReferencePass", () => {
  it("finds imports, types, calls, members and constructors without resolving them", () => {
    const ast = parseKotlin(`
      import android.view.View
      class Foo {
        fun test(view: View) {
          val context = view.context
          View(context)
          doesNotExist(view)
        }
      }
    `);
    const refs = collectReferences(ast, "Main.kt");
    expect(refs.filter((r) => r.kind === "import").map((r) => r.name)).toContain("android.view.View");
    expect(refs.filter((r) => r.kind === "type").map((r) => r.name)).toContain("View");
    expect(refs.filter((r) => r.kind === "member").map((r) => r.name)).toContain("context");
    expect(refs.filter((r) => r.kind === "constructor").map((r) => r.name)).toContain("View");
    const call = refs.find((r) => r.kind === "function" && r.name === "doesNotExist");
    expect(call).toBeDefined();
    expect(call?.range.start.row).toBe(6);
    expect(call?.range.end.row).toBe(6);
    expect(call?.range.start.offset).toBeGreaterThan(0);
    expect(call?.range.end.offset).toBeGreaterThan(0);
    expect(call?.range.start.column).toBe(10);
    expect(call?.range.end.column).toBe(22);
    expect(call?.file).toBe("Main.kt");
    expect(call?.kind).toBe("function");
    expect(call?.name).toBe("doesNotExist");
    expect(call?.receiver).toBeUndefined();
    expect(refs.some((r) => r.kind === "member" && r.name === "context")).toBe(true);
  });
});
