import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

export interface GradleClasspathDiscoveryResult {
  projectRoot: string;
  jars: string[];
  searchedDirectories: string[];
  warnings: string[];
}

const execFileAsync = promisify(execFile);
const GRADLE_MARKERS = ["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"];

/** Resolve the same compile classpath Gradle gives to the Android/Kotlin compiler. */
export class GradleClasspath {
  async discover(projectRoot: string): Promise<GradleClasspathDiscoveryResult> {
    const root = path.resolve(projectRoot);
    const rootInfo = await stat(root).catch(() => undefined);
    if (!rootInfo?.isDirectory()) {
      return { projectRoot: root, jars: [], searchedDirectories: [], warnings: [`Gradle project directory does not exist: ${root}`] };
    }

    const entries = await readdir(root);
    const hasGradleMarker = entries.some((entry) => GRADLE_MARKERS.includes(entry));
    const hasGradleBuild = hasGradleMarker && (entries.includes("app") || entries.includes("gradlew.bat") || entries.includes("gradlew"));
    const searchedDirectories: string[] = [];
    const jars = new Set<string>();
    const warnings: string[] = [];

    if (hasGradleBuild) {
      try {
        for (const file of await this.resolveCompileClasspath(root)) jars.add(file);
      } catch (error) {
      const details = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
        warnings.push(`Unable to resolve Gradle compile classpath: ${error instanceof Error ? error.message : String(error)}${details ? `\n${details.trim()}` : ""}`);
      }
    }

    for (const name of ["libs", "build", ".gradle"]) {
      const directory = path.join(root, name);
      const info = await stat(directory).catch(() => undefined);
      if (!info?.isDirectory()) continue;
      searchedDirectories.push(directory);
      await this.collectJars(directory, jars);
    }

    if (!hasGradleMarker) warnings.push(`No Gradle build/settings file found at project root: ${root}`);
    if (jars.size === 0) warnings.push(`No JAR files discovered for: ${root}`);

    return { projectRoot: root, jars: [...jars].sort((a, b) => a.localeCompare(b)), searchedDirectories: searchedDirectories.sort((a, b) => a.localeCompare(b)), warnings };
  }

  private async resolveCompileClasspath(root: string): Promise<string[]> {
    const tempRoot = process.env.TEMP ?? process.env.TMP ?? ".";
    const initDir = await mkdtemp(path.join(tempRoot, "kfc-gradle-"));
    const initScript = path.join(initDir, "init.gradle");
    const script = [
      "gradle.rootProject { root ->",
      "  root.allprojects { project ->",
      "    if (project == root.findProject(':app') || project.path == root.path) {",
      "      project.tasks.register('kfcPrintClasspath') {",
      "        doLast {",
      "          def name = project.configurations.names.find { it == 'debugCompileClasspath' } ?: project.configurations.names.find { it.endsWith('CompileClasspath') && !it.toLowerCase().contains('test') }",
      "          if (name != null) println('KFC_CLASSPATH=' + project.configurations.getByName(name).files.collect { it.absolutePath }.join(java.io.File.pathSeparator))",
      "        }",
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n");
    await writeFile(initScript, script, "utf8");
    try {
      const executable = await this.findGradleExecutable(root);
      const { stdout, stderr } = await execFileAsync(executable, [":app:kfcPrintClasspath", "--no-daemon", "--console=plain", "--init-script", initScript], { cwd: root, windowsHide: true, shell: process.platform === "win32", maxBuffer: 20 * 1024 * 1024 });
      const files = new Set<string>();
      for (const line of `${stdout}\n${stderr}`.split(/\r?\n/)) {
        const marker = "KFC_CLASSPATH=";
        const at = line.indexOf(marker);
        if (at < 0) continue;
        for (const file of line.slice(at + marker.length).trim().split(path.delimiter)) if (file) files.add(path.normalize(path.resolve(file)));
      }
      return [...files];
    } finally {
      await rm(initDir, { recursive: true, force: true });
    }
  }

  private async findGradleExecutable(root: string): Promise<string> {
    const wrapper = path.join(root, "gradlew.bat");
    if ((await stat(wrapper).catch(() => undefined))?.isFile()) return wrapper;
    return process.platform === "win32" ? "gradle.bat" : "gradle";
  }

  private async collectJars(directory: string, jars: Set<string>): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await this.collectJars(entryPath, jars);
      else if (entry.isFile() && /\.(jar|aar)$/i.test(entry.name)) jars.add(path.normalize(path.resolve(entryPath)));
    }
  }
}

export async function discoverGradleClasspath(projectRoot: string): Promise<GradleClasspathDiscoveryResult> {
  return new GradleClasspath().discover(projectRoot);
}
