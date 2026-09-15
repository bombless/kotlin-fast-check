export interface TypeRef {
  name: string;
  nullable?: boolean;
  arguments?: TypeRef[];
  arrayDimensions?: number;
}

export function typeRefToString(type: TypeRef): string {
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