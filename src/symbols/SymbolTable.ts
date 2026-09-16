import type { FunctionSymbol, ImportSymbol, PropertySymbol, Symbol, TypeSymbol } from "./Symbol.js";
import { resolutionProfiler } from "../util/ResolutionProfiler.js";

export class SymbolTable {
  private readonly symbols = new Map<string, Symbol>();

  add(symbol: Symbol): void {
    this.symbols.set(symbol.qualifiedName, symbol);
  }

  addAll(symbols: Iterable<Symbol>): void {
    for (const symbol of symbols) this.add(symbol);
  }

  get(qualifiedName: string): Symbol | undefined {
    resolutionProfiler.lookup("symbol");
    return this.symbols.get(qualifiedName);
  }

  has(qualifiedName: string): boolean {
    return this.symbols.has(qualifiedName);
  }

  findTypesByName(name: string): TypeSymbol[] {
    const result = [...this.symbols.values()].filter(
      (symbol): symbol is TypeSymbol => symbol.name === name && "interfaces" in symbol,
    );
    resolutionProfiler.lookup("type");
    resolutionProfiler.candidates(this.symbols.size, result.length);
    return result;
  }

  findFunctionsByName(name: string): FunctionSymbol[] {
    const result = [...this.symbols.values()].filter(
      (symbol): symbol is FunctionSymbol => symbol.name === name && symbol.kind === "function",
    );
    resolutionProfiler.lookup("function");
    resolutionProfiler.candidates(this.symbols.size, result.length);
    return result;
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
