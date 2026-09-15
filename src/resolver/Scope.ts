export class Scope {
  private readonly values = new Map<string, unknown>();
  constructor(private readonly parent?: Scope) {}
  define(name: string, value: unknown): void { this.values.set(name, value); }
  get<T>(name: string): T | undefined {
    if (this.values.has(name)) return this.values.get(name) as T;
    return this.parent?.get<T>(name);
  }
  child(): Scope { return new Scope(this); }
}