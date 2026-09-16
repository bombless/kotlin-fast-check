import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { JvmClassSymbol } from "./JvmSymbols.js";
import { JvmSymbolIndex } from "./JarReader.js";

const CACHE_VERSION = 1 as const;

export interface ClasspathCacheEntry {
  path: string;
  mtimeMs: number;
  size: number;
}

interface ClasspathCachePayload {
  version: typeof CACHE_VERSION;
  fingerprint: string;
  entries: ClasspathCacheEntry[];
  classes: JvmClassSymbol[];
}

export interface ClasspathCacheResult {
  index: JvmSymbolIndex;
  fingerprint: string;
  hit: boolean;
}

/** A project-level cache for the fully merged JVM classpath symbol index. */
export class ClasspathSymbolCache {
  constructor(private readonly cacheDirectory: string) {}

  loadOrBuild(jars: string[], build: () => JvmSymbolIndex): ClasspathCacheResult {
    const entries = jars.map((jar) => this.entry(jar));
    const fingerprint = this.fingerprint(entries);
    const cacheFile = path.join(this.cacheDirectory, `classpath-index-v${CACHE_VERSION}-${fingerprint}.json`);

    try {
      const payload = JSON.parse(readFileSync(cacheFile, "utf8")) as Partial<ClasspathCachePayload>;
      if (
        payload.version === CACHE_VERSION &&
        payload.fingerprint === fingerprint &&
        this.sameEntries(payload.entries, entries) &&
        Array.isArray(payload.classes)
      ) {
        const index = new JvmSymbolIndex();
        index.addAll(payload.classes);
        return { index, fingerprint, hit: true };
      }
    } catch {
      // A stale/corrupt optimization cache is equivalent to a miss.
    }

    const index = build();
    try {
      mkdirSync(this.cacheDirectory, { recursive: true });
      const tempFile = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
      const payload: ClasspathCachePayload = {
        version: CACHE_VERSION,
        fingerprint,
        entries,
        classes: [...index.values()],
      };
      writeFileSync(tempFile, JSON.stringify(payload), "utf8");
      renameSync(tempFile, cacheFile);
    } catch {
      // Disk cache is an optimization only; analysis must still succeed.
    }

    return { index, fingerprint, hit: false };
  }

  private entry(jar: string): ClasspathCacheEntry {
    const absolutePath = path.resolve(jar);
    const info = statSync(absolutePath);
    return { path: absolutePath, mtimeMs: info.mtimeMs, size: info.size };
  }

  private fingerprint(entries: ClasspathCacheEntry[]): string {
    const hash = createHash("sha256");
    for (const entry of entries) {
      hash.update(entry.path).update("\0");
      hash.update(String(entry.mtimeMs)).update("\0");
      hash.update(String(entry.size)).update("\0");
    }
    return hash.digest("hex");
  }

  private sameEntries(actual: unknown, expected: ClasspathCacheEntry[]): boolean {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    for (let index = 0; index < expected.length; index += 1) {
      const value = actual[index] as Partial<ClasspathCacheEntry> | undefined;
      const expectedEntry = expected[index];
      if (value?.path !== expectedEntry.path || value.mtimeMs !== expectedEntry.mtimeMs || value.size !== expectedEntry.size) return false;
    }
    return true;
  }
}
