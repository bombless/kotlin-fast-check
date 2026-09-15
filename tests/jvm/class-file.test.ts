import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readClassFile } from "../../src/jvm/ClassFileReader.js";

const fixture = fileURLToPath(new URL("./fixtures/Example.class", import.meta.url));

describe("ClassFileReader", () => {
  it("reads a real javac-generated class", () => {
    const symbol = readClassFile(readFileSync(fixture));

    expect(symbol.qualifiedName).toBe("fixtures.Example");
    expect(symbol.superclass).toBe("java.lang.Object");
    expect(symbol.interfaces).toEqual(["java.lang.Runnable"]);
    expect(symbol.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "VISIBLE", type: "int", static: true, final: true }),
      expect.objectContaining({ name: "name", type: "java.lang.String" }),
    ]));
    expect(symbol.constructors).toHaveLength(2);
    expect(symbol.constructors.map((method) => method.parameterTypes)).toEqual([
      [],
      ["java.lang.String"],
    ]);
    expect(symbol.methods).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "run", parameterTypes: [], returnType: "void" }),
      expect.objectContaining({ name: "names", returnType: "java.util.List<java.lang.String>" }),
      expect.objectContaining({ name: "values", parameterTypes: ["java.util.List<java.lang.String>"], returnType: "java.util.Map<java.lang.String, java.lang.Integer>" }),
    ]));
  });

  it("rejects non-class bytes", () => {
    expect(() => readClassFile(new Uint8Array([0, 1, 2, 3]))).toThrow("Invalid JVM class file magic");
  });
});