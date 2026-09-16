import type { JvmClassSymbol } from "../jvm/index.js";
import type { JvmSymbolProvider } from "../jvm/JvmSymbolProvider.js";
import type { SymbolTable } from "../symbols/SymbolTable.js";
import type { TypeSymbol } from "../symbols/Symbol.js";
import { ImportResolver } from "./ImportResolver.js";
import { resolutionProfiler } from "../util/ResolutionProfiler.js";

const KOTLIN_IMPLICIT_IMPORT_PACKAGES = [
  "kotlin",
  "kotlin.annotation",
  "kotlin.collections",
  "kotlin.comparisons",
  "kotlin.io",
  "kotlin.math",
  "kotlin.jvm",
  "kotlin.ranges",
  "kotlin.sequences",
  "kotlin.text",
  "java.lang",
  "java.util",
];

export interface PrimitiveTypeSymbol { name: string; qualifiedName: string; primitive: true; }
export type ResolvedTypeSymbol = TypeSymbol | JvmClassSymbol | PrimitiveTypeSymbol;

export interface ResolutionContext {
  packageName: string;
  imports: import("../symbols/Symbol.js").ImportSymbol[];
  projectSymbols?: SymbolTable;
  jvmSymbols?: JvmSymbolProvider;
}

export class TypeResolver {
  private readonly imports = new ImportResolver();

  resolveType(name: string, context: ResolutionContext): ResolvedTypeSymbol | undefined {
    return resolutionProfiler.time("type", () => this.resolveTypeImpl(name, context));
  }

  private resolveTypeImpl(name: string, context: ResolutionContext): ResolvedTypeSymbol | undefined {
    const normalized = name.trim();
    if (!normalized) return undefined;
    const primitive = primitiveType(normalized);
    if (primitive) return primitive;

    if (normalized.includes(".")) {
      const direct = this.lookup(normalized, context);
      if (direct) return direct;
    }

    const imported = this.imports.resolve(normalized, context.imports);
    for (const candidate of imported) {
      const resolved = this.lookup(candidate, context);
      if (resolved) return resolved;
    }

    if (context.packageName) {
      const samePackage = this.lookup(`${context.packageName}.${normalized}`, context);
      if (samePackage) return samePackage;
    }

    const projectMatches = context.projectSymbols?.findTypesByName(normalized) ?? [];
    if (projectMatches.length) return projectMatches[0];

    if (context.jvmSymbols) {
      const wildcardCandidates = this.imports.resolve(normalized, context.imports).filter((candidate) => candidate.endsWith(`.${normalized}`));
      for (const candidate of wildcardCandidates) {
        const resolved = context.jvmSymbols.getClass(candidate);
        if (resolved) return resolved;
      }
      for (const packageName of KOTLIN_IMPLICIT_IMPORT_PACKAGES) {
        const resolved = context.jvmSymbols.getClass(`${packageName}.${normalized}`);
        if (resolved) return resolved;
      }
    }

    return undefined;
  }

  private lookup(name: string, context: ResolutionContext): ResolvedTypeSymbol | undefined {
    const project = context.projectSymbols?.get(name);
    if (project && "interfaces" in project) return project as TypeSymbol;
    return context.jvmSymbols?.getClass(name);
  }
}

function primitiveType(name: string): PrimitiveTypeSymbol | undefined {
  const map: Record<string, string> = {
    Int: "int", Long: "long", Short: "short", Byte: "byte", Boolean: "boolean", Float: "float",
    Double: "double", Char: "char", Unit: "void", int: "int", long: "long", short: "short",
    byte: "byte", boolean: "boolean", float: "float", double: "double", char: "char", void: "void",
    String: "kotlin.String", Any: "kotlin.Any", Nothing: "kotlin.Nothing", Number: "kotlin.Number",
    List: "kotlin.collections.List", MutableList: "kotlin.collections.MutableList", Set: "kotlin.collections.Set",
    MutableSet: "kotlin.collections.MutableSet", Map: "kotlin.collections.Map", MutableMap: "kotlin.collections.MutableMap",
    Collection: "kotlin.collections.Collection", Iterable: "kotlin.collections.Iterable", Throwable: "kotlin.Throwable",
  };
  const qualifiedName = map[name];
  return qualifiedName ? { name, qualifiedName, primitive: true } : undefined;
}
