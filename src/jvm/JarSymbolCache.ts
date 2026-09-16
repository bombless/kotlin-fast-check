import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { JvmSymbolIndex } from "./JarReader.js";
import { JvmSymbolIndex as SymbolIndex } from "./JarReader.js";

interface CacheEntry {
  mtimeMs: number;
  size: number;
  index: JvmSymbolIndex;
}

export interface JarIndexReader {
  read(path: string): JvmSymbolIndex;
}

export interface JarSymbolCacheStats {
  cacheHits: number;
  cacheMisses: number;
}

export class JarSymbolCache {
  private readonly entries = new Map<string, CacheEntry>();
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(private readonly reader: JarIndexReader, private readonly diskCacheRoot?: string) {}

  read(path: string): JvmSymbolIndex {
    const absolutePath = resolve(path);
    const { mtimeMs, size } = statSync(absolutePath);
    const cached = this.entries.get(absolutePath);

    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
      this.cacheHits += 1;
      return cached.index;
    }

    if (this.diskCacheRoot) {
      const disk = this.readDisk(absolutePath, mtimeMs, size);
      if (disk) {
        this.cacheHits += 1;
        this.entries.set(absolutePath, { mtimeMs, size, index: disk });
        return disk;
      }
    }

    this.cacheMisses += 1;
    const index = this.reader.read(absolutePath);
    this.entries.set(absolutePath, { mtimeMs, size, index });
    if (this.diskCacheRoot) this.writeDisk(absolutePath, mtimeMs, size, index);
    return index;
  }

  clear(): void {
    this.entries.clear();
  }

  stats(): JarSymbolCacheStats {
    return { cacheHits: this.cacheHits, cacheMisses: this.cacheMisses };
  }

  private cachePath(absolutePath: string): string {
    const safe = Buffer.from(absolutePath, "utf8").toString("base64url");
    return resolve(this.diskCacheRoot!, `${safe}.json`);
  }

  private readDisk(absolutePath: string, mtimeMs: number, size: number): JvmSymbolIndex | undefined {
    try {
      const payload = JSON.parse(readFileSync(this.cachePath(absolutePath), "utf8")) as {
        version: number;
        mtimeMs: number;
        size: number;
        classes: Parameters<JvmSymbolIndex["addClass"]>[0][];
      };
      if (payload.version !== 1 || payload.mtimeMs !== mtimeMs || payload.size !== size || !Array.isArray(payload.classes)) return undefined;
      const index = new SymbolIndex();
      index.addAll(payload.classes);
      return index;
    } catch {
      return undefined;
    }
  }

  private writeDisk(absolutePath: string, mtimeMs: number, size: number, index: JvmSymbolIndex): void {
    try {
      mkdirSync(this.diskCacheRoot!, { recursive: true });
      writeFileSync(this.cachePath(absolutePath), JSON.stringify({ version: 1, mtimeMs, size, classes: [...index.values()] }));
    } catch {
      // Disk cache is an optimization only; never fail analysis because it cannot be written.
    }
  }
}
