import { readdir } from "node:fs/promises";
import path from "node:path";

export class ProjectScanner {
  async scan(root: string): Promise<string[]> {
    const absoluteRoot = path.resolve(root);
    const files: string[] = [];

    await this.scanDirectory(absoluteRoot, files);

    return [...new Set(files)].sort((a, b) => a.localeCompare(b));
  }

  private async scanDirectory(directory: string, files: string[]): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(entryPath, files);
        continue;
      }

      if (entry.isFile() && (entry.name.endsWith(".kt") || entry.name.endsWith(".kts"))) {
        files.push(path.normalize(path.resolve(entryPath)));
      }
    }
  }
}
