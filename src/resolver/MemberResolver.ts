import type { JvmClassSymbol } from "../jvm/JvmSymbols.js";
import type { TypeSymbol, PropertySymbol, FunctionSymbol, ConstructorSymbol, Symbol } from "../symbols/Symbol.js";
import type { ResolvedTypeSymbol, ResolutionContext } from "./TypeResolver.js";
import { TypeResolver } from "./TypeResolver.js";
import { resolutionProfiler } from "../util/ResolutionProfiler.js";

export type MemberSymbol = PropertySymbol | FunctionSymbol | Symbol | JvmClassSymbol["fields"][number] | JvmClassSymbol["methods"][number];

export class MemberResolver {
  private readonly typeResolver = new TypeResolver();

  resolveProperty(type: ResolvedTypeSymbol, name: string, context: ResolutionContext): MemberSymbol | undefined {
    return resolutionProfiler.time("member", () => this.resolvePropertyImpl(type, name, context));
  }

  private resolvePropertyImpl(type: ResolvedTypeSymbol, name: string, context: ResolutionContext): MemberSymbol | undefined {
    const direct = this.directProperty(type, name);
    if (direct) return direct;
    for (const parent of this.parents(type, context)) {
      const resolved = this.resolvePropertyImpl(parent, name, context);
      if (resolved) return resolved;
    }
    return undefined;
  }

  resolveMethod(type: ResolvedTypeSymbol, name: string, context: ResolutionContext, arity?: number): MemberSymbol | undefined {
    return resolutionProfiler.time("member", () => this.resolveMethodImpl(type, name, context, arity));
  }

  private resolveMethodImpl(type: ResolvedTypeSymbol, name: string, context: ResolutionContext, arity?: number): MemberSymbol | undefined {
    const direct = this.directMethod(type, name, arity);
    if (direct) return direct;
    for (const parent of this.parents(type, context)) {
      const resolved = this.resolveMethodImpl(parent, name, context, arity);
      if (resolved) return resolved;
    }
    return undefined;
  }

  private directProperty(type: ResolvedTypeSymbol, name: string): MemberSymbol | undefined {
    if ("fields" in type) {
      const fieldIndex = type.fields.findIndex((candidate) => candidate.name === name);
      resolutionProfiler.candidates(fieldIndex < 0 ? type.fields.length : fieldIndex + 1, type.fields.length);
      const field = fieldIndex >= 0 ? type.fields[fieldIndex] : undefined;
      if (field) return field;
      const getterIndex = type.methods.findIndex((candidate) => candidate.parameterTypes.length === 0 && (candidate.name === `get${capitalize(name)}` || candidate.name === `is${capitalize(name)}`));
      resolutionProfiler.candidates(getterIndex < 0 ? type.methods.length : getterIndex + 1, type.methods.length);
      const getter = getterIndex >= 0 ? type.methods[getterIndex] : undefined;
      return getter;
    }
    if (!("members" in type)) return undefined;
    const propertyIndex = type.members.findIndex((member) => member.kind === "property" && member.name === name);
    resolutionProfiler.candidates(propertyIndex < 0 ? type.members.length : propertyIndex + 1, type.members.length);
    return propertyIndex >= 0 ? type.members[propertyIndex] : undefined;
  }

  private directMethod(type: ResolvedTypeSymbol, name: string, arity?: number): MemberSymbol | undefined {
    if ("methods" in type) {
      const methodIndex = type.methods.findIndex((method) => method.name === name && (arity === undefined || method.parameterTypes.length === arity));
      resolutionProfiler.candidates(methodIndex < 0 ? type.methods.length : methodIndex + 1, type.methods.length);
      return methodIndex >= 0 ? type.methods[methodIndex] : undefined;
    }
    if (!("members" in type)) return undefined;
    const functionIndex = type.members.findIndex((member) => member.kind === "function" && member.name === name && (arity === undefined || (member as FunctionSymbol).parameterTypes.length === arity));
    resolutionProfiler.candidates(functionIndex < 0 ? type.members.length : functionIndex + 1, type.members.length);
    return functionIndex >= 0 ? type.members[functionIndex] : undefined;
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
