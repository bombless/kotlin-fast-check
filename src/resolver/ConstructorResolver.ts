import type { JvmClassSymbol } from "../jvm/JvmSymbols.js";
import type { ConstructorSymbol } from "../symbols/Symbol.js";
import type { ResolvedTypeSymbol, ResolutionContext } from "./TypeResolver.js";
import { resolutionProfiler } from "../util/ResolutionProfiler.js";

export type ConstructorMatch = ConstructorSymbol | JvmClassSymbol["constructors"][number];

export class ConstructorResolver {
  resolveConstructor(type: ResolvedTypeSymbol, context: ResolutionContext, arity?: number): ConstructorMatch | undefined {
    return resolutionProfiler.time("constructor", () => {
      if ("constructors" in type) {
        const index = type.constructors.findIndex((constructor) => arity === undefined || constructor.parameterTypes.length === arity);
        resolutionProfiler.candidates(index < 0 ? type.constructors.length : index + 1, type.constructors.length);
        return index >= 0 ? type.constructors[index] : undefined;
      }
      if (!("members" in type)) return undefined;
      const index = type.members.findIndex((member) => member.kind === "constructor" && (arity === undefined || (member as ConstructorSymbol).parameterTypes.length === arity));
      resolutionProfiler.candidates(index < 0 ? type.members.length : index + 1, type.members.length);
      return (index >= 0 ? type.members[index] : undefined) as ConstructorSymbol | undefined;
    });
  }
}
