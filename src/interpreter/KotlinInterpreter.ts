type Value = number | boolean | string | null | void | FunctionValue;
type Env = Map<string, Value>;
type FunctionValue = { parameters: string[]; body: string; closure: Env };

type Token = { kind: "number" | "string" | "identifier" | "operator" | "punct" | "eof"; text: string };

class Lexer {
  private i = 0;
  constructor(private readonly source: string) {}
  next(): Token {
    while (this.i < this.source.length) {
      if (/\s/.test(this.source[this.i]!)) { this.i++; continue; }
      if (this.source.startsWith("//", this.i)) { while (this.i < this.source.length && this.source[this.i] !== "\n") this.i++; continue; }
      if (this.source.startsWith("/*", this.i)) { const end = this.source.indexOf("*/", this.i + 2); this.i = end < 0 ? this.source.length : end + 2; continue; }
      break;
    }
    if (this.i >= this.source.length) return { kind: "eof", text: "" };
    const c = this.source[this.i]!;
    if (c === '"') {
      let out = ""; this.i++;
      while (this.i < this.source.length) {
        const x = this.source[this.i++]!;
        if (x === '"') break;
        if (x === "\\") {
          const e = this.source[this.i++]!;
          out += ({ n: "\n", r: "\r", t: "\t", b: "\b", "\\": "\\", '"': '"' } as Record<string, string>)[e] ?? e;
        } else out += x;
      }
      return { kind: "string", text: out };
    }
    if (/[0-9]/.test(c)) {
      const start = this.i++; while (this.i < this.source.length && /[0-9._]/.test(this.source[this.i]!)) this.i++;
      while (this.i < this.source.length && /[fFlL]/.test(this.source[this.i]!)) this.i++;
      return { kind: "number", text: this.source.slice(start, this.i).replace(/_/g, "") };
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = this.i++; while (this.i < this.source.length && /[A-Za-z0-9_]/.test(this.source[this.i]!)) this.i++;
      return { kind: "identifier", text: this.source.slice(start, this.i) };
    }
    for (const op of ["===", "!==", "==", "!=", "<=", ">=", "&&", "||", "+=", "-=", "*=", "/="]) {
      if (this.source.startsWith(op, this.i)) { this.i += op.length; return { kind: "operator", text: op }; }
    }
    this.i++; return { kind: /[+\-*/%<>=!?:]/.test(c) ? "operator" : "punct", text: c };
  }
}

class ExpressionParser {
  private readonly lexer: Lexer;
  private current: Token;
  constructor(private readonly source: string, private readonly env: Env, private readonly call: (name: string, args: Value[]) => Value) {
    this.lexer = new Lexer(source); this.current = this.lexer.next();
  }
  parse(): Value { return this.expression(0); }
  private advance(): Token { const old = this.current; this.current = this.lexer.next(); return old; }
  private match(text: string): boolean { if (this.current.text === text) { this.advance(); return true; } return false; }
  private expression(min: number): Value {
    let left = this.prefix();
    const precedence: Record<string, number> = { "||": 1, "&&": 2, "==": 3, "===": 3, "!=": 3, "!==": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };
    while (this.current.kind === "operator" && (precedence[this.current.text] ?? -1) >= min) {
      const op = this.advance().text; const p = precedence[op]!; const right = this.expression(p + 1); left = this.binary(op, left, right);
    }
    if (min === 0 && this.match("?")) { const yes = this.expression(0); if (!this.match(":")) throw new Error("Expected ':' in conditional expression"); const no = this.expression(0); left = left ? yes : no; }
    return left;
  }
  private prefix(): Value {
    if (this.match("!")) return !this.expression(7);
    if (this.match("-")) return -(this.expression(7) as number);
    if (this.match("+")) return +(this.expression(7) as number);
    const t = this.advance();
    if (t.kind === "number") return Number(t.text.replace(/[fFlL]$/, ""));
    if (t.kind === "string") return t.text;
    if (t.kind === "identifier") {
      if (t.text === "true") return true; if (t.text === "false") return false; if (t.text === "null") return null;
      if (this.match("(")) {
        const args: Value[] = []; if (!this.match(")")) { do { args.push(this.expression(0)); } while (this.match(",")); if (!this.match(")")) throw new Error("Expected ')'" ); }
        return this.call(t.text, args);
      }
      return this.env.get(t.text) ?? (() => { throw new Error(`Undefined variable: ${t.text}`); })();
    }
    if (t.text === "(") { const value = this.expression(0); if (!this.match(")")) throw new Error("Expected ')'" ); return value; }
    throw new Error(`Unexpected token: ${t.text}`);
  }
  private binary(op: string, a: Value, b: Value): Value {
    switch (op) {
      case "+": return typeof a === "string" || typeof b === "string" ? String(a) + String(b) : (a as number) + (b as number);
      case "-": return (a as number) - (b as number); case "*": return (a as number) * (b as number); case "/": return (a as number) / (b as number); case "%": return (a as number) % (b as number);
      case "==": case "===": return a === b; case "!=": case "!==": return a !== b;
      case "<": return (a as number) < (b as number); case "<=": return (a as number) <= (b as number); case ">": return (a as number) > (b as number); case ">=": return (a as number) >= (b as number);
      case "&&": return Boolean(a) && Boolean(b); case "||": return Boolean(a) || Boolean(b);
      default: throw new Error(`Unsupported operator: ${op}`);
    }
  }
}

function findMatching(source: string, start: number, open: string, close: string): number {
  let depth = 0; let quote = false; let escaped = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i]!;
    if (quote) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quote = false; continue; }
    if (c === '"') { quote = true; continue; }
    if (c === open) depth++; else if (c === close && --depth === 0) return i;
  }
  throw new Error(`Unmatched ${open}`);
}

function splitTopLevel(source: string, delimiter = ";"): string[] {
  const result: string[] = []; let start = 0; let paren = 0; let brace = 0; let quote = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!; if (c === '"' && source[i - 1] !== "\\") quote = !quote; if (quote) continue;
    if (c === "(") paren++; else if (c === ")") paren--; else if (c === "{") brace++; else if (c === "}") brace--;
    if (c === delimiter && paren === 0 && brace === 0) { result.push(source.slice(start, i).trim()); start = i + 1; }
    else if (delimiter === ";" && c === "\n" && paren === 0 && brace === 0) { result.push(source.slice(start, i).trim()); start = i + 1; }
  }
  const tail = source.slice(start).trim(); if (tail) result.push(tail); return result.filter(Boolean);
}

export class KotlinInterpreter {
  private readonly globals: Env = new Map();
  private readonly functions = new Map<string, FunctionValue>();
  private readonly output: string[] = [];

  run(source: string): string[] {
    this.output.length = 0; this.functions.clear();
    this.collectFunctions(source);
    this.executeStatements(this.stripFunctions(source), new Map(this.globals));
    if (this.functions.has("main")) this.invoke("main", []);
    return [...this.output];
  }

  private collectFunctions(source: string): void {
    const re = /(?:fun)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*[^\{=]+)?\s*\{/g; let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const open = source.indexOf("{", m.index); const end = findMatching(source, open, "{", "}");
      const parameters = m[2]!.split(",").map(x => x.trim().split(/\s*:\s*/)[0]!).filter(Boolean);
      this.functions.set(m[1]!, { parameters, body: source.slice(open + 1, end), closure: new Map(this.globals) }); re.lastIndex = end + 1;
    }
  }

  private stripFunctions(source: string): string { return source.replace(/(?:fun)\s+[A-Za-z_]\w*\s*\([^)]*\)\s*(?::\s*[^\{=]+)?\s*\{[\s\S]*?\}/g, ""); }

  private executeStatements(source: string, env: Env): Value {
    for (const statement of splitTopLevel(source)) {
      const s = statement.trim(); if (!s) continue;
      if (/^(?:import|package)\b/.test(s)) throw new Error("Imports are not supported by the Kotlin interpreter");
      if (s.startsWith("return")) return s.length === 6 ? undefined : this.evalExpr(s.slice(6).trim(), env);
      const ifMatch = s.match(/^if\s*\(([^)]*)\)\s*(.*)$/s);
      if (ifMatch) { const condition = Boolean(this.evalExpr(ifMatch[1]!, env)); const rest = ifMatch[2]!.trim(); const open = rest.indexOf("{"); if (open >= 0) { const end = findMatching(rest, open, "{", "}"); if (condition) { const r = this.executeStatements(rest.slice(open + 1, end), env); if (r !== undefined) return r; } else if (/^else\s*\{/.test(rest.slice(end + 1).trim())) { const e = rest.slice(end + 1).trim(); const eo = e.indexOf("{"); const ee = findMatching(e, eo, "{", "}"); const r = this.executeStatements(e.slice(eo + 1, ee), env); if (r !== undefined) return r; } } else if (condition) this.executeStatements(rest, env); continue; }
      const whileMatch = s.match(/^while\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/); if (whileMatch) { let guard = 0; while (Boolean(this.evalExpr(whileMatch[1]!, env))) { const r = this.executeStatements(whileMatch[2]!, env); if (r !== undefined) return r; if (++guard > 100000) throw new Error("Loop iteration limit exceeded"); } continue; }
      const declaration = s.match(/^(?:val|var)\s+([A-Za-z_]\w*)(?:\s*:\s*[^=]+)?\s*=\s*([\s\S]+)$/);
      if (declaration) { env.set(declaration[1]!, this.evalExpr(declaration[2]!, env)); continue; }
      const assignment = s.match(/^([A-Za-z_]\w*)\s*(\+=|-=|\*=|\/=|=)\s*([\s\S]+)$/);
      if (assignment) { const name = assignment[1]!; const value = this.evalExpr(assignment[3]!, env); const old = env.get(name); if (assignment[2] === "=") env.set(name, value); else env.set(name, new ExpressionParser(`${old} ${assignment[2]![0]} ${JSON.stringify(value)}`, env, (n,a)=>this.invoke(n,a)).parse()); continue; }
      this.evalExpr(s, env);
    }
    return undefined;
  }

  private evalExpr(source: string, env: Env): Value { return new ExpressionParser(source.trim(), env, (name, args) => this.invoke(name, args, env)).parse(); }
  private invoke(name: string, args: Value[], callerEnv?: Env): Value {
    if (name === "println") { if (args.length !== 1) throw new Error("println expects one argument"); this.output.push(String(args[0])); return undefined; }
    const fn = this.functions.get(name); if (!fn) throw new Error(`Unsupported function or standard library symbol: ${name}`);
    const local = new Map(fn.closure); fn.parameters.forEach((p, i) => local.set(p, args[i] ?? null)); return this.executeStatements(fn.body, local);
  }
}
