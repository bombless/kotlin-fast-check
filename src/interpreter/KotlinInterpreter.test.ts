import { describe, expect, it } from "vitest";
import { KotlinInterpreter } from "./KotlinInterpreter.js";

describe("KotlinInterpreter", () => {
  it("evaluates basic expressions and println", () => {
    expect(new KotlinInterpreter().run(`val x: Int = 2 + 3\nprintln(x)`)).toEqual(["5"]);
  });

  it("supports mutable variables, conditionals and loops", () => {
    expect(new KotlinInterpreter().run(`var x = 0\nwhile (x < 3) {\n  println(x)\n  x += 1\n}`)).toEqual(["0", "1", "2"]);
  });

  it("supports user functions", () => {
    expect(new KotlinInterpreter().run(`fun add(a: Int, b: Int): Int {\n  return a + b\n}\nprintln(add(2, 4))`)).toEqual(["6"]);
  });

  it("rejects imports", () => {
    expect(() => new KotlinInterpreter().run("import kotlin.math.abs")).toThrow(/Imports are not supported/);
  });
});
