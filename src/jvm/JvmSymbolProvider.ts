import type { JvmClassSymbol } from "./JvmSymbols.js";
import type { JvmSymbolIndex } from "./JarReader.js";
import { resolutionProfiler } from "../util/ResolutionProfiler.js";

export interface JvmSymbolProvider {
  getClass(name: string): JvmClassSymbol | undefined;
  getMethod(className: string, methodName: string): JvmClassSymbol["methods"][number] | undefined;
  findMethods(methodName: string, packageName?: string): Array<{ className: string; method: JvmClassSymbol["methods"][number] }>;
  getField(className: string, fieldName: string): JvmClassSymbol["fields"][number] | undefined;
}

export class IndexedJvmSymbolProvider implements JvmSymbolProvider {
  constructor(private readonly index: JvmSymbolIndex) {}

  getClass(name: string): JvmClassSymbol | undefined {
    resolutionProfiler.lookup("type");
    return this.index.getClass(name);
  }
  getMethod(className: string, methodName: string): JvmClassSymbol["methods"][number] | undefined {
    resolutionProfiler.lookup("member");
    return this.index.getMethod(className, methodName);
  }
  findMethods(methodName: string, packageName?: string) {
    const result = this.index.findMethods(methodName, packageName);
    resolutionProfiler.lookup("function");
    return result;
  }
  getField(className: string, fieldName: string): JvmClassSymbol["fields"][number] | undefined {
    resolutionProfiler.lookup("member");
    return this.index.getField(className, fieldName);
  }
}
