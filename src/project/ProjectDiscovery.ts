import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface GradleProjectInfo {
  root: string;
  compileSdk?: number;
}

/** Find the nearest directory that owns a Gradle build for a source file. */
export async function findGradleProjectRoot(file: string): Promise<string | undefined> {
  let current = path.dirname(path.resolve(file));
  let nearestBuildRoot: string | undefined;
  while (true) {
    const entries = await readdir(current);
    const hasSettings = entries.includes("settings.gradle") || entries.includes("settings.gradle.kts");
    const hasWrapper = entries.includes("gradlew") || entries.includes("gradlew.bat");
    const hasBuild = entries.includes("build.gradle") || entries.includes("build.gradle.kts");
    if (hasSettings || hasWrapper) return current;
    if (hasBuild && nearestBuildRoot === undefined) nearestBuildRoot = current;
    const parent = path.dirname(current);
    if (parent === current) return nearestBuildRoot;
    current = parent;
  }
}

/** Read an Android compileSdk declaration from the discovered Gradle build. */
export async function discoverCompileSdk(projectRoot: string): Promise<number | undefined> {
  const candidates = ["build.gradle.kts", "build.gradle"];
  const roots = [projectRoot, path.join(projectRoot, "app")];
  for (const root of roots) {
    for (const name of candidates) {
      const file = path.join(root, name);
      if (!(await stat(file).catch(() => undefined))) continue;
      const source = await readFile(file, "utf8");
      const match = /\bcompileSdk(?:Version)?\s*(?:=|\s)\s*(\d+)\b/.exec(source);
      if (match) return Number(match[1]);
    }
  }
  return undefined;
}

export async function discoverGradleProject(file: string): Promise<GradleProjectInfo | undefined> {
  const root = await findGradleProjectRoot(file);
  if (!root) return undefined;
  return { root, compileSdk: await discoverCompileSdk(root) };
}
