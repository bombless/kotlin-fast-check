#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { KotlinParser } from "../parser/KotlinParser.js";

async function main(): Promise<void> {
  const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (files.length === 0) {
    console.error("Usage: kcheck <file.kt> [...files]");
    process.exitCode = 2;
    return;
  }

  const parser = new KotlinParser();
  let failed = false;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const ast = parser.parse(source);
    const status = ast.hasErrors ? "syntax-errors" : "ok";
    console.log(`${file}: ${status}`);
    if (ast.hasErrors) failed = true;
  }

  process.exitCode = failed ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
