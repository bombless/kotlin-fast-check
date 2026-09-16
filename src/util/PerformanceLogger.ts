import { performance } from "node:perf_hooks";

export type PerformanceData = Record<string, string | number | boolean | undefined>;

/** Low-overhead, stderr-only diagnostics enabled by KFC_PERF_LOG=1. */
export class PerformanceLogger {
  readonly enabled = process.env.KFC_PERF_LOG === "1";

  log(name: string, data: PerformanceData = {}): void {
    if (!this.enabled) return;
    const fields = Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    console.error(`[KFC][Perf] ${name}${fields ? ` ${fields}` : ""}`);
  }

  start(name: string, data: PerformanceData = {}): (endData?: PerformanceData) => number {
    if (!this.enabled) return () => 0;
    this.log(`${name} START`, data);
    const started = performance.now();
    return (endData = {}) => {
      const durationMs = Math.round((performance.now() - started) * 100) / 100;
      this.log(`${name} END`, { ...endData, durationMs });
      return durationMs;
    };
  }
}

export const perf = new PerformanceLogger();
