import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { readJar } from "../../src/jvm/JarReader.js";

const fixture = fileURLToPath(new URL("./fixtures/example.jar", import.meta.url));

describe("JarReader", () => {
  it("indexes class files from a jar", () => {
    const index = readJar(fixture);
    expect(index.getClass("fixtures.Example")).toBeDefined();
    expect(index.getMethod("fixtures.Example", "names")).toMatchObject({ name: "names" });
    expect(index.getField("fixtures.Example", "VISIBLE")).toMatchObject({ type: "int" });
  });
});