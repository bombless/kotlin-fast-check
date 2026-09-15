import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export interface GradleClasspathDiscoveryResult {
  projectRoot: string;
  jars: string[];
  searchedDirectories: string[];
  warnings: string[];
}

const GRADLE_MARKERS = ["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"];

/** Best-effort discovery of project-local Gradle JARs; no Gradle DSL parsing or dependency guessing. */
export class GradleClasspath {
  async discover(projectRoot: string): Promise<GradleClasspathDiscoveryResult> {
    const root = path.resolve(projectRoot);
    const rootInfo = await stat(root).catch(() => undefined);
    if (!rootInfo?.isDirectory()) {
      return {
        projectRoot: root,
        jars: [],
        searchedDirectories: [],
        warnings: [`Gradle project directory does not exist: ${root}`],
      };
    }

    const entries = await readdir(root);
    const hasGradleMarker = entries.some((entry) => GRADLE_MARKERS.includes(entry));
    const searchedDirectories: string[] = [];
    const jars = new Set<string>();

    for (const name of ["libs", "build", ".gradle"]) {
      const directory = path.join(root, name);
      const info = await stat(directory).catch(() => undefined);
      if (!info?.isDirectory()) continue;
      searchedDirectories.push(directory);
      await this.collectJars(directory, jars);
    }

    const warnings: string[] = [];
    if (!hasGradleMarker) warnings.push(`No Gradle build/settings file found at project root: ${root}`);
    if (jars.size === 0) {
      warnings.push(`No JAR files discovered under: ${searchedDirectories.length > 0 ? searchedDirectories.join(", ") : root}`);
    }

    return {
      projectRoot: root,
      jars: [...jars].sort((a, b) => a.localeCompare(b)),
      searchedDirectories: searchedDirectories.sort((a, b) => a.localeCompare(b)),
      warnings,
    };
  }

  private async collectJars(directory: string, jars: Set<string>): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.collectJars(entryPath, jars);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".jar")) {
        jars.add(path.normalize(path.resolve(entryPath)));
      }
    }
  }
}

export async function discoverGradleClasspath(projectRoot: string): Promise<GradleClasspathDiscoveryResult> {
  return new GradleClasspath().discover(projectRoot);
}
