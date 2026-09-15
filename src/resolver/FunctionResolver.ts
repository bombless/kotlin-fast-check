import type { ResolvedTypeSymbol, ResolutionContext } from "./TypeResolver.js";
import type { MemberSymbol } from "./MemberResolver.js";
import { MemberResolver } from "./MemberResolver.js";

export class FunctionResolver {
  private readonly members = new MemberResolver();
  resolveFunction(type: ResolvedTypeSymbol, name: string, context: ResolutionContext, arity?: number): MemberSymbol | undefined {
    return this.members.resolveMethod(type, name, context, arity);
  }
}