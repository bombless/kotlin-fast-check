import type { JvmClassSymbol } from "../jvm/JvmSymbols.js";
import type { TypeSymbol, PropertySymbol, FunctionSymbol, ConstructorSymbol, Symbol } from "../symbols/Symbol.js";
import type { ResolvedTypeSymbol, ResolutionContext } from "./TypeResolver.js";
import { TypeResolver } from "./TypeResolver.js";

export type MemberSymbol = PropertySymbol | FunctionSymbol | Symbol | JvmClassSymbol["fields"][number] | JvmClassSymbol["methods"][number];

export class MemberResolver {
  private readonly typeResolver = new TypeResolver();

  resolveProperty(type: ResolvedTypeSymbol, name: string, context: ResolutionContext): MemberSymbol | undefined {
    const direct = this.directProperty(type, name);
    if (direct) return direct;
    for (const parent of this.parents(type, context)) {
      const resolved = this.resolveProperty(parent, name, context);
      if (resolved) return resolved;
    }
    return undefined;
  }

  resolveMethod(type: ResolvedTypeSymbol, name: string, context: ResolutionContext, arity?: number): MemberSymbol | undefined {
    const direct = this.directMethod(type, name, arity);
    if (direct) return direct;
    for (const parent of this.parents(type, context)) {
      const resolved = this.resolveMethod(parent, name, context, arity);
      if (resolved) return resolved;
    }
    return undefined;
  }

  private directProperty(type: ResolvedTypeSymbol, name: string): MemberSymbol | undefined {
    if ("fields" in type) {
      const field = type.fields.find((candidate) => candidate.name === name);
      if (field) return field;
      const getter = type.methods.find((candidate) => candidate.parameterTypes.length === 0 && (candidate.name === `get${capitalize(name)}` || candidate.name === `is${capitalize(name)}`));
      return getter;
    }
    if (!("members" in type)) return undefined;
    return type.members.find((member) => member.kind === "property" && member.name === name);
  }

  private directMethod(type: ResolvedTypeSymbol, name: string, arity?: number): MemberSymbol | undefined {
    if ("methods" in type) return type.methods.find((method) => method.name === name && (arity === undefined || method.parameterTypes.length === arity));
    if (!("members" in type)) return undefined;
    return type.members.find((member) => member.kind === "function" && member.name === name && (arity === undefined || (member as FunctionSymbol).parameterTypes.length === arity));
  }

  private parents(type: ResolvedTypeSymbol, context: ResolutionContext): ResolvedTypeSymbol[] {
    if (!("superclass" in type) || !("interfaces" in type)) return [];
    const names = [type.superclass, ...type.interfaces];
    const parents: ResolvedTypeSymbol[] = [];
    for (const name of names) {
      if (!name) continue;
      const resolved = this.typeResolver.resolveType(name, context);
      if (resolved) parents.push(resolved);
    }
    return parents;
  }
}

function capitalize(value: string): string { return value.length ? value[0].toUpperCase() + value.slice(1) : value; }