export interface MethodDescriptor {
  parameterTypes: string[];
  returnType: string;
}

export function parseJvmTypeDescriptor(descriptor: string, offset = 0): { type: string; next: number } {
  const ch = descriptor[offset];
  if (!ch) throw new Error(`Unexpected end of descriptor at ${offset}`);
  const primitive: Record<string, string> = {
    B: "byte",
    C: "char",
    D: "double",
    F: "float",
    I: "int",
    J: "long",
    S: "short",
    Z: "boolean",
    V: "void",
  };
  if (primitive[ch]) return { type: primitive[ch], next: offset + 1 };
  if (ch === "[") {
    const value = parseJvmTypeDescriptor(descriptor, offset + 1);
    return { type: `${value.type}[]`, next: value.next };
  }
  if (ch === "L") {
    const end = descriptor.indexOf(";", offset + 1);
    if (end < 0) throw new Error(`Unterminated object descriptor at ${offset}`);
    return { type: descriptor.slice(offset + 1, end).replace(/\//g, "."), next: end + 1 };
  }
  throw new Error(`Unsupported JVM descriptor '${ch}' at ${offset}`);
}

export function parseMethodDescriptor(descriptor: string): MethodDescriptor {
  if (!descriptor.startsWith("(")) throw new Error(`Invalid method descriptor: ${descriptor}`);
  const parameterTypes: string[] = [];
  let offset = 1;
  while (descriptor[offset] !== ")") {
    if (offset >= descriptor.length) throw new Error(`Unterminated method descriptor: ${descriptor}`);
    const parsed = parseJvmTypeDescriptor(descriptor, offset);
    parameterTypes.push(parsed.type);
    offset = parsed.next;
  }
  const result = parseJvmTypeDescriptor(descriptor, offset + 1);
  if (result.next !== descriptor.length) throw new Error(`Trailing data in method descriptor: ${descriptor}`);
  return { parameterTypes, returnType: result.type };
}