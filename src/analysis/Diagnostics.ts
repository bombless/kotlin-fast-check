import type { SourceRange } from "../parser/Ast.js";
import type { ResolvedReference } from "./ResolutionPass.js";

export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticCode =
  | "UNRESOLVED_TYPE"
  | "UNRESOLVED_FUNCTION"
  | "UNRESOLVED_PROPERTY"
  | "UNRESOLVED_CONSTRUCTOR"
  | "UNRESOLVED_IMPORT";

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  severity: DiagnosticSeverity;
  range: SourceRange;
  file?: string;
}

const CODES: Partial<Record<ResolvedReference["reference"]["kind"], DiagnosticCode>> = {
  type: "UNRESOLVED_TYPE",
  function: "UNRESOLVED_FUNCTION",
  property: "UNRESOLVED_PROPERTY",
  constructor: "UNRESOLVED_CONSTRUCTOR",
  import: "UNRESOLVED_IMPORT",
};

function message(code: DiagnosticCode, name: string): string {
  switch (code) {
    case "UNRESOLVED_TYPE": return `Unresolved type '${name}'`;
    case "UNRESOLVED_FUNCTION": return `Unresolved function '${name}'`;
    case "UNRESOLVED_PROPERTY": return `Unresolved property '${name}'`;
    case "UNRESOLVED_CONSTRUCTOR": return `Unresolved constructor '${name}'`;
    case "UNRESOLVED_IMPORT": return `Unresolved import '${name}'`;
  }
}

export class Diagnostics {
  collect(results: ResolvedReference[]): Diagnostic[] {
    return results.flatMap((result) => {
      if (result.symbol) return [];
      const code = CODES[result.reference.kind];
      if (!code) return [];
      return [{
        code,
        message: message(code, result.reference.name),
        severity: "error" as const,
        range: result.reference.range,
        file: result.reference.file,
      }];
    });
  }
}

export function collectDiagnostics(results: ResolvedReference[]): Diagnostic[] {
  return new Diagnostics().collect(results);
}

export const diagnostics = new Diagnostics();
