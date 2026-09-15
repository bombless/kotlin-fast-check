import { parseJvmMethodSignature, parseJvmTypeSignature } from "./SignatureParser.js";
import { parseMethodDescriptor, parseJvmTypeDescriptor } from "./DescriptorParser.js";
import type { JvmClassSymbol, JvmFieldSymbol, JvmMethodSymbol } from "./JvmSymbols.js";

interface Utf8Entry { tag: 1; value: string }
interface ClassEntry { tag: 7; nameIndex: number }
interface NameAndTypeEntry { tag: 12; nameIndex: number; descriptorIndex: number }
type ConstantPoolEntry = Utf8Entry | ClassEntry | NameAndTypeEntry | { tag: number; [key: string]: unknown } | undefined;

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  u1(): number { this.need(1); return this.bytes[this.offset++]; }
  u2(): number { this.need(2); const v = (this.bytes[this.offset] << 8) | this.bytes[this.offset + 1]; this.offset += 2; return v; }
  u4(): number { this.need(4); const v = ((this.bytes[this.offset] * 0x1000000) + ((this.bytes[this.offset + 1] << 16) | (this.bytes[this.offset + 2] << 8) | this.bytes[this.offset + 3])) >>> 0; this.offset += 4; return v; }
  i4(): number { return this.u4() | 0; }
  u8(): bigint { this.need(8); const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8); const v = view.getBigUint64(0, false); this.offset += 8; return v; }
  f4(): number { this.need(4); const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4); const v = view.getFloat32(0, false); this.offset += 4; return v; }
  f8(): number { this.need(8); const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8); const v = view.getFloat64(0, false); this.offset += 8; return v; }
  bytesOf(length: number): Uint8Array { this.need(length); const value = this.bytes.slice(this.offset, this.offset + length); this.offset += length; return value; }
  skip(length: number): void { this.need(length); this.offset += length; }
  private need(length: number): void { if (length < 0 || this.offset + length > this.bytes.length) throw new Error("Unexpected end of class file"); }
}

function utf8(pool: ConstantPoolEntry[], index: number): string {
  const entry = pool[index];
  if (!entry || entry.tag !== 1 || !("value" in entry) || typeof entry.value !== "string") throw new Error(`Expected CONSTANT_Utf8 at ${index}`);
  return entry.value;
}

function className(pool: ConstantPoolEntry[], index: number): string {
  const entry = pool[index];
  if (!entry || entry.tag !== 7 || !("nameIndex" in entry) || typeof entry.nameIndex !== "number") throw new Error(`Expected CONSTANT_Class at ${index}`);
  return utf8(pool, entry.nameIndex).replace(/\//g, ".");
}

function signatureFromAttributes(reader: Reader, pool: ConstantPoolEntry[]): string | undefined {
  const count = reader.u2();
  let signature: string | undefined;
  for (let i = 0; i < count; i++) {
    const name = utf8(pool, reader.u2());
    const length = reader.u4();
    const data = reader.bytesOf(length);
    if (name === "Signature" && data.length === 2) signature = utf8(pool, (data[0] << 8) | data[1]);
  }
  return signature;
}

function parseField(reader: Reader, pool: ConstantPoolEntry[]): JvmFieldSymbol {
  const accessFlags = reader.u2();
  const name = utf8(pool, reader.u2());
  const descriptor = utf8(pool, reader.u2());
  const signature = signatureFromAttributes(reader, pool);
  let type = parseJvmTypeDescriptor(descriptor).type;
  if (signature) { try { type = parseJvmTypeSignature(signature); } catch { /* descriptor fallback */ } }
  return { name, descriptor, type, signature, accessFlags, static: (accessFlags & 8) !== 0, final: (accessFlags & 16) !== 0 };
}function parseMethod(reader: Reader, pool: ConstantPoolEntry[]): JvmMethodSymbol {
  const accessFlags = reader.u2();
  const name = utf8(pool, reader.u2());
  const descriptor = utf8(pool, reader.u2());
  const signature = signatureFromAttributes(reader, pool);
  let parsed = parseMethodDescriptor(descriptor);
  if (signature) { try { parsed = parseJvmMethodSignature(signature); } catch { /* descriptor fallback */ } }
  const constructor = name === "<init>";
  return {
    name,
    descriptor,
    parameterTypes: parsed.parameterTypes,
    returnType: parsed.returnType,
    signature,
    accessFlags,
    static: (accessFlags & 8) !== 0,
    abstract: (accessFlags & 0x0400) !== 0,
    constructor,
  };
}

export class ClassFileReader {
  read(bytes: Uint8Array): JvmClassSymbol {
    const reader = new Reader(bytes);
    if (reader.u4() !== 0xcafebabe) throw new Error("Invalid JVM class file magic");
    reader.u2();
    reader.u2();

    const constantPoolCount = reader.u2();
    const pool: ConstantPoolEntry[] = new Array(constantPoolCount);
    for (let i = 1; i < constantPoolCount; i++) {
      const tag = reader.u1();
      switch (tag) {
        case 1: {
          const length = reader.u2();
          const value = new TextDecoder("utf-8").decode(reader.bytesOf(length));
          pool[i] = { tag: 1, value };
          break;
        }
        case 3: reader.i4(); pool[i] = { tag }; break;
        case 4: reader.f4(); pool[i] = { tag }; break;
        case 5: reader.u8(); pool[i] = { tag }; i++; break;
        case 6: reader.f8(); pool[i] = { tag }; i++; break;
        case 7: pool[i] = { tag: 7, nameIndex: reader.u2() }; break;
        case 8: reader.u2(); pool[i] = { tag }; break;
        case 9:
        case 10:
        case 11: reader.u2(); reader.u2(); pool[i] = { tag }; break;
        case 12: pool[i] = { tag: 12, nameIndex: reader.u2(), descriptorIndex: reader.u2() }; break;
        case 15: reader.u1(); reader.u2(); pool[i] = { tag }; break;
        case 16: reader.u2(); pool[i] = { tag }; break;
        case 17:
        case 18: reader.u2(); reader.u2(); pool[i] = { tag }; break;
        case 19:
        case 20: reader.u2(); pool[i] = { tag }; break;
        default: throw new Error(`Unsupported constant-pool tag ${tag}`);
      }
    }

    const accessFlags = reader.u2();
    const qualifiedName = className(pool, reader.u2());
    const superIndex = reader.u2();
    const superclass = superIndex ? className(pool, superIndex) : undefined;

    const interfaceCount = reader.u2();
    const interfaces: string[] = [];
    for (let i = 0; i < interfaceCount; i++) interfaces.push(className(pool, reader.u2()));

    const fieldCount = reader.u2();
    const fields: JvmFieldSymbol[] = [];
    for (let i = 0; i < fieldCount; i++) fields.push(parseField(reader, pool));

    const methodCount = reader.u2();
    const methods: JvmMethodSymbol[] = [];
    const constructors: JvmMethodSymbol[] = [];
    for (let i = 0; i < methodCount; i++) {
      const method = parseMethod(reader, pool);
      methods.push(method);
      if (method.constructor) constructors.push(method);
    }

    const classAttributeCount = reader.u2();
    for (let i = 0; i < classAttributeCount; i++) {
      reader.u2();
      reader.skip(reader.u4());
    }

    return {
      name: qualifiedName.slice(qualifiedName.lastIndexOf(".") + 1),
      qualifiedName,
      accessFlags,
      superclass,
      interfaces,
      fields,
      methods,
      constructors,
    };
  }
}

export function readClassFile(bytes: Uint8Array): JvmClassSymbol {
  return new ClassFileReader().read(bytes);
}
