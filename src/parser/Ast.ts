export interface SourcePosition {
  row: number;
  column: number;
  offset: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface KotlinAstNode {
  type: string;
  text: string;
  named: boolean;
  range: SourceRange;
  children: KotlinAstNode[];
  fields: Record<string, KotlinAstNode | undefined>;
}

export interface KotlinAst {
  root: KotlinAstNode;
  hasErrors: boolean;
  source: string;
}
