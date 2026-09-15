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
}

export interface FunctionSymbol extends Symbol {
  kind: SymbolKind.Function;
  parameterTypes: string[];
  returnType?: string;
  receiverType?: string;
}

export interface PropertySymbol extends Symbol {
  kind: SymbolKind.Property | SymbolKind.Field;
  type?: string;
}

export interface ImportSymbol {
  path: string;
  alias?: string;
  wildcard: boolean;
  range: import("../parser/Ast.js").SourceRange;
}
