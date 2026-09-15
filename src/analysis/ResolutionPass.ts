import type { ImportSymbol, Symbol } from "../symbols/Symbol.js";
import type { SymbolTable } from "../symbols/SymbolTable.js";
import type { JvmSymbolIndex } from "../jvm/index.js";
import { ConstructorResolver, type ConstructorMatch } from "../resolver/ConstructorResolver.js";
import { FunctionResolver } from "../resolver/FunctionResolver.js";
import { ImportResolver } from "../resolver/ImportResolver.js";
import { MemberResolver, type MemberSymbol } from "../resolver/MemberResolver.js";
import { Scope } from "../resolver/Scope.js";
import { TypeResolver, type ResolvedTypeSymbol, type ResolutionContext } from "../resolver/TypeResolver.js";
import type { SymbolReference } from "./ReferencePass.js";

export interface ResolutionPassContext extends ResolutionContext {
  jvmSymbols?: JvmSymbolIndex;
  scope?: Scope;
  imports: ImportSymbol[];
  projectSymbols?: SymbolTable;
}

export type ResolvedSymbol = Symbol | ResolvedTypeSymbol | MemberSymbol | ConstructorMatch;

export interface ResolvedReference {
  reference: SymbolReference;
  symbol: ResolvedSymbol | undefined;
}

export class ResolutionPass {
  private readonly types = new TypeResolver();
  private readonly imports = new ImportResolver();
  private readonly functions = new FunctionResolver();
  private readonly members = new MemberResolver();
  private readonly constructors = new ConstructorResolver();

  resolve(references: SymbolReference[], context: ResolutionPassContext): ResolvedReference[] {
    return references.map((reference) => ({
      reference,
      symbol: this.resolveReference(reference, context),
    }));
  }

  resolveReference(reference: SymbolReference, context: ResolutionPassContext): ResolvedSymbol | undefined {
    switch (reference.kind) {
      case "type":
        return this.types.resolveType(reference.name, context);
      case "constructor": {
        const type = this.types.resolveType(reference.name, context);
        return type ? this.constructors.resolveConstructor(type, context) : undefined;
      }
      case "function":
        return this.resolveFunction(reference, context);
      case "property":
      case "member":
        return this.resolveMember(reference, context);
      case "import":
        return this.resolveImport(reference, context);
    }
  }

  private resolveFunction(reference: SymbolReference, context: ResolutionPassContext): MemberSymbol | Symbol | undefined {
    const receiver = this.resolveReceiver(reference.receiver, context);
    if (receiver) return this.functions.resolveFunction(receiver, reference.name, context);
    return context.projectSymbols?.findFunctionsByName(reference.name)[0];
  }

  private resolveMember(reference: SymbolReference, context: ResolutionPassContext): MemberSymbol | undefined {
    const receiver = this.resolveReceiver(reference.receiver, context);
    if (!receiver) return undefined;
    return this.members.resolveProperty(receiver, reference.name, context)
      ?? this.members.resolveMethod(receiver, reference.name, context);
  }

  private resolveReceiver(reference: SymbolReference | undefined, context: ResolutionPassContext): ResolvedTypeSymbol | undefined {
    if (!reference) return undefined;
    return context.scope?.get<ResolvedTypeSymbol>(reference.name)
      ?? this.types.resolveType(reference.name, context);
  }

  private resolveImport(reference: SymbolReference, context: ResolutionPassContext): ResolvedSymbol | undefined {
    for (const candidate of this.imports.resolve(reference.name, context.imports)) {
      const resolved = this.types.resolveType(candidate, context);
      if (resolved) return resolved;
    }
    return this.types.resolveType(reference.name, context);
  }
}

export function resolveReferences(references: SymbolReference[], context: ResolutionPassContext): ResolvedReference[] {
  return new ResolutionPass().resolve(references, context);
}

export const resolutionPass = new ResolutionPass();
