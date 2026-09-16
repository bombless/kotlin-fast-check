import { statSync } from "node:fs";
import { resolve } from "node:path";
import type { JvmSymbolIndex } from "./JarReader.js";

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

  constructor(private readonly reader: JarIndexReader) {}

  read(path: string): JvmSymbolIndex {
    const absolutePath = resolve(path);
    const { mtimeMs, size } = statSync(absolutePath);
    const cached = this.entries.get(absolutePath);

    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
      this.cacheHits += 1;
      return cached.index;
    }

    this.cacheMisses += 1;
    const index = this.reader.read(absolutePath);
    this.entries.set(absolutePath, { mtimeMs, size, index });
    return index;
  }

  clear(): void {
    this.entries.clear();
  }

  stats(): JarSymbolCacheStats {
    return { cacheHits: this.cacheHits, cacheMisses: this.cacheMisses };
  }
}
