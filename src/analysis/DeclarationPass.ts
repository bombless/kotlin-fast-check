import type { KotlinAstNode } from "../parser/Ast.js";
import type { SourceIndex } from "../symbols/SymbolTable.js";
import { SymbolKind, type FunctionSymbol, type PropertySymbol, type Symbol, type TypeSymbol } from "../symbols/Symbol.js";
import { SymbolTable } from "../symbols/SymbolTable.js";

const typeKinds: Record<string, TypeSymbol["kind"]> = {
  class_declaration: SymbolKind.Class,
  object_declaration: SymbolKind.Object,
  enum_class: SymbolKind.Enum,
  enum_class_declaration: SymbolKind.Enum,
  type_alias: SymbolKind.TypeAlias,
};

function child(node: KotlinAstNode, type: string): KotlinAstNode | undefined {
  return node.children.find((candidate) => candidate.type === type);
}

function firstChild(node: KotlinAstNode, types: string[]): KotlinAstNode | undefined {
  return node.children.find((candidate) => types.includes(candidate.type));
}

function identifierText(node: KotlinAstNode): string | undefined {
  return firstChild(node, ["type_identifier", "simple_identifier", "identifier"])?.text;
}

function declarationName(node: KotlinAstNode): string | undefined {
  if (node.type === "property_declaration") {
    const variable = child(node, "variable_declaration");
    return variable ? identifierText(variable) : undefined;
  }
  return identifierText(node);
}

function qualifiedName(container: string | undefined, name: string): string {
  return container ? `${container}.${name}` : name;
}

function parseImports(root: KotlinAstNode): SourceIndex["imports"] {
  const imports: SourceIndex["imports"] = [];
  walk(root, (node) => {
    if (node.type !== "import_header") return;
    const text = node.text.replace(/^import\s+/, "").trim();
    const parts = text.split(/\s+as\s+/);
    const path = parts[0].replace(/;$/, "").trim();
    imports.push({
      path: path.replace(/\.\*$/, ""),
      alias: parts[1]?.replace(/;$/, "").trim() || undefined,
      wildcard: /\.\*$/.test(parts[0]),
      range: node.range,
    });
  });
  return imports;
}

function walk(node: KotlinAstNode, visit: (node: KotlinAstNode) => void): void {
  visit(node);
  for (const childNode of node.children) walk(childNode, visit);
}

function collectType(node: KotlinAstNode, packageName: string, container?: TypeSymbol): TypeSymbol | undefined {
  const kind = typeKinds[node.type];
  if (!kind) return undefined;
  const name = declarationName(node);
  if (!name) return undefined;

  const qn = qualifiedName(container?.qualifiedName ?? (packageName || undefined), name);
  const symbol: TypeSymbol = {
    name,
    qualifiedName: qn,
    kind,
    container,
    interfaces: [],
    members: [],
  };

  const header = node.text.slice(0, node.text.indexOf("{") >= 0 ? node.text.indexOf("{") : node.text.length);
  const colon = header.indexOf(":");
  if (colon >= 0) {
    const bases = header.slice(colon + 1).split(",").map((value) => value.trim().replace(/\(.*$/, "")).filter(Boolean);
    symbol.superclass = bases[0];
    symbol.interfaces = bases.slice(1);
  }
  return symbol;
}

export function collectDeclarations(ast: { root: KotlinAstNode }): SourceIndex {
  let packageName = "";
  const symbols = new SymbolTable();
  const imports = parseImports(ast.root);

  const packageNode = ast.root.children.find((node) => node.type === "package_header");
  if (packageNode) packageName = child(packageNode, "identifier")?.text ?? packageNode.text.replace(/^package\s+/, "").replace(/;$/, "").trim();

  const visit = (node: KotlinAstNode, container?: TypeSymbol): void => {
    const type = collectType(node, packageName, container);
    if (type) {
      symbols.add(type);
      if (container) container.members.push(type);
      for (const member of node.children) visit(member, type);
      return;
    }

    if (node.type === "function_declaration") {
      const name = declarationName(node);
      if (name) {
        const symbol: FunctionSymbol = {
          name,
          qualifiedName: qualifiedName(container?.qualifiedName ?? (packageName || undefined), name),
          kind: SymbolKind.Function,
          container,
          parameterTypes: [],
        };
        symbols.add(symbol);
        if (container) container.members.push(symbol);
      }
    } else if (node.type === "property_declaration") {
      const name = declarationName(node);
      if (name) {
        const symbol: PropertySymbol = {
          name,
          qualifiedName: qualifiedName(container?.qualifiedName ?? (packageName || undefined), name),
          kind: SymbolKind.Property,
          container,
        };
        symbols.add(symbol);
        if (container) container.members.push(symbol);
      }
    } else if (node.type === "enum_entry") {
      const name = declarationName(node);
      if (name && container) {
        const symbol: Symbol = {
          name,
          qualifiedName: `${container.qualifiedName}.${name}`,
          kind: SymbolKind.EnumEntry,
          container,
        };
        symbols.add(symbol);
        container.members.push(symbol);
      }
    }

    for (const member of node.children) visit(member, container);
  };

  for (const node of ast.root.children) visit(node);
  return { packageName, imports, symbols };
}
