import type { JvmClassSymbol, JvmSymbolIndex } from "../jvm/index.js";
import type { SymbolTable } from "../symbols/SymbolTable.js";
import type { TypeSymbol } from "../symbols/Symbol.js";
import { ImportResolver } from "./ImportResolver.js";

export type ResolvedTypeSymbol = TypeSymbol | JvmClassSymbol;

export interface ResolutionContext {
  packageName: string;
  imports: import("../symbols/Symbol.js").ImportSymbol[];
  projectSymbols?: SymbolTable;
  jvmSymbols?: JvmSymbolIndex;
}

export class TypeResolver {
  private readonly imports = new ImportResolver();

  resolveType(name: string, context: ResolutionContext): ResolvedTypeSymbol | undefined {
    const normalized = name.trim();
    if (!normalized) return undefined;

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
    }

    return undefined;
  }

  private lookup(name: string, context: ResolutionContext): ResolvedTypeSymbol | undefined {
    const project = context.projectSymbols?.get(name);
    if (project && "interfaces" in project) return project as TypeSymbol;
    return context.jvmSymbols?.getClass(name);
  }
}