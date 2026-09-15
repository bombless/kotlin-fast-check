import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ProjectScanner } from "./ProjectScanner.js";
import { ProjectIndex } from "./ProjectIndex.js";

interface ProjectFileState {
  file: string;
  hash: string;
}

interface ProjectIndexCacheEntry {
  files: ProjectFileState[];
  index: ProjectIndex;
}

/** Process-local cache for unchanged project indexes. */
export class ProjectIndexCache {
  private readonly entries = new Map<string, ProjectIndexCacheEntry>();

  async getOrCreate(root: string): Promise<ProjectIndex> {
    const absoluteRoot = path.resolve(root);
    const files = await new ProjectScanner().scan(absoluteRoot);
    const state = await snapshotProjectState(files);
    const cached = this.entries.get(absoluteRoot);

    if (cached && sameProjectState(cached.files, state)) return cached.index;

    const index = new ProjectIndex();
    await index.indexFiles(files);
    this.entries.set(absoluteRoot, { files: state, index });
    return index;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

function sameProjectState(previous: readonly ProjectFileState[], current: readonly ProjectFileState[]): boolean {
  return (
    previous.length === current.length &&
    current.every(
      (state, index) => state.file === previous[index]?.file && state.hash === previous[index]?.hash,
    )
  );
}

async function snapshotProjectState(files: readonly string[]): Promise<ProjectFileState[]> {
  const states = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, "utf8");
      return {
        file: path.resolve(file),
        hash: createHash("sha256").update(source, "utf8").digest("hex"),
      };
    }),
  );
  return states.sort((a, b) => a.file.localeCompare(b.file));
}

const defaultProjectIndexCache = new ProjectIndexCache();

export async function getCachedProjectIndex(root: string): Promise<ProjectIndex> {
  return defaultProjectIndexCache.getOrCreate(root);
}
