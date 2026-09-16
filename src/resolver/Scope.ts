import { resolutionProfiler } from "../util/ResolutionProfiler.js";

export class Scope {
  private readonly values = new Map<string, unknown>();
  constructor(private readonly parent?: Scope) {}
  define(name: string, value: unknown): void { this.values.set(name, value); }
  get<T>(name: string): T | undefined {
    let scope: Scope | undefined = this;
    let depth = 0;
    while (scope) {
      if (scope.values.has(name)) {
        resolutionProfiler.scopeLookup(depth + 1);
        return scope.values.get(name) as T;
      }
      scope = scope.parent;
      depth += 1;
    }
    resolutionProfiler.scopeLookup(depth);
    return undefined;
  }
  child(): Scope { return new Scope(this); }
}
