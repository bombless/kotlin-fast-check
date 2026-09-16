import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { perf } from "../util/PerformanceLogger.js";

export interface GradleClasspathDiscoveryResult {
  projectRoot: string;
  jars: string[];
  searchedDirectories: string[];
  warnings: string[];
}

export interface GradleClasspathCache {
  version: 1;
  projectRoot: string;
  generatedAt: string;
  fingerprint: string;
  jars: string[];
}

const execFileAsync = promisify(execFile);
const GRADLE_MARKERS = ["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"];
const CACHE_VERSION = 1 as const;
const CACHE_DIRECTORY = ".kotlin-fast-check";
const CACHE_FILE = "classpath.json";
const FINGERPRINT_FILES = [
  "settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts",
  "gradle.properties", path.join("gradle", "libs.versions.toml"),
  path.join("app", "build.gradle"), path.join("app", "build.gradle.kts"),
];

/** Resolve the same compile classpath Gradle gives to the Android/Kotlin compiler. */
export class GradleClasspath {
  async discover(projectRoot: string): Promise<GradleClasspathDiscoveryResult> {
    const end = perf.start("GradleClasspath.discover", { projectRoot: path.resolve(projectRoot) });
    const root = path.resolve(projectRoot);
    const rootInfo = await stat(root).catch(() => undefined);
    if (!rootInfo?.isDirectory()) {
      end({ jars: 0, result: "missing-project" });
      return { projectRoot: root, jars: [], searchedDirectories: [], warnings: [`Gradle project directory does not exist: ${root}`] };
    }

    const entries = await readdir(root);
    const hasGradleMarker = entries.some((entry) => GRADLE_MARKERS.includes(entry));
    const hasGradleBuild = hasGradleMarker && (entries.includes("app") || entries.includes("gradlew.bat") || entries.includes("gradlew"));
    const warnings: string[] = [];

    if (hasGradleBuild) {
      const cached = await this.readCache(root);
      if (cached) {
        end({ jars: cached.jars.length, result: "cache-hit" });
        return { projectRoot: root, jars: cached.jars, searchedDirectories: [], warnings: [] };
      }
    }

    const jars = new Set<string>();
    if (hasGradleBuild) {
      try {
        for (const file of await this.resolveCompileClasspath(root)) jars.add(file);
        if (jars.size > 0) await this.writeCache(root, [...jars].sort((a, b) => a.localeCompare(b)));
      } catch (error) {
        const details = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
        warnings.push(`Unable to resolve Gradle compile classpath: ${error instanceof Error ? error.message : String(error)}${details ? `\n${details.trim()}` : ""}`);
      }
    }

    // Non-Gradle fixtures retain the legacy local JAR discovery; real Gradle projects
    // rely exclusively on the compiler classpath returned by Gradle.
    if (!hasGradleBuild) {
      for (const name of ["libs", "build", ".gradle"]) {
        const directory = path.join(root, name);
        const info = await stat(directory).catch(() => undefined);
        if (info?.isDirectory()) await this.collectJars(directory, jars);
      }
    }

    if (!hasGradleMarker) warnings.push(`No Gradle build/settings file found at project root: ${root}`);
    if (jars.size === 0) warnings.push(`No JAR files discovered for: ${root}`);

    end({ jars: jars.size, result: hasGradleBuild ? "gradle" : "legacy-local" });
    return { projectRoot: root, jars: [...jars].sort((a, b) => a.localeCompare(b)), searchedDirectories: [], warnings };
  }

  private async readCache(root: string): Promise<GradleClasspathCache | undefined> {
    const cacheFile = path.join(root, CACHE_DIRECTORY, CACHE_FILE);
    const readEnd = perf.start("GradleClasspath.cacheRead", { cacheFile });
    try {
      const parsed = JSON.parse(await readFile(cacheFile, "utf8")) as Partial<GradleClasspathCache>;
      if (parsed.version !== CACHE_VERSION) {
        readEnd({ result: "miss", reason: "unsupported-version" });
        perf.log("GradleClasspath.cache", { result: "MISS", reason: "unsupported-version" });
        return undefined;
      }
      if (parsed.projectRoot !== root) {
        readEnd({ result: "miss", reason: "project-root-mismatch" });
        perf.log("GradleClasspath.cache", { result: "MISS", reason: "project-root-mismatch" });
        return undefined;
      }
      if (typeof parsed.fingerprint !== "string" || !Array.isArray(parsed.jars)) {
        readEnd({ result: "miss", reason: "invalid-json" });
        perf.log("GradleClasspath.cache", { result: "MISS", reason: "invalid-json" });
        return undefined;
      }
      const fingerprintEnd = perf.start("GradleClasspath.fingerprint", { files: FINGERPRINT_FILES.length });
      const currentFingerprint = await this.fingerprint(root);
      fingerprintEnd();
      if (parsed.fingerprint !== currentFingerprint) {
        readEnd({ result: "miss", reason: "fingerprint-mismatch" });
        perf.log("GradleClasspath.cache", { result: "MISS", reason: "fingerprint-mismatch" });
        return undefined;
      }
      const jars = parsed.jars.map((jar) => typeof jar === "string" ? path.normalize(path.resolve(jar)) : "");
      const validationEnd = perf.start("GradleClasspath.cacheValidation", { jars: jars.length });
      let missing = 0;
      for (const jar of jars) {
        if (!jar || !(await stat(jar).catch(() => undefined))?.isFile()) {
          missing += 1;
          validationEnd({ missing });
          readEnd({ result: "miss", reason: "missing-jar" });
          perf.log("GradleClasspath.cache", { result: "MISS", reason: "missing-jar", missing });
          return undefined;
        }
      }
      validationEnd({ missing: 0 });
      readEnd({ result: "hit", jars: jars.length });
      perf.log("GradleClasspath.cache", { result: "HIT", jars: jars.length });
      return { version: CACHE_VERSION, projectRoot: root, generatedAt: String(parsed.generatedAt ?? ""), fingerprint: parsed.fingerprint, jars };
    } catch (error) {
      const reason = error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT"
        ? "not-found"
        : "invalid-json";
      readEnd({ result: "miss", reason });
      perf.log("GradleClasspath.cache", { result: "MISS", reason });
      return undefined;
    }
  }

  private async writeCache(root: string, jars: string[]): Promise<void> {
    const directory = path.join(root, CACHE_DIRECTORY);
    const cacheFile = path.join(directory, CACHE_FILE);
    const tempFile = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
    const fingerprintEnd = perf.start("GradleClasspath.fingerprint", { files: FINGERPRINT_FILES.length });
    const fingerprint = await this.fingerprint(root);
    fingerprintEnd();
    const cache: GradleClasspathCache = {
      version: CACHE_VERSION,
      projectRoot: root,
      generatedAt: new Date().toISOString(),
      fingerprint,
      jars,
    };
    const writeEnd = perf.start("GradleClasspath.cacheWrite", { jars: jars.length });
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(tempFile, JSON.stringify(cache, null, 2) + "\n", "utf8");
      await rename(tempFile, cacheFile);
    } finally {
      await rm(tempFile, { force: true });
    }
    writeEnd({ jars: jars.length });
  }

  private async fingerprint(root: string): Promise<string> {
    const hash = createHash("sha256");
    for (const relative of FINGERPRINT_FILES) {
      const file = path.join(root, relative);
      const info = await stat(file).catch(() => undefined);
      if (!info?.isFile()) {
        hash.update(`${relative}\0missing\0`);
        continue;
      }
      hash.update(relative).update("\0").update(await readFile(file)).update("\0");
    }
    return hash.digest("hex");
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
      perf.log("GradleClasspath.GRADLE_START", { executable, task: ":app:kfcPrintClasspath" });
      const started = performance.now();
      const { stdout, stderr } = await execFileAsync(executable, [":app:kfcPrintClasspath", "--no-daemon", "--console=plain", "--init-script", initScript], { cwd: root, windowsHide: true, shell: process.platform === "win32", maxBuffer: 20 * 1024 * 1024 });
      perf.log("GradleClasspath.GRADLE_END", { durationMs: Math.round((performance.now() - started) * 100) / 100 });
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
