import { describe, expect, it } from "vitest";
import { analyzeFile, loadClasspath } from "../../src/cli/main.js";
import { discoverGradleClasspath } from "../../src/project/GradleClasspath.js";

const target = "D:\\mcp-agent-workspace\\android-space-inspector\\app\\src\\main\\java\\com\\example\\spaceinspector\\MainActivity.kt";

describe("android-space-inspector regression", () => {
  it("diagnoses the missing DirStat type definition in the real MainActivity.kt", async () => {
    const diagnostics = await analyzeFile(target);
    const missingDirStat = diagnostics.filter(
      (diagnostic) => diagnostic.code === "UNRESOLVED_TYPE" && diagnostic.message === "Unresolved type 'DirStat'",
    );

    expect(missingDirStat.length).toBeGreaterThan(0);
    expect(missingDirStat.every((diagnostic) => diagnostic.file === target)).toBe(true);
  });

  it("does not report valid library calls as unresolved functions", async () => {
    const classpath = await discoverGradleClasspath("D:\\mcp-agent-workspace\\android-space-inspector");
    const diagnostics = await analyzeFile(target, loadClasspath(classpath.jars.join(";")));
    const unresolvedFunctions = diagnostics.filter((diagnostic) => diagnostic.code === "UNRESOLVED_FUNCTION");
    expect(unresolvedFunctions.map((diagnostic) => diagnostic.message)).not.toContain("Unresolved function 'Text'");
    expect(unresolvedFunctions.map((diagnostic) => diagnostic.message)).not.toContain("Unresolved function 'Column'");
    expect(unresolvedFunctions.map((diagnostic) => diagnostic.message)).not.toContain("Unresolved function 'remember'");
    expect(unresolvedFunctions.map((diagnostic) => diagnostic.message)).not.toContain("Unresolved function 'launch'");
  }, 30000);
});
