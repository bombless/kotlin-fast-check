import { describe, expect, it } from "vitest";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverGradleClasspath } from "../src/project/index.js";
import { main } from "../src/cli/main.js";

const fixture = fileURLToPath(new URL("./jvm/fixtures/example.jar", import.meta.url));

describe("Gradle classpath discovery", () => {
  it("discovers project-local dependency JARs without parsing Gradle DSL", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kcheck-gradle-"));
    const libs = path.join(root, "libs");
    await writeFile(path.join(root, "settings.gradle.kts"), "rootProject.name = \"fixture\"\n", "utf8");
    await mkdir(libs, { recursive: true });
    const jar = path.join(libs, "example.jar");
    await copyFile(fixture, jar);

    const result = await discoverGradleClasspath(root);
    expect(result.jars).toEqual([path.normalize(path.resolve(jar))]);
    expect(result.warnings).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  it("also explores build and .gradle directories", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kcheck-gradle-"));
    const buildLibs = path.join(root, "build", "dependencies");
    const gradleCache = path.join(root, ".gradle", "fixture");
    await mkdir(buildLibs, { recursive: true });
    await mkdir(gradleCache, { recursive: true });
    await copyFile(fixture, path.join(buildLibs, "build-example.jar"));
    await copyFile(fixture, path.join(gradleCache, "cached-example.jar"));

    const result = await discoverGradleClasspath(root);
    expect(result.jars).toHaveLength(2);
    expect(result.jars.some((jar) => jar.endsWith(path.join("build", "dependencies", "build-example.jar")))).toBe(true);
    expect(result.jars.some((jar) => jar.endsWith(path.join(".gradle", "fixture", "cached-example.jar")))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("No Gradle build/settings file"))).toBe(true);
    await rm(root, { recursive: true, force: true });
  });

  it("returns a clear empty result when no dependency JAR can be discovered", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kcheck-gradle-"));
    await writeFile(path.join(root, "build.gradle"), "plugins { id 'org.jetbrains.kotlin.jvm' version 'x' }\n", "utf8");

    const result = await discoverGradleClasspath(root);
    expect(result.jars).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes("No JAR files discovered"))).toBe(true);
    await rm(root, { recursive: true, force: true });
  });

  it("does not invent symbols when discovery finds no JARs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kcheck-gradle-"));
    const source = path.join(root, "Main.kt");
    await writeFile(path.join(root, "settings.gradle"), "rootProject.name = 'fixture'\n", "utf8");
    await writeFile(source, "import fixtures.DoesNotExist\n\nfun test(): DoesNotExist = DoesNotExist()\n", "utf8");

    await main(["--gradle", root, "--format", "json", source]);
    expect(process.exitCode).toBe(1);
    await rm(root, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("feeds discovered JARs through the existing JVM resolver pipeline", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kcheck-gradle-"));
    const libs = path.join(root, "libs");
    const source = path.join(root, "Main.kt");
    await mkdir(libs, { recursive: true });
    await writeFile(path.join(root, "settings.gradle"), "rootProject.name = 'fixture'\n", "utf8");
    await copyFile(fixture, path.join(libs, "example.jar"));
    await writeFile(source, "import fixtures.Example\n\nfun test(): Example = Example()\n", "utf8");

    await main(["--gradle", root, "--format", "json", source]);
    expect(process.exitCode).toBe(0);
    await rm(root, { recursive: true, force: true });
    process.exitCode = undefined;
  });
});
