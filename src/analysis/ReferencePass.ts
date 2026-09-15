import type { KotlinAst, KotlinAstNode, SourceRange } from "../parser/Ast.js";

export type SymbolReferenceKind = "type" | "function" | "property" | "constructor" | "import" | "member";

/** A syntactic reference; resolution is intentionally performed by a later pass. */
export interface SymbolReference {
  kind: SymbolReferenceKind;
  name: string;
  range: SourceRange;
  receiver?: SymbolReference;
  file?: string;
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
    const nested = first(node, ["type_identifier"]);
    if (nested?.text.trim()) out.push({ kind: "type", name: nested.text.trim(), range: nested.range, file });
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

export class ReferencePass {
  collect(ast: KotlinAst, file?: string): SymbolReference[] {
    const refs: SymbolReference[] = [];
    const visit = (node: KotlinAstNode): void => {
      if (node.type === "import_header") {
        const raw = node.text.replace(/^import\s+/, "").replace(/;$/, "").trim();
        const alias = raw.match(/^(.*?)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/);
        refs.push({ kind: "import", name: alias?.[2] ?? alias?.[1] ?? raw, range: node.range, file });
        return;
      }
      if (node.type === "user_type" || node.type === "type_identifier") {
        collectType(node, refs, file);
        return;
      }
      if (node.type === "call_expression") {
        const callee = identifier(first(node, ["simple_identifier", "identifier", "navigation_expression"]));
        if (callee) {
          const kind = /^[A-Z]/.test(callee.text) ? "constructor" : "function";
          refs.push({ kind, name: callee.text, range: callee.range, receiver: receiverOf(node, file), file });
        }
      } else if (node.type === "navigation_expression") {
        const member = navigationMember(node, file);
        if (member) refs.push(member);
      } else if (node.type === "constructor_invocation") {
        const type = first(node, ["user_type", "type_identifier"]) ?? identifier(node);
        if (type) refs.push({ kind: "constructor", name: type.text, range: type.range, file });
      }
      for (const child of node.children) visit(child);
    };
    visit(ast.root);
    return refs;
  }
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
