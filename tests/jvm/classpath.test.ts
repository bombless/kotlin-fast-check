import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadClasspath, main } from "../../src/cli/main.js";
import { ResolutionPass } from "../../src/analysis/ResolutionPass.js";
import { Scope } from "../../src/resolver/Scope.js";
import type { SymbolReference } from "../../src/analysis/ReferencePass.js";

const fixture = fileURLToPath(new URL("./fixtures/example.jar", import.meta.url));
const range = {
  start: { row: 0, column: 0, offset: 0 },
  end: { row: 0, column: 1, offset: 1 },
};

describe("explicit JVM classpath", () => {
  it("leaves a class unresolved without an explicit classpath", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "kcheck-classpath-"));
    const file = path.join(directory, "Main.kt");
    await writeFile(file, "import fixtures.Example\n\nfun test(): Example = Example()\n", "utf8");

    await main(["--format", "json", file]);
    expect(process.exitCode).toBe(1);

    await rm(directory, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("resolves a JAR class and constructor through --classpath", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "kcheck-classpath-"));
    const file = path.join(directory, "Main.kt");
    await writeFile(file, "import fixtures.Example\n\nfun test(): Example = Example()\n", "utf8");

    await main(["--classpath", fixture, "--format", "json", file]);
    expect(process.exitCode).toBe(0);

    await rm(directory, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("resolves JAR members through the existing MemberResolver", () => {
    const index = loadClasspath(fixture);
    const type = index.getClass("fixtures.Example");
    expect(type).toBeDefined();
    const scope = new Scope();
    scope.define("example", type!);
    const reference: SymbolReference = {
      kind: "member",
      name: "names",
      range,
      receiver: { kind: "property", name: "example", range },
    };

    const result = new ResolutionPass().resolve([reference], {
      packageName: "",
      imports: [],
      scope,
      jvmSymbols: index,
    })[0];
    expect(result.symbol).toMatchObject({ name: "names" });
  });

  it("accepts multiple classpath entries using the platform delimiter", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "kcheck-classpath-"));
    const second = path.join(directory, "second.jar");
    await copyFile(fixture, second);

    const index = loadClasspath([fixture, second].join(path.delimiter));
    expect(index.getClass("fixtures.Example")).toBeDefined();

    await rm(directory, { recursive: true, force: true });
  });

  it("rejects missing and empty classpath entries", async () => {
    expect(() => loadClasspath("")).toThrow("entries must not be empty");
    expect(() => loadClasspath(path.join(tmpdir(), "missing-kcheck.jar"))).toThrow();

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await main(["--classpath"]);
    expect(error).toHaveBeenCalledWith("Missing --classpath value");
    expect(process.exitCode).toBe(2);
    error.mockRestore();
    process.exitCode = undefined;
  });
});
