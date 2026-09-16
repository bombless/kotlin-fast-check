import type { KotlinAst, KotlinAstNode, SourceRange } from "../parser/Ast.js";

export type SymbolReferenceKind = "type" | "function" | "property" | "constructor" | "import" | "member";

/** A syntactic reference; resolution is intentionally performed by a later pass. */
export interface SymbolReference {
  kind: SymbolReferenceKind;
  name: string;
  range: SourceRange;
  receiver?: SymbolReference;
  file?: string;
  lambdaContext?: LambdaContext;
  containerName?: string;
}

export interface LambdaContext {
  call: SymbolReference;
  parameterIndex: number;
  isTrailing?: boolean;
  parent?: LambdaContext;
}

const IDENTIFIERS = ["simple_identifier", "identifier", "type_identifier"];

function first(node: KotlinAstNode, types: string[]): KotlinAstNode | undefined {
  return node.children.find((child) => types.includes(child.type));
}

function identifier(node: KotlinAstNode | undefined): KotlinAstNode | undefined {
  if (!node) return undefined;
  if (IDENTIFIERS.includes(node.type)) return node;
  return first(node, IDENTIFIERS);
}

function collectType(node: KotlinAstNode, out: SymbolReference[], file?: string): void {
  if (node.type === "user_type") {
    const raw = node.text.trim();
    const name = raw.replace(/<.*$/s, "").replace(/\?$/, "").trim();
    if (name) out.push({ kind: "type", name, range: node.range, file });
    return;
  }
  if (node.type === "type_identifier") {
    const name = node.text.trim();
    if (name) out.push({ kind: "type", name, range: node.range, file });
    return;
  }
  const nested = first(node, ["user_type", "type_identifier", "nullable_type", "function_type", "parenthesized_type", "type_projection"]);
  if (nested) collectType(nested, out, file);
}

function receiverOf(node: KotlinAstNode, file?: string): SymbolReference | undefined {
  const nav = first(node, ["navigation_expression"]);
  if (!nav) return undefined;
  const firstId = identifier(nav.children[0]);
  return firstId ? { kind: "property", name: firstId.text, range: firstId.range, file } : undefined;
}

function navigationMember(node: KotlinAstNode, file?: string): SymbolReference | undefined {
  const suffix = first(node, ["navigation_suffix"]);
  const member = suffix ? identifier(suffix) : undefined;
  const receiver = identifier(node.children[0]);
  if (!member || !receiver) return undefined;
  return {
    kind: "member",
    name: member.text,
    range: member.range,
    receiver: { kind: "property", name: receiver.text, range: receiver.range, file },
    file,
  };
}

function callReference(node: KotlinAstNode, file?: string, lambdaContext?: LambdaContext): SymbolReference | undefined {
  const navigation = first(node, ["navigation_expression"]);
  if (navigation) {
    const member = navigationMember(navigation, file);
    return member ? { ...member, lambdaContext } : undefined;
  }
  const callee = identifier(first(node, ["simple_identifier", "identifier"]));
  if (!callee) return undefined;
  const kind = /^[A-Z]/.test(callee.text) ? "constructor" : "function";
  return { kind, name: callee.text, range: callee.range, receiver: receiverOf(node, file), file, lambdaContext };
}

export class ReferencePass {
  collect(ast: KotlinAst, file?: string): SymbolReference[] {
    const refs: SymbolReference[] = [];
    const visit = (node: KotlinAstNode, lambdaContext?: LambdaContext): void => {
      if (node.type === "import_header") {
        const raw = node.text.replace(/^import\s+/, "").replace(/;$/, "").trim();
        const alias = raw.match(/^(.*?)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/);
        refs.push({ kind: "import", name: alias?.[2] ?? alias?.[1] ?? raw, range: node.range, file, lambdaContext });
        return;
      }
      if (node.type === "user_type" || node.type === "type_identifier") {
        collectType(node, refs, file);
        return;
      }
      if (node.type === "call_expression") {
        const navigation = first(node, ["navigation_expression"]);
        let reference: SymbolReference | undefined;
        if (navigation) {
          const member = navigationMember(navigation, file);
          if (member) {
            reference = { ...member, lambdaContext };
            refs.push(reference);
          }
        } else {
          const callee = identifier(first(node, ["simple_identifier", "identifier"]));
          if (callee) {
            const kind = /^[A-Z]/.test(callee.text) ? "constructor" : "function";
            reference = { kind, name: callee.text, range: callee.range, receiver: receiverOf(node, file), file, lambdaContext };
            refs.push(reference);
          }
        }
        const callSuffix = first(node, ["call_suffix"]);
        const lambdaNodes = [
          ...(callSuffix ? findLambdaLiterals(callSuffix) : []),
          ...node.children.filter((child) => child.type === "lambda_literal"),
        ];
        const nestedCall = node.children.find((child) => child.type === "call_expression");
        const lambdaCall = reference ?? (nestedCall ? callReference(nestedCall, file, lambdaContext) : undefined);
        const lambdaContexts = new Map<KotlinAstNode, LambdaContext>();
        for (let index = 0; index < lambdaNodes.length; index++) {
          if (!lambdaCall) continue;
          lambdaContexts.set(lambdaNodes[index], {
            call: lambdaCall,
            parameterIndex: lambdaArgumentIndex(callSuffix!, lambdaNodes[index], index),
            isTrailing: !((first(callSuffix!, ["value_arguments"])?.children.filter((child) => child.type === "value_argument") ?? []).some((argument) => containsNode(argument, lambdaNodes[index]))),
            parent: lambdaContext,
          });
        }
        for (const child of node.children) {
          const childLambda = lambdaNodes.find((candidate) => containsNode(child, candidate));
          if (childLambda) {
            visitUntilLambda(child, childLambda, lambdaContexts.get(childLambda)!, lambdaContext, visit);
          } else {
            visit(child, lambdaContext);
          }
        }
        return;
      } else if (node.type === "navigation_expression") {
        const member = navigationMember(node, file);
        if (member) refs.push({ ...member, lambdaContext });
      } else if (node.type === "constructor_invocation") {
        const type = first(node, ["user_type", "type_identifier"]) ?? identifier(node);
        if (type) refs.push({ kind: "constructor", name: type.text, range: type.range, file, lambdaContext });
      }
      for (const child of node.children) visit(child, lambdaContext);
    };
    visit(ast.root);
    return annotateContainers(refs, ast.root);
  }
}

function annotateContainers(refs: SymbolReference[], root: KotlinAstNode): SymbolReference[] {
  const containers: Array<{ name: string; range: SourceRange }> = [];
  const walk = (node: KotlinAstNode): void => {
    if (node.type === "class_declaration") {
      const name = identifier(node)?.text;
      if (name) containers.push({ name, range: node.range });
    }
    for (const child of node.children) walk(child);
  };
  walk(root);
  return refs.map((reference) => {
    const containing = containers
      .filter((container) => container.range.start.offset <= reference.range.start.offset
        && container.range.end.offset >= reference.range.end.offset)
      .sort((a, b) => (a.range.end.offset - a.range.start.offset) - (b.range.end.offset - b.range.start.offset))[0];
    return containing ? { ...reference, containerName: containing.name } : reference;
  });
}

function containsNode(root: KotlinAstNode, target: KotlinAstNode): boolean {
  if (root === target) return true;
  return root.children.some((child) => containsNode(child, target));
}

function visitUntilLambda(
  node: KotlinAstNode,
  target: KotlinAstNode,
  targetContext: LambdaContext,
  inheritedContext?: LambdaContext,
  visit?: (node: KotlinAstNode, lambdaContext?: LambdaContext) => void,
): void {
  if (node === target) {
    visit?.(node, targetContext);
    return;
  }
  const child = node.children.find((candidate) => containsNode(candidate, target));
  if (!child) {
    visit?.(node, inheritedContext);
    return;
  }
  for (const sibling of node.children) {
    if (sibling === child) visitUntilLambda(sibling, target, targetContext, inheritedContext, visit);
    else visit?.(sibling, inheritedContext);
  }
}

function findLambdaLiterals(node: KotlinAstNode): KotlinAstNode[] {
  const result: KotlinAstNode[] = [];
  const visit = (candidate: KotlinAstNode): void => {
    if (candidate.type === "lambda_literal") {
      result.push(candidate);
      return;
    }
    for (const child of candidate.children) visit(child);
  };
  visit(node);
  return result;
}

function lambdaArgumentIndex(callSuffix: KotlinAstNode, lambda: KotlinAstNode, trailingIndex: number): number {
  const valueArguments = first(callSuffix, ["value_arguments"]);
  const argumentsList = valueArguments?.children.filter((child) => child.type === "value_argument") ?? [];
  const explicitIndex = argumentsList.findIndex((argument) => containsNode(argument, lambda));
  return explicitIndex >= 0 ? explicitIndex : argumentsList.length + trailingIndex;
}

export function collectReferences(ast: KotlinAst, file?: string): SymbolReference[] {
  return new ReferencePass().collect(ast, file);
}

export function findReferences(ast: KotlinAst, file?: string): SymbolReference[] {
  return collectReferences(ast, file);
}

export const referencePass = new ReferencePass();

// Phase 7: discovery only.
// Resolution is intentionally deferred to ResolutionPass.
