import { describe, expect, it } from "vitest";
import { collectDiagnostics } from "../../src/analysis/Diagnostics.js";
import type { SymbolReference } from "../../src/analysis/ReferencePass.js";

function ref(kind: SymbolReference["kind"], name: string, file?: string): SymbolReference {
  return {
    kind,
    name,
    file,
    range: {
      start: { row: 6, column: 4, offset: 42 },
      end: { row: 6, column: 16, offset: 54 },
    },
  };
}

describe("Diagnostics", () => {
  it("maps each unresolved resolution kind to its diagnostic", () => {
    const result = collectDiagnostics([
      { reference: ref("type", "Foo"), symbol: undefined },
      { reference: ref("function", "doesNotExist"), symbol: undefined },
      { reference: ref("property", "context"), symbol: undefined },
      { reference: ref("constructor", "Foo"), symbol: undefined },
      { reference: ref("import", "foo.bar.Baz"), symbol: undefined },
      { reference: ref("member", "ignored"), symbol: undefined },
    ]);

    expect(result.map(({ code }) => code)).toEqual([
      "UNRESOLVED_TYPE",
      "UNRESOLVED_FUNCTION",
      "UNRESOLVED_PROPERTY",
      "UNRESOLVED_CONSTRUCTOR",
      "UNRESOLVED_IMPORT",
    ]);
    expect(result.map(({ message }) => message)).toEqual([
      "Unresolved type 'Foo'",
      "Unresolved function 'doesNotExist'",
      "Unresolved property 'context'",
      "Unresolved constructor 'Foo'",
      "Unresolved import 'foo.bar.Baz'",
    ]);
  });

  it("preserves the exact symbol range, file, and error severity", () => {
    const reference = ref("function", "doesNotExist", "Main.kt");
    const result = collectDiagnostics([{ reference, symbol: undefined }])[0];

    expect(result).toEqual({
      code: "UNRESOLVED_FUNCTION",
      message: "Unresolved function 'doesNotExist'",
      severity: "error",
      range: reference.range,
      file: "Main.kt",
    });
  });

  it("does not emit diagnostics for resolved references", () => {
    const reference = ref("function", "known");
    expect(collectDiagnostics([{ reference, symbol: {} as never }])).toEqual([]);
  });
});
