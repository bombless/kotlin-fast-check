import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { readClassFile } from "./ClassFileReader.js";
import type { JvmClassSymbol } from "./JvmSymbols.js";
import { JarSymbolCache } from "./JarSymbolCache.js";

export class JvmSymbolIndex {
  private readonly classes = new Map<string, JvmClassSymbol>();
  addClass(symbol: JvmClassSymbol): void { this.classes.set(symbol.qualifiedName, symbol); }
  addAll(symbols: Iterable<JvmClassSymbol>): void { for (const symbol of symbols) this.addClass(symbol); }
  getClass(name: string): JvmClassSymbol | undefined { return this.classes.get(name); }
  getMethod(className: string, methodName: string): JvmClassSymbol["methods"][number] | undefined {
    return this.classes.get(className)?.methods.find((method) => method.name === methodName);
  }
  findMethods(methodName: string, packageName?: string): Array<{ className: string; method: JvmClassSymbol["methods"][number] }> {
    const matches: Array<{ className: string; method: JvmClassSymbol["methods"][number] }> = [];
    for (const symbol of this.classes.values()) {
      if (packageName && !symbol.qualifiedName.startsWith(`${packageName}.`)) continue;
      for (const method of symbol.methods) {
        const baseName = method.name.split("-")[0];
        if (!methodName || method.name === methodName || baseName === methodName) matches.push({ className: symbol.qualifiedName, method });
      }
    }
    return matches;
  }
  getField(className: string, fieldName: string): JvmClassSymbol["fields"][number] | undefined {
    return this.classes.get(className)?.fields.find((field) => field.name === fieldName);
  }
  values(): IterableIterator<JvmClassSymbol> { return this.classes.values(); }
}

export class JarReader {
  read(path: string): JvmSymbolIndex {
    const archive = unzipSync(new Uint8Array(readFileSync(path)));
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

const defaultJarSymbolCache = new JarSymbolCache(new JarReader());