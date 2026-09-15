import Parser from "tree-sitter";
import Kotlin from "tree-sitter-kotlin";
import { createHash } from "node:crypto";
import type { KotlinAst, KotlinAstNode, SourcePosition, SourceRange } from "./Ast.js";

function position(point: { row: number; column: number }, offset: number): SourcePosition {
  return { row: point.row, column: point.column, offset };
}

function convertNode(node: Parser.SyntaxNode, source: string): KotlinAstNode {
  const range: SourceRange = {
    start: position(node.startPosition, node.startIndex),
    end: position(node.endPosition, node.endIndex),
  };

  const fields: Record<string, KotlinAstNode | undefined> = {};
  for (const fieldName of ["name", "type", "receiver", "parameters", "body", "value"]) {
    const fieldNode = node.childForFieldName(fieldName);
    if (fieldNode) fields[fieldName] = convertNode(fieldNode, source);
  }

  return {
    type: node.type,
    text: source.slice(node.startIndex, node.endIndex),
    named: node.isNamed,
    range,
    children: node.namedChildren.map((child) => convertNode(child, source)),
    fields,
  };
}

export class KotlinParser {
  private readonly parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(Kotlin);
  }

  parse(source: string): KotlinAst {
    const tree = this.parser.parse(source);
    if (!tree) throw new Error("Tree-sitter returned no syntax tree");

    return {
      root: convertNode(tree.rootNode, source),
      hasErrors: tree.rootNode.hasError,
      source,
    };
  }
}

export class ParserCache {
  private readonly entries = new Map<string, KotlinAst>();
  private readonly parser: KotlinParser;

  constructor(parser = new KotlinParser()) {
    this.parser = parser;
  }

  parse(source: string): KotlinAst {
    const key = createHash("sha256").update(source, "utf8").digest("hex");
    const cached = this.entries.get(key);
    if (cached) return cached;

    const ast = this.parser.parse(source);
    this.entries.set(key, ast);
    return ast;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

const defaultParserCache = new ParserCache();

export function parseKotlin(source: string): KotlinAst {
  return defaultParserCache.parse(source);
}
