import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyFile } from "node:fs/promises";
import { discoverCompileSdk, discoverGradleProject, findGradleProjectRoot } from "../src/project/ProjectDiscovery.js";
import { main } from "../src/cli/main.js";

describe("Gradle project discovery", () => {
  it("finds the nearest Gradle root from a Kotlin source file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kcheck-project-"));
    const source = path.join(root, "app", "src", "main", "java", "Example.kt");
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(path.join(root, "settings.gradle.kts"), "rootProject.name = \"fixture\"\n", "utf8");
    await writeFile(source, "class Example\n", "utf8");

    expect(await findGradleProjectRoot(source)).toBe(path.normalize(path.resolve(root)));
    await rm(root, { recursive: true, force: true });
  });

  it("discovers Android compileSdk from a standard Kotlin Gradle build", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kcheck-project-"));
    await writeFile(path.join(root, "settings.gradle.kts"), "rootProject.name = \"fixture\"\n", "utf8");
    await writeFile(path.join(root, "build.gradle.kts"), "android { compileSdk = 35 }\n", "utf8");

    expect(await discoverCompileSdk(root)).toBe(35);
    expect(await discoverGradleProject(path.join(root, "Main.kt"))).toEqual({ root: path.normalize(path.resolve(root)), compileSdk: 35 });
    await rm(root, { recursive: true, force: true });
  });

  it("uses plain CLI invocation to discover project JARs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kcheck-project-"));
    const libs = path.join(root, "libs");
    const source = path.join(root, "src", "main", "Example.kt");
    const fixture = fileURLToPath(new URL("./jvm/fixtures/example.jar", import.meta.url));
    await mkdir(libs, { recursive: true });
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(path.join(root, "settings.gradle.kts"), "rootProject.name = \"fixture\"\n", "utf8");
    await copyFile(fixture, path.join(libs, "example.jar"));
    await writeFile(source, "import fixtures.Example\n\nfun test(): Example = Example()\n", "utf8");

    await main(["--format", "json", source]);
    expect(process.exitCode).toBe(0);
    process.exitCode = undefined;
    await rm(root, { recursive: true, force: true });
  });

  it("uses discovered compileSdk for the Android provider", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kcheck-project-"));
    const sdkRoot = fileURLToPath(new URL("./android-sdk", import.meta.url));
    const source = path.join(root, "src", "main", "Example.kt");
    const previous = process.env.ANDROID_HOME;
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(path.join(root, "settings.gradle.kts"), "rootProject.name = \"fixture\"\n", "utf8");
    await writeFile(path.join(root, "build.gradle.kts"), "android { compileSdk = 35 }\n", "utf8");
    await writeFile(source, "import fixtures.Example\n\nfun test(): Example = Example()\n", "utf8");
    process.env.ANDROID_HOME = sdkRoot;

    await main(["--format", "json", source]);
    expect(process.exitCode).toBe(0);
    process.exitCode = undefined;
    if (previous === undefined) delete process.env.ANDROID_HOME;
    else process.env.ANDROID_HOME = previous;
    await rm(root, { recursive: true, force: true });
  });
});
