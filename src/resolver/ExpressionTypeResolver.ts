import type { KotlinAstNode } from "../parser/Ast.js";
import type { ResolvedTypeSymbol, ResolutionContext } from "./TypeResolver.js";
import { TypeResolver } from "./TypeResolver.js";
import { MemberResolver, type MemberSymbol } from "./MemberResolver.js";
import { FunctionResolver } from "./FunctionResolver.js";
import { Scope } from "./Scope.js";

export class ExpressionTypeResolver {
  private readonly types = new TypeResolver();
  private readonly members = new MemberResolver();
  private readonly functions = new FunctionResolver();

  resolve(node: KotlinAstNode, scope: Scope, context: ResolutionContext, implicitReceiver?: ResolvedTypeSymbol): ResolvedTypeSymbol | undefined {
    if (node.type === "simple_identifier") return scope.get<ResolvedTypeSymbol>(node.text) ?? this.types.resolveType(node.text, context);

    if (node.type === "navigation_expression") {
      if (node.children.length === 1) return this.resolve(node.children[0], scope, context, implicitReceiver);
      const receiver = this.resolve(node.children[0], scope, context, implicitReceiver);
      const suffix = node.children[1]?.text.replace(/^\./, "");
      if (!receiver || !suffix) return undefined;
      return this.memberType(this.members.resolveProperty(receiver, suffix, context), context);
    }

    if (node.type === "call_expression") {
      const navigation = node.children.find((child) => child.type === "navigation_expression");
      const directName = node.children.find((child) => child.type === "simple_identifier");
      const call = node.children.find((child) => child.type === "call_suffix");
      const arity = call?.children.find((child) => child.type === "value_arguments")?.children.filter((child) => child.type === "value_argument").length ?? 0;
      if (!navigation && !directName) return undefined;
      const parts = navigation?.children ?? [];
      const name = parts.length > 1 ? parts[1].text.replace(/^\./, "") : directName?.text;
      if (!name) return undefined;
      const receiver = parts.length > 1 ? this.resolve(parts[0], scope, context, implicitReceiver) : implicitReceiver;
      const resolvedFunction = receiver ? this.functions.resolveFunction(receiver, name, context, arity) : undefined;
      return this.memberType(resolvedFunction, context);
    }

    return undefined;
  }

  private memberType(member: MemberSymbol | undefined, context: ResolutionContext): ResolvedTypeSymbol | undefined {
    if (!member) return undefined;
    if ("type" in member && typeof member.type === "string") return this.types.resolveType(member.type, context);
    if ("returnType" in member && typeof member.returnType === "string") return this.types.resolveType(member.returnType, context);
    return undefined;
  }
}