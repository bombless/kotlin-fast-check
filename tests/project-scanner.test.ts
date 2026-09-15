import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectScanner } from "../src/project/ProjectScanner.js";

const fixtureRoot = path.resolve("tests/fixtures/project-scanner");

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("ProjectScanner", () => {
  it("discovers Kotlin source files recursively and ignores non-Kotlin files", async () => {
    await mkdir(path.join(fixtureRoot, "nested", "deeper"), { recursive: true });
    await writeFile(path.join(fixtureRoot, "A.kt"), "class A\n");
    await writeFile(path.join(fixtureRoot, "Script.kts"), "println(1)\n");
    await writeFile(path.join(fixtureRoot, "ignored.txt"), "ignored\n");
    await writeFile(path.join(fixtureRoot, "ignored.java"), "class Ignored {}\n");
    await writeFile(path.join(fixtureRoot, "nested", "B.kt"), "class B\n");
    await writeFile(path.join(fixtureRoot, "nested", "deeper", "C.kts"), "println(2)\n");

    const files = await new ProjectScanner().scan(fixtureRoot);

    expect(files).toEqual([
      path.normalize(path.join(fixtureRoot, "A.kt")),
      path.normalize(path.join(fixtureRoot, "nested", "B.kt")),
      path.normalize(path.join(fixtureRoot, "nested", "deeper", "C.kts")),
      path.normalize(path.join(fixtureRoot, "Script.kts")),
    ]);
  });

  it("returns normalized absolute paths in stable order", async () => {
    await mkdir(path.join(fixtureRoot, "nested"), { recursive: true });
    await writeFile(path.join(fixtureRoot, "z.kt"), "");
    await writeFile(path.join(fixtureRoot, "a.kt"), "");
    await writeFile(path.join(fixtureRoot, "nested", "m.kt"), "");

    const scanner = new ProjectScanner();
    const relativeRoot = path.relative(process.cwd(), fixtureRoot);
    const first = await scanner.scan(relativeRoot);
    const second = await scanner.scan(fixtureRoot);

    expect(first).toEqual(second);
    expect(first).toEqual([...first].sort((a, b) => a.localeCompare(b)));
    expect(first.every((file) => path.isAbsolute(file))).toBe(true);
    expect(first.every((file) => file === path.normalize(file))).toBe(true);
  });

  it("does not duplicate a discovered path", async () => {
    await mkdir(fixtureRoot, { recursive: true });
    await writeFile(path.join(fixtureRoot, "Only.kt"), "");

    const files = await new ProjectScanner().scan(fixtureRoot);

    expect(files).toEqual([path.normalize(path.join(fixtureRoot, "Only.kt"))]);
    expect(new Set(files).size).toBe(files.length);
  });
});
