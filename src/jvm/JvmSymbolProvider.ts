import type { JvmClassSymbol } from "./JvmSymbols.js";
import type { JvmSymbolIndex } from "./JarReader.js";

export interface JvmSymbolProvider {
  getClass(name: string): JvmClassSymbol | undefined;
  getMethod(className: string, methodName: string): JvmClassSymbol["methods"][number] | undefined;
  findMethods(methodName: string, packageName?: string): Array<{ className: string; method: JvmClassSymbol["methods"][number] }>;
  getField(className: string, fieldName: string): JvmClassSymbol["fields"][number] | undefined;
}

export class IndexedJvmSymbolProvider implements JvmSymbolProvider {
  constructor(private readonly index: JvmSymbolIndex) {}

  getClass(name: string): JvmClassSymbol | undefined { return this.index.getClass(name); }
  getMethod(className: string, methodName: string): JvmClassSymbol["methods"][number] | undefined {
    return this.index.getMethod(className, methodName);
  }
  findMethods(methodName: string, packageName?: string) {
    return this.index.findMethods(methodName, packageName);
  }
  getField(className: string, fieldName: string): JvmClassSymbol["fields"][number] | undefined {
    return this.index.getField(className, fieldName);
  }
}
