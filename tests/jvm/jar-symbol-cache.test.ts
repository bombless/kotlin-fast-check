import { describe, expect, it, vi } from "vitest";
import { appendFileSync, copyFileSync, mkdtempSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JarReader, JvmSymbolIndex } from "../../src/jvm/JarReader.js";
import { JarSymbolCache } from "../../src/jvm/JarSymbolCache.js";

const fixture = fileURLToPath(new URL("./fixtures/example.jar", import.meta.url));

function tempJar(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), "kotlin-fast-check-"));
  const path = join(directory, name);
  copyFileSync(fixture, path);
  return path;
}

function createCache() {
  const reader = { read: vi.fn(() => new JvmSymbolIndex()) };
  return { cache: new JarSymbolCache(reader), reader };
}

describe("JarSymbolCache", () => {
  it("reuses the index for an unchanged jar", () => {
    const path = tempJar("example.jar");
    const { cache, reader } = createCache();
    const first = cache.read(path);
    const second = cache.read(path);

    expect(second).toBe(first);
    expect(reader.read).toHaveBeenCalledTimes(1);
  });

  it("misses when the jar mtime changes", () => {
    const path = tempJar("example.jar");
    const { cache, reader } = createCache();
    const first = cache.read(path);
    const current = statSync(path);
    utimesSync(path, current.atime, new Date(current.mtimeMs + 10_000));
    const second = cache.read(path);

    expect(second).not.toBe(first);
    expect(reader.read).toHaveBeenCalledTimes(2);
  });

  it("misses when the jar size changes", () => {
    const path = tempJar("example.jar");
    const { cache, reader } = createCache();
    const first = cache.read(path);
    appendFileSync(path, Buffer.from("x"));
    const second = cache.read(path);

    expect(second).not.toBe(first);
    expect(reader.read).toHaveBeenCalledTimes(2);
  });

  it("does not share entries across different absolute paths", () => {
    const firstPath = tempJar("first.jar");
    const secondPath = tempJar("second.jar");
    const { cache, reader } = createCache();
    const first = cache.read(firstPath);
    const second = cache.read(secondPath);

    expect(second).not.toBe(first);
    expect(reader.read).toHaveBeenCalledTimes(2);
  });

  it("preserves symbol resolution through the cached index", () => {
    const path = tempJar("example.jar");
    const cache = new JarSymbolCache(new JarReader());
    const first = cache.read(path);
    const second = cache.read(path);

    expect(first.getClass("fixtures.Example")).toEqual(second.getClass("fixtures.Example"));
    expect(first.getMethod("fixtures.Example", "names")).toEqual(second.getMethod("fixtures.Example", "names"));
    expect(first.getField("fixtures.Example", "VISIBLE")).toEqual(second.getField("fixtures.Example", "VISIBLE"));
  });
});
