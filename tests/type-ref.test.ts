import { describe, expect, it } from "vitest";
import { parseTypeRef, typeRefToString } from "../src/symbols/TypeRef.js";

describe("TypeRef", () => {
  it.each(["String", "String?", "List<String>", "Map<String, Int>", "Array<String?>", "Array<String>[]"])('parses %s', (text) => {
    expect(typeRefToString(parseTypeRef(text))).toBe(text);
  });

  it("distinguishes receiver function types from ordinary function types", () => {
    const receiver = parseTypeRef("Scope.() -> Unit");
    expect(receiver.functionReceiver?.name).toBe("Scope");
    expect(receiver.functionParameters).toEqual([]);
    expect(receiver.functionReturnType?.name).toBe("Unit");
    expect(typeRefToString(receiver)).toBe("Scope.() -> Unit");

    const ordinary = parseTypeRef("(Scope) -> Unit");
    expect(ordinary.functionReceiver).toBeUndefined();
    expect(ordinary.functionParameters?.map((parameter) => parameter.name)).toEqual(["Scope"]);
    expect(typeRefToString(ordinary)).toBe("(Scope) -> Unit");
  });
});