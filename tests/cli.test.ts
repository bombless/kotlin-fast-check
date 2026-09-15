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
});
