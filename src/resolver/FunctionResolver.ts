import type { ResolvedTypeSymbol, ResolutionContext } from "./TypeResolver.js";
import type { MemberSymbol } from "./MemberResolver.js";
import { MemberResolver } from "./MemberResolver.js";
import { resolutionProfiler } from "../util/ResolutionProfiler.js";

export class FunctionResolver {
  private readonly members = new MemberResolver();
  resolveFunction(type: ResolvedTypeSymbol, name: string, context: ResolutionContext, arity?: number): MemberSymbol | undefined {
    return resolutionProfiler.time("function", () => this.members.resolveMethod(type, name, context, arity));
  }
}