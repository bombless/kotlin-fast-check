import { describe, expect, it } from "vitest";
import { parseMethodDescriptor } from "../../src/jvm/DescriptorParser.js";
import { parseJvmMethodSignature, parseJvmTypeSignature } from "../../src/jvm/SignatureParser.js";

describe("JVM descriptor/signature parser", () => {
  it.each([
    ["I", "int"],
    ["J", "long"],
    ["Z", "boolean"],
    ["Ljava/lang/String;", "java.lang.String"],
    ["[Ljava/lang/String;", "java.lang.String[]"],
    ["[[I", "int[][]"],
  ])("parses type descriptor %s", (descriptor, expected) => {
    expect(parseJvmTypeSignature(descriptor)).toBe(expected);
  });

  it("parses method descriptors", () => {
    expect(parseMethodDescriptor("(Ljava/lang/String;I)Z")).toEqual({ parameterTypes: ["java.lang.String", "int"], returnType: "boolean" });
  });

  it("parses generic type signatures", () => {
    expect(parseJvmTypeSignature("Ljava/util/List<Ljava/lang/String;>;"))
      .toBe("java.util.List<java.lang.String>");
    expect(parseJvmTypeSignature("Ljava/util/Map<Ljava/lang/String;Ljava/lang/Integer;>;"))
      .toBe("java.util.Map<java.lang.String, java.lang.Integer>");
  });

  it("parses method signatures", () => {
    expect(parseJvmMethodSignature("(Ljava/util/List<Ljava/lang/String;>;I)Ljava/util/List<Ljava/lang/Integer;>;"))
      .toEqual({
        parameterTypes: ["java.util.List<java.lang.String>", "int"],
        returnType: "java.util.List<java.lang.Integer>",
      });
  });
});