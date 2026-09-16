import { describe, expect, it, vi } from "vitest";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { GradleClasspath } from "../src/project/GradleClasspath.js";

const fixture = fileURLToPath(new URL("./jvm/fixtures/example.jar", import.meta.url));

describe("Gradle classpath persistent cache", () => {
  it("writes on a cache miss and reuses the cache without Gradle", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kcheck-gradle-cache-"));
    await mkdir(path.join(root, "app"), { recursive: true });
    await writeFile(path.join(root, "settings.gradle"), "rootProject.name = 'fixture'\n", "utf8");
    await writeFile(path.join(root, "build.gradle"), "", "utf8");
    const jar = path.join(root, "library.jar");
    await copyFile(fixture, jar);
    const resolver = vi.spyOn(GradleClasspath.prototype as any, "resolveCompileClasspath").mockResolvedValue([jar]);
    try {
      const first = await new GradleClasspath().discover(root);
      expect(first.jars).toEqual([path.normalize(path.resolve(jar))]);
      expect(JSON.parse(await readFile(path.join(root, ".kotlin-fast-check", "classpath.json"))).version).toBe(1);
      resolver.mockClear();
      const second = await new GradleClasspath().discover(root);
      expect(second.jars).toEqual(first.jars);
      expect(resolver).not.toHaveBeenCalled();
    } finally {
      resolver.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to Gradle when cache JSON is corrupt", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kcheck-gradle-cache-"));
    await mkdir(path.join(root, "app"), { recursive: true });
    await mkdir(path.join(root, ".kotlin-fast-check"), { recursive: true });
    await writeFile(path.join(root, "settings.gradle"), "rootProject.name = 'fixture'\n", "utf8");
    await writeFile(path.join(root, "build.gradle"), "", "utf8");
    await writeFile(path.join(root, ".kotlin-fast-check", "classpath.json"), "{not-json", "utf8");
    const jar = path.join(root, "library.jar");
    await copyFile(fixture, jar);
    const resolver = vi.spyOn(GradleClasspath.prototype as any, "resolveCompileClasspath").mockResolvedValue([jar]);
    try {
      const result = await new GradleClasspath().discover(root);
      expect(result.jars).toEqual([path.normalize(path.resolve(jar))]);
      expect(resolver).toHaveBeenCalledTimes(1);
    } finally {
      resolver.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});
