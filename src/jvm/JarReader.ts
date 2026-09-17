import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { unzipSync } from "fflate";
import { readClassFile } from "./ClassFileReader.js";
import type { JvmClassSymbol } from "./JvmSymbols.js";
import { JarSymbolCache } from "./JarSymbolCache.js";
import { resolutionProfiler } from "../util/ResolutionProfiler.js";

export class JvmSymbolIndex {
  private readonly classes = new Map<string, JvmClassSymbol>();
  private readonly classesByPackage = new Map<string, JvmClassSymbol[]>();
  private readonly classesByPackageAndName = new Map<string, Map<string, JvmClassSymbol[]>>();
  private readonly methodsByName = new Map<string, Array<{ className: string; method: JvmClassSymbol["methods"][number] }>>();

  addClass(symbol: JvmClassSymbol): void {
    const previous = this.classes.get(symbol.qualifiedName);
    if (previous) {
      this.removeClassIndexEntry(previous);
      this.removeMethodIndexEntries(previous);
    }
    this.classes.set(symbol.qualifiedName, symbol);
    this.addClassIndexEntry(symbol);
    for (const method of symbol.methods) {
      const baseName = method.name.split("-")[0];
      this.addMethodIndexEntry(method.name, symbol.qualifiedName, method);
      if (baseName !== method.name) this.addMethodIndexEntry(baseName, symbol.qualifiedName, method);
    }
  }
  addAll(symbols: Iterable<JvmClassSymbol>): void { for (const symbol of symbols) this.addClass(symbol); }
  getClass(name: string): JvmClassSymbol | undefined { return this.classes.get(name); }
  getClasses(packageName: string, simpleName: string): JvmClassSymbol[] {
    return this.classesByPackageAndName.get(packageName)?.get(simpleName) ?? [];
  }
  getMethod(className: string, methodName: string): JvmClassSymbol["methods"][number] | undefined {
    return this.classes.get(className)?.methods.find((method) => method.name === methodName);
  }
  findMethods(methodName: string, packageName?: string): Array<{ className: string; method: JvmClassSymbol["methods"][number] }> {
    const matches: Array<{ className: string; method: JvmClassSymbol["methods"][number] }> = [];
    let scanned = 0;
    let classesVisited = 0;

    // Named lookups use the secondary index; its insertion order mirrors the
    // original class/method traversal order. Empty-name lookups remain full scans.
    if (methodName) {
      const indexed = this.methodsByName.get(methodName) ?? [];
      if (!packageName) matches.push(...indexed);
      else for (const entry of indexed) {
        if (entry.className.startsWith(`${packageName}.`)) matches.push(entry);
      }
      resolutionProfiler.jvmMethodsScanned(scanned);
      resolutionProfiler.candidates(scanned, matches.length, "jvm.methodIndex");
      if (matches.length >= 10000) {
        console.error(`[KFC][Perf] Candidate.SPIKE symbol=${methodName} package=${packageName ?? ""} classesVisited=${classesVisited} candidates=${matches.length}`);
      }
      return matches;
    }

    const symbols = packageName
      ? this.classesByPackage.get(packageName) ?? []
      : this.classes.values();
    for (const symbol of symbols) {
      classesVisited += 1;
      for (const method of symbol.methods) {
        scanned += 1;
        matches.push({ className: symbol.qualifiedName, method });
      }
    }
    resolutionProfiler.jvmMethodsScanned(scanned);
    resolutionProfiler.candidates(scanned, matches.length, "jvm.packageScan");
    if (matches.length >= 10000) {
      console.error(`[KFC][Perf] Candidate.SPIKE symbol= package=${packageName ?? ""} classesVisited=${classesVisited} candidates=${matches.length}`);
    }
    return matches;
  }
  getField(className: string, fieldName: string): JvmClassSymbol["fields"][number] | undefined {
    return this.classes.get(className)?.fields.find((field) => field.name === fieldName);
  }
  values(): IterableIterator<JvmClassSymbol> { return this.classes.values(); }

  private addClassIndexEntry(symbol: JvmClassSymbol): void {
    const separator = symbol.qualifiedName.lastIndexOf(".");
    const packageName = separator < 0 ? "" : symbol.qualifiedName.slice(0, separator);
    const simpleName = separator < 0 ? symbol.qualifiedName : symbol.qualifiedName.slice(separator + 1);
    let packageClasses = this.classesByPackage.get(packageName);
    if (!packageClasses) {
      packageClasses = [];
      this.classesByPackage.set(packageName, packageClasses);
    }
    packageClasses.push(symbol);

    let byName = this.classesByPackageAndName.get(packageName);
    if (!byName) {
      byName = new Map();
      this.classesByPackageAndName.set(packageName, byName);
    }
    const classes = byName.get(simpleName);
    if (classes) classes.push(symbol);
    else byName.set(simpleName, [symbol]);
  }

  private removeClassIndexEntry(symbol: JvmClassSymbol): void {
    const separator = symbol.qualifiedName.lastIndexOf(".");
    const packageName = separator < 0 ? "" : symbol.qualifiedName.slice(0, separator);
    const simpleName = separator < 0 ? symbol.qualifiedName : symbol.qualifiedName.slice(separator + 1);
    const packageClasses = this.classesByPackage.get(packageName);
    if (packageClasses) {
      const remainingPackageClasses = packageClasses.filter((candidate) => candidate !== symbol);
      if (remainingPackageClasses.length === 0) this.classesByPackage.delete(packageName);
      else this.classesByPackage.set(packageName, remainingPackageClasses);
    }

    const byName = this.classesByPackageAndName.get(packageName);
    const classes = byName?.get(simpleName);
    if (!byName || !classes) return;
    const remaining = classes.filter((candidate) => candidate !== symbol);
    if (remaining.length === 0) byName.delete(simpleName);
    else byName.set(simpleName, remaining);
    if (byName.size === 0) this.classesByPackageAndName.delete(packageName);
  }

  private addMethodIndexEntry(methodName: string, className: string, method: JvmClassSymbol["methods"][number]): void {
    const entries = this.methodsByName.get(methodName);
    const entry = { className, method };
    if (entries) entries.push(entry);
    else this.methodsByName.set(methodName, [entry]);
  }

  private removeMethodIndexEntries(symbol: JvmClassSymbol): void {
    for (const method of symbol.methods) {
      for (const name of new Set([method.name, method.name.split("-")[0]])) {
        const entries = this.methodsByName.get(name);
        if (!entries) continue;
        const remaining = entries.filter((entry) => entry.className !== symbol.qualifiedName || entry.method !== method);
        if (remaining.length === 0) this.methodsByName.delete(name);
        else this.methodsByName.set(name, remaining);
      }
    }
  }
}

export class JarReader {
  read(path: string): JvmSymbolIndex {
    resolutionProfiler.jar("read");
    const fsStarted = performance.now();
    const bytes = readFileSync(path);
    resolutionProfiler.fsCall(performance.now() - fsStarted);
    const archive = unzipSync(new Uint8Array(bytes));
    const index = new JvmSymbolIndex();
    this.addClasses(archive, index, path);
    if (path.toLowerCase().endsWith(".aar")) {
      for (const [name, bytes] of Object.entries(archive)) {
        if (!name.endsWith(".jar")) continue;
        try {
          this.addClasses(unzipSync(bytes), index, `${path}!/${name}`);
        } catch (error) {
          throw new Error(`Failed to read nested ${name} from ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    return index;
  }

  private addClasses(archive: Record<string, Uint8Array>, index: JvmSymbolIndex, source: string): void {
    for (const [name, bytes] of Object.entries(archive)) {
      if (!name.endsWith(".class") || name.endsWith("module-info.class") || name.endsWith("package-info.class")) continue;
      try {
        resolutionProfiler.jar("classParser");
        index.addClass(readClassFile(bytes));
      } catch (error) {
        throw new Error(`Failed to read ${name} from ${source}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

export function readJar(path: string): JvmSymbolIndex {
  return defaultJarSymbolCache.read(path);
}

export function getJarSymbolCacheStats(): { cacheHits: number; cacheMisses: number } {
  return defaultJarSymbolCache.stats();
}

const defaultJarSymbolCache = new JarSymbolCache(
  new JarReader(),
  process.env.KFC_CACHE_DIR ? resolve(process.env.KFC_CACHE_DIR) : undefined,
);