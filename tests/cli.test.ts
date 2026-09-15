import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli/main.js";

describe("CLI diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("prints a human-readable unresolved function diagnostic with the symbol range", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kcheck-"));
    const file = join(directory, "MainActivity.kt");
    const source = `class MainActivity {
    fun foo() {
        val x = 1
        val y = x
        val z = x
        val w = x
    doesNotExist()
    }
}
`;
    await writeFile(file, source, "utf8");

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await main([file]);

    expect(log).toHaveBeenCalledWith(
      `${file}:7:5 error UNRESOLVED_FUNCTION\nUnresolved function 'doesNotExist'`,
    );
    expect(log.mock.calls[0]?.[0]).not.toContain("doesNotExist()");
    expect(process.exitCode).toBe(1);

    await rm(directory, { recursive: true, force: true });
  });

  it("prints diagnostics as stable JSON with a symbol-only range", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kcheck-"));
    const file = join(directory, "MainActivity.kt");
    const source = `class MainActivity {
    fun foo() {
        val x = 1
        val y = x
        val z = x
        val w = x
    doesNotExist(view)
    }
}
`;
    await writeFile(file, source, "utf8");

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await main(["--format", "json", file]);

    expect(error).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    const diagnostics = JSON.parse(log.mock.calls[0]?.[0] as string) as Array<Record<string, unknown>>;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual({
      file,
      code: "UNRESOLVED_FUNCTION",
      severity: "error",
      message: "Unresolved function 'doesNotExist'",
      range: {
        start: { line: 7, column: 5 },
        end: { line: 7, column: 17 },
      },
    });
    expect(log.mock.calls[0]?.[0]).not.toContain("doesNotExist(view)");
    expect(process.exitCode).toBe(1);

    await rm(directory, { recursive: true, force: true });
  });
});
