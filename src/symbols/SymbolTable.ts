import type { FunctionSymbol, ImportSymbol, PropertySymbol, Symbol, TypeSymbol } from "./Symbol.js";

export class SymbolTable {
  private readonly symbols = new Map<string, Symbol>();

  add(symbol: Symbol): void {
    this.symbols.set(symbol.qualifiedName, symbol);
  }

  addAll(symbols: Iterable<Symbol>): void {
    for (const symbol of symbols) this.add(symbol);
  }

  get(qualifiedName: string): Symbol | undefined {
    return this.symbols.get(qualifiedName);
  }

  has(qualifiedName: string): boolean {
    return this.symbols.has(qualifiedName);
  }

  findTypesByName(name: string): TypeSymbol[] {
    return [...this.symbols.values()].filter(
      (symbol): symbol is TypeSymbol => symbol.name === name && "interfaces" in symbol,
    );
  }

  findFunctionsByName(name: string): FunctionSymbol[] {
    return [...this.symbols.values()].filter(
      (symbol): symbol is FunctionSymbol => symbol.name === name && symbol.kind === "function",
    );
  }

  findPropertiesByName(name: string): PropertySymbol[] {
    return [...this.symbols.values()].filter(
      (symbol): symbol is PropertySymbol =>
        symbol.name === name && (symbol.kind === "property" || symbol.kind === "field"),
    );
  }

  values(): IterableIterator<Symbol> {
    return this.symbols.values();
  }
}

export interface SourceIndex {
  packageName: string;
  imports: ImportSymbol[];
  symbols: SymbolTable;
}
