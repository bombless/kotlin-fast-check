import { readFile } from "node:fs/promises";
import { collectDeclarations } from "../analysis/DeclarationPass.js";
import type { KotlinAst } from "../parser/Ast.js";
import { parseKotlin } from "../parser/KotlinParser.js";
import type { Symbol } from "../symbols/Symbol.js";
import { SymbolTable, type SourceIndex } from "../symbols/SymbolTable.js";
import { ProjectScanner } from "./ProjectScanner.js";

export interface ProjectSource {
  file: string;
  packageName: string;
  imports: SourceIndex["imports"];
}

/** Aggregates source declarations into one project-level symbol source. */
export class ProjectIndex {
  private readonly symbols = new SymbolTable();
  private readonly sources = new Map<string, ProjectSource>();

  addSource(file: string, ast: KotlinAst): SourceIndex {
    const declarations = collectDeclarations(ast);
    this.sources.set(file, {
      file,
      packageName: declarations.packageName,
      imports: declarations.imports,
    });
    this.symbols.addAll(declarations.symbols.values());
    return declarations;
  }

  async addFile(file: string): Promise<SourceIndex> {
    const source = await readFile(file, "utf8");
    return this.addSource(file, parseKotlin(source));
  }

  async indexFiles(files: Iterable<string>): Promise<void> {
    for (const file of files) await this.addFile(file);
  }

  async indexProject(root: string): Promise<string[]> {
    const files = await new ProjectScanner().scan(root);
    await this.indexFiles(files);
    return files;
  }

  get(qualifiedName: string): Symbol | undefined {
    return this.symbols.get(qualifiedName);
  }

  findTypesByName(name: string) {
    return this.symbols.findTypesByName(name);
  }

  findFunctionsByName(name: string) {
    return this.symbols.findFunctionsByName(name);
  }

  findPropertiesByName(name: string) {
    return this.symbols.findPropertiesByName(name);
  }

  has(qualifiedName: string): boolean {
    return this.symbols.has(qualifiedName);
  }

  getSource(file: string): ProjectSource | undefined {
    return this.sources.get(file);
  }

  get symbolTable(): SymbolTable {
    return this.symbols;
  }

  values(): IterableIterator<Symbol> {
    return this.symbols.values();
  }
}
