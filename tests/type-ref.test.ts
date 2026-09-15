import { describe, expect, it } from "vitest";
import { parseTypeRef, typeRefToString } from "../src/symbols/TypeRef.js";

describe("TypeRef", () => {
  it.each(["String", "String?", "List<String>", "Map<String, Int>", "Array<String?>", "Array<String>[]"])('parses %s', (text) => {
    expect(typeRefToString(parseTypeRef(text))).toBe(text);
  });
});