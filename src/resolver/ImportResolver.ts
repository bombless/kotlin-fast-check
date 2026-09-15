import type { ImportSymbol } from "../symbols/Symbol.js";

export class ImportResolver {
  resolve(name: string, imports: ImportSymbol[]): string[] {
    const results: string[] = [];
    for (const item of imports) {
      const importedName = item.alias ?? item.path.split(".").pop();
      if (!item.wildcard && importedName === name) results.push(item.path);
      if (item.wildcard) results.push(`${item.path}.${name}`);
    }
    return results;
  }
}