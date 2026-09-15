export interface TypeRef {
  name: string;
  nullable?: boolean;
  arguments?: TypeRef[];
  arrayDimensions?: number;
  functionReceiver?: TypeRef;
  functionParameters?: TypeRef[];
  functionReturnType?: TypeRef;
}

export function typeRefToString(type: TypeRef): string {
  if (type.functionReturnType) {
    const receiver = type.functionReceiver ? `${typeRefToString(type.functionReceiver)}.` : "";
    const parameters = (type.functionParameters ?? []).map(typeRefToString).join(", ");
    return `${receiver}(${parameters}) -> ${typeRefToString(type.functionReturnType)}${type.nullable ? "?" : ""}`;
  }
  const args = type.arguments?.length ? `<${type.arguments.map(typeRefToString).join(", ")}>` : "";
  const arrays = "[]".repeat(type.arrayDimensions ?? 0);
  return `${type.name}${args}${arrays}${type.nullable ? "?" : ""}`;
}

export function parseTypeRef(text: string): TypeRef {
  let value = text.trim().replace(/\s+/g, " ");
  let nullable = false;
  if (value.endsWith("?")) {
    nullable = true;
    value = value.slice(0, -1).trim();
  }

  const arrow = findTopLevelArrow(value);
  if (arrow >= 0) {
    const left = value.slice(0, arrow).trim();
    const returnType = value.slice(arrow + 2).trim();
    const parameterStart = left.lastIndexOf("(");
    if (parameterStart >= 0 && left.endsWith(")")) {
      const receiverText = left.slice(0, parameterStart).trim().replace(/\.$/, "").trim();
      const parameterText = left.slice(parameterStart + 1, -1).trim();
      return {
        name: "Function",
        functionReceiver: receiverText ? parseTypeRef(receiverText) : undefined,
        functionParameters: splitTopLevel(parameterText).filter(Boolean).map(parseTypeRef),
        functionReturnType: parseTypeRef(returnType),
        nullable: nullable || undefined,
      };
    }
  }

  let arrayDimensions = 0;
  while (value.endsWith("[]")) {
    arrayDimensions++;
    value = value.slice(0, -2).trim();
  }

  const open = value.indexOf("<");
  if (open < 0 || !value.endsWith(">")) {
    return { name: value, nullable: nullable || undefined, arrayDimensions: arrayDimensions || undefined };
  }

  const name = value.slice(0, open).trim();
  const argsText = value.slice(open + 1, -1);
  const args: TypeRef[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= argsText.length; i++) {
    const ch = argsText[i];
    if (ch === "<") depth++;
    else if (ch === ">") depth--;
    if ((ch === "," && depth === 0) || i === argsText.length) {
      const part = argsText.slice(start, i).trim();
      if (part) args.push(parseTypeRef(part));
      start = i + 1;
    }
  }
  return {
    name,
    nullable: nullable || undefined,
    arguments: args.length ? args : undefined,
    arrayDimensions: arrayDimensions || undefined,
  };
}

function findTopLevelArrow(value: string): number {
  let depth = 0;
  for (let index = 0; index < value.length - 1; index++) {
    const ch = value[index];
    if (ch === '<' || ch === '(' || ch === '[') depth++;
    else if (ch === '>' || ch === ')' || ch === ']') depth--;
    if (ch === '-' && value[index + 1] === '>' && depth === 0) return index;
  }
  return -1;
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= value.length; index++) {
    const ch = value[index];
    if (ch === '<' || ch === '(' || ch === '[') depth++;
    else if (ch === '>' || ch === ')' || ch === ']') depth--;
    if ((ch === ',' && depth === 0) || index === value.length) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  return parts;
}