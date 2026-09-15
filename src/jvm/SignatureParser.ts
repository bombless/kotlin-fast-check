class SignatureReader {
  private offset = 0;

  constructor(private readonly text: string) {}

  get position(): number { return this.offset; }

  peek(): string { return this.text[this.offset] ?? ""; }

  consume(expected?: string): string {
    const value = this.text[this.offset] ?? "";
    if (expected && value !== expected) throw new Error(`Expected '${expected}' at ${this.offset}`);
    this.offset++;
    return value;
  }

  typeVariable(): string {
    this.consume("T");
    const end = this.text.indexOf(";", this.offset);
    if (end < 0) throw new Error(`Unterminated type variable at ${this.offset}`);
    const name = this.text.slice(this.offset, end);
    this.offset = end + 1;
    return name;
  }

  type(): string {
    const ch = this.peek();
    if ("BCDFIJSZV".includes(ch)) {
      this.offset++;
      return ({ B: "byte", C: "char", D: "double", F: "float", I: "int", J: "long", S: "short", Z: "boolean", V: "void" } as Record<string, string>)[ch];
    }
    if (ch === "[") {
      this.offset++;
      return `${this.type()}[]`;
    }
    if (ch === "T") return this.typeVariable();
    if (ch === "L") return this.classType();
    if (ch === "+") { this.offset++; return `? extends ${this.type()}`; }
    if (ch === "-") { this.offset++; return `? super ${this.type()}`; }
    if (ch === "*") { this.offset++; return "?"; }
    throw new Error(`Unsupported signature type '${ch}' at ${this.offset}`);
  }

  classType(): string {
    this.consume("L");
    let name = "";
    while (this.offset < this.text.length) {
      const ch = this.peek();
      if (ch === ";") {
        this.offset++;
        return name.replace(/\//g, ".");
      }
      if (ch === "<") {
        this.offset++;
        const args: string[] = [];
        while (this.peek() !== ">") args.push(this.type());
        this.consume(">");
        name += `<${args.join(", ")}>`;
        continue;
      }
      if (ch === ".") {
        this.offset++;
        name += ".";
        continue;
      }
      name += ch;
      this.offset++;
    }
    throw new Error(`Unterminated class signature at ${this.offset}`);
  }

  method(): { parameterTypes: string[]; returnType: string } {
    // Skip formal type parameters such as <T:Ljava/lang/Object;>.
    if (this.peek() === "<") {
      let depth = 0;
      do {
        const ch = this.consume();
        if (ch === "<") depth++;
        else if (ch === ">") depth--;
      } while (depth > 0 && this.offset < this.text.length);
    }
    this.consume("(");
    const parameterTypes: string[] = [];
    while (this.peek() !== ")") parameterTypes.push(this.type());
    this.consume(")");
    return { parameterTypes, returnType: this.type() };
  }
}

export function parseJvmTypeSignature(signature: string): string {
  return new SignatureReader(signature).type();
}

export function parseJvmMethodSignature(signature: string): { parameterTypes: string[]; returnType: string } {
  return new SignatureReader(signature).method();
}