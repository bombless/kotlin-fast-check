import type { KotlinAstNode } from "../parser/Ast.js";
import type { SourceIndex } from "../symbols/SymbolTable.js";
import { SymbolKind, type ConstructorSymbol, type FunctionSymbol, type ParameterSymbol, type PropertySymbol, type Symbol, type TypeSymbol } from "../symbols/Symbol.js";
import { parseTypeRef, type TypeRef } from "../symbols/TypeRef.js";
import { SymbolTable } from "../symbols/SymbolTable.js";

function child(node: KotlinAstNode, type: string): KotlinAstNode | undefined {
  return node.children.find((candidate) => candidate.type === type);
}

function children(node: KotlinAstNode, type: string): KotlinAstNode[] {
  return node.children.filter((candidate) => candidate.type === type);
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

function typeText(node: KotlinAstNode | undefined): string | undefined {
  if (!node) return undefined;
  const candidate = firstChild(node, [
    "user_type",
    "nullable_type",
    "function_type",
    "type_identifier",
    "parenthesized_type",
    "type_projection",
  ]);
  return candidate?.text ?? node.text;
}

function typeInfo(node: KotlinAstNode | undefined): { text?: string; ref?: TypeRef } {
  const text = typeText(node);
  return text ? { text, ref: parseTypeRef(text) } : {};
}

function parameterNodes(node: KotlinAstNode): KotlinAstNode[] {
  const parameterList = child(node, "function_value_parameters");
  if (parameterList) return children(parameterList, "parameter");
  return children(node, "class_parameter");
}
function parameterSymbol(node: KotlinAstNode, container: Symbol, index: number): ParameterSymbol | undefined {
  const name = identifierText(node);
  if (!name) return undefined;
  const type = typeInfo(node);
  return {
    name,
    qualifiedName: `${container.qualifiedName}.${name}#${index}`,
    kind: SymbolKind.Parameter,
    container,
    type: type.text,
    typeRef: type.ref,
  };
}

function parseImports(root: KotlinAstNode): SourceIndex["imports"] {
  const imports: SourceIndex["imports"] = [];
  walk(root, (node) => {
    if (node.type !== "import_header") return;
    const text = node.text.replace(/^import\s+/, "").trim();
    const parts = text.split(/\s+as\s+/);
    const rawPath = parts[0].replace(/;$/, "").trim();
    imports.push({
      path: rawPath.replace(/\.\*$/, ""),
      alias: parts[1]?.replace(/;$/, "").trim() || undefined,
      wildcard: /\.\*$/.test(rawPath),
      range: node.range,
    });
  });
  return imports;
}

function walk(node: KotlinAstNode, visit: (node: KotlinAstNode) => void): void {
  visit(node);
  for (const childNode of node.children) walk(childNode, visit);
}

function baseTypes(node: KotlinAstNode): string[] {
  const delegationNodes = children(node, "delegation_specifier");
  if (delegationNodes.length) {
    return delegationNodes
      .map((candidate) => candidate.text.trim().replace(/\(.*$/, "").trim())
      .filter(Boolean);
  }
  const header = node.text.slice(0, node.text.indexOf("{") >= 0 ? node.text.indexOf("{") : node.text.length);
  const colon = header.lastIndexOf(":");
  if (colon < 0) return [];
  return header.slice(colon + 1).split(",").map((value) => value.trim().replace(/\(.*$/, "").trim()).filter(Boolean);
}

function isInterface(node: KotlinAstNode): boolean {
  return node.type === "class_declaration" && /^interface\b/.test(node.text.trim());
}

function isEnum(node: KotlinAstNode): boolean {
  return node.type === "class_declaration" && /^enum\s+class\b/.test(node.text.trim());
}

function collectType(node: KotlinAstNode, packageName: string, container?: TypeSymbol): TypeSymbol | undefined {
  if (!["class_declaration", "object_declaration", "type_alias"].includes(node.type)) return undefined;
  const name = declarationName(node);
  if (!name) return undefined;

  const kind = node.type === "object_declaration"
    ? SymbolKind.Object
    : node.type === "type_alias"
      ? SymbolKind.TypeAlias
      : isEnum(node)
        ? SymbolKind.Enum
        : isInterface(node)
          ? SymbolKind.Interface
          : SymbolKind.Class;
  const qn = qualifiedName(container?.qualifiedName ?? (packageName || undefined), name);
  const bases = baseTypes(node);
  const symbol: TypeSymbol = {
    name,
    qualifiedName: qn,
    kind,
    container,
    interfaces: kind === SymbolKind.Interface ? bases : bases.slice(1),
    members: [],
  };

  if (kind === SymbolKind.Class && bases.length) symbol.superclass = bases[0];
  if (kind === SymbolKind.TypeAlias) {
    const target = node.children.find((candidate) => candidate.type === "user_type" || candidate.type === "nullable_type");
    symbol.typeAliasTarget = target?.text;
  }
  return symbol;
}

function addConstructor(
  node: KotlinAstNode,
  type: TypeSymbol,
  symbols: SymbolTable,
  parameters: KotlinAstNode[],
): void {
  const parameterSymbols: ParameterSymbol[] = [];
  const parameterTypes: string[] = [];
  const parameterTypeRefs: TypeRef[] = [];
  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameterSymbol(parameters[i], type, i);
    if (parameter) {
      parameterSymbols.push(parameter);
      if (parameter.type) parameterTypes.push(parameter.type);
      if (parameter.typeRef) parameterTypeRefs.push(parameter.typeRef);
      symbols.add(parameter);
    }
  }
  const signature = parameterTypes.join(", ");
  const constructor: ConstructorSymbol = {
    name: type.name,
    qualifiedName: `${type.qualifiedName}.constructor(${signature})`,
    kind: SymbolKind.Constructor,
    container: type,
    parameterTypes,
    parameterTypeRefs,
  };
  symbols.add(constructor);
  type.members.push(constructor);

  // Kotlin primary-constructor val/var parameters are also properties.
  for (const parameter of parameters) {
    if (!/^\s*(?:val|var)\b/.test(parameter.text)) continue;
    const name = identifierText(parameter);
    const typeInfoValue = typeInfo(parameter);
    if (!name) continue;
    const property: PropertySymbol = {
      name,
      qualifiedName: `${type.qualifiedName}.${name}`,
      kind: SymbolKind.Property,
      container: type,
      type: typeInfoValue.text,
      typeRef: typeInfoValue.ref,
    };
    symbols.add(property);
    type.members.push(property);
  }
}

function collectFunction(node: KotlinAstNode, packageName: string, container: TypeSymbol | undefined, symbols: SymbolTable): void {
  const name = declarationName(node);
  if (!name) return;
  const parameters = parameterNodes(node);
  const parameterSymbols: ParameterSymbol[] = [];
  const parameterTypes: string[] = [];
  const parameterTypeRefs: TypeRef[] = [];
  const qn = qualifiedName(container?.qualifiedName ?? (packageName || undefined), name);
  const symbol: FunctionSymbol = {
    name,
    qualifiedName: qn,
    kind: SymbolKind.Function,
    container,
    parameterTypes,
    parameterTypeRefs,
    parameters: parameterSymbols,
  };

  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameterSymbol(parameters[i], symbol, i);
    if (!parameter) continue;
    parameterSymbols.push(parameter);
    if (parameter.type) parameterTypes.push(parameter.type);
    if (parameter.typeRef) parameterTypeRefs.push(parameter.typeRef);
    symbols.add(parameter);
  }
  const returnType = typeInfo(node.children.find((candidate) => candidate.type === "user_type" || candidate.type === "nullable_type" || candidate.type === "function_type"));
  symbol.returnType = returnType.text;
  symbol.returnTypeRef = returnType.ref;
  symbols.add(symbol);
  if (container) container.members.push(symbol);
}

function collectProperty(node: KotlinAstNode, packageName: string, container: TypeSymbol | undefined, symbols: SymbolTable): void {
  const name = declarationName(node);
  if (!name) return;
  const variable = child(node, "variable_declaration");
  const type = typeInfo(variable);
  const symbol: PropertySymbol = {
    name,
    qualifiedName: qualifiedName(container?.qualifiedName ?? (packageName || undefined), name),
    kind: SymbolKind.Property,
    container,
    type: type.text,
    typeRef: type.ref,
  };
  symbols.add(symbol);
  if (container) container.members.push(symbol);
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

      if (node.type === "class_declaration") {
        const primary = child(node, "primary_constructor");
        if (primary) addConstructor(primary, type, symbols, parameterNodes(primary));
      }
      for (const member of node.children) visit(member, type);
      return;
    }

    if (node.type === "secondary_constructor") {
      if (container) addConstructor(node, container, symbols, parameterNodes(node));
    } else if (node.type === "function_declaration") {
      collectFunction(node, packageName, container, symbols);
    } else if (node.type === "property_declaration") {
      collectProperty(node, packageName, container, symbols);
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