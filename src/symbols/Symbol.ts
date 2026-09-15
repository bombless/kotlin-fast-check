export enum SymbolKind {
  Package = "package",
  Class = "class",
  Interface = "interface",
  Object = "object",
  Enum = "enum",
  EnumEntry = "enum-entry",
  TypeAlias = "typealias",
  Constructor = "constructor",
  Function = "function",
  Property = "property",
  Field = "field",
  Parameter = "parameter",
  TypeParameter = "type-parameter",
}

export interface Symbol {
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  container?: Symbol;
}

export interface TypeSymbol extends Symbol {
  kind: SymbolKind.Class | SymbolKind.Interface | SymbolKind.Object | SymbolKind.Enum | SymbolKind.TypeAlias;
  superclass?: string;
  interfaces: string[];
  members: Symbol[];
  typeAliasTarget?: string;
}

export interface ParameterSymbol extends Symbol {
  kind: SymbolKind.Parameter;
  type?: string;
  typeRef?: import("./TypeRef.js").TypeRef;
}

export interface ConstructorSymbol extends Symbol {
  kind: SymbolKind.Constructor;
  parameterTypes: string[];
  parameterTypeRefs: import("./TypeRef.js").TypeRef[];
}

export interface FunctionSymbol extends Symbol {
  kind: SymbolKind.Function;
  parameterTypes: string[];
  parameterTypeRefs: import("./TypeRef.js").TypeRef[];
  parameters: ParameterSymbol[];
  returnType?: string;
  returnTypeRef?: import("./TypeRef.js").TypeRef;
  receiverType?: string;
}

export interface PropertySymbol extends Symbol {
  kind: SymbolKind.Property | SymbolKind.Field;
  type?: string;
  typeRef?: import("./TypeRef.js").TypeRef;
}

export interface ImportSymbol {
  path: string;
  alias?: string;
  wildcard: boolean;
  range: import("../parser/Ast.js").SourceRange;
}