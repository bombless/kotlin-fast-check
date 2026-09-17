#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { KotlinInterpreter } from "../interpreter/KotlinInterpreter.js";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  return readFile(0, "utf8");
}

async function main(): Promise<void> {
  const source = await readStdin();
  if (!source.trim()) {
    console.error("Usage: npm run kotlin < program.kt");
    process.exitCode = 2;
    return;
  }
  try {
    const interpreter = new KotlinInterpreter();
    for (const line of interpreter.run(source)) process.stdout.write(`${line}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
