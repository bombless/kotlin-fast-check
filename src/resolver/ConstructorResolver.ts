import type { JvmClassSymbol } from "../jvm/JvmSymbols.js";
import type { ConstructorSymbol } from "../symbols/Symbol.js";
import type { ResolvedTypeSymbol, ResolutionContext } from "./TypeResolver.js";

export type ConstructorMatch = ConstructorSymbol | JvmClassSymbol["constructors"][number];

export class ConstructorResolver {
  resolveConstructor(type: ResolvedTypeSymbol, context: ResolutionContext, arity?: number): ConstructorMatch | undefined {
    if ("constructors" in type) return type.constructors.find((constructor) => arity === undefined || constructor.parameterTypes.length === arity);
    const match = type.members.find((member) => member.kind === "constructor" && (arity === undefined || (member as ConstructorSymbol).parameterTypes.length === arity));
    return match as ConstructorSymbol | undefined;
  }
}