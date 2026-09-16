import { performance } from "node:perf_hooks";
import type { SymbolReference } from "../analysis/ReferencePass.js";

const SLOW_RESOLUTION_MS = 100;

export interface ResolutionProfilerSnapshot {
  typeCalls: number; typeMs: number; typeResolutionDepth: number; maxTypeResolutionDepth: number;
  functionCalls: number; functionMs: number; memberCalls: number; memberMs: number;
  constructorCalls: number; constructorMs: number; scopeLookups: number; scopeTraversalSteps: number;
  maxTraversalDepth: number; candidateLookups: number; candidateScans: number;
  candidateCountTotal: number; candidateCountMax: number; jvmFindMethodCalls: number; jvmMethodScans: number;
  scopeSymbolLookups: number; symbolLookups: number;
  typeLookups: number; memberLookups: number; functionLookups: number; fsCalls: number; fsMs: number;
  javaStarts: number; gradleStarts: number; externalProcesses: number; readJarCalls: number;
  classParserCalls: number; attempts: number; uniqueReferences: number; repeatedAttempts: number;
  slowReferences: number; slowestReferenceMs: number;
}

class ResolutionProfiler {
  readonly enabled = process.env.KFC_PERF_LOG === "1";
  private active = false;
  private snapshot = this.empty();

  begin(references: SymbolReference[]): void {
    if (!this.enabled) return;
    this.active = true;
    this.snapshot = this.empty();
    const unique = new Set(references.map((r) => `${r.file ?? ""}|${r.kind}|${r.name}|${r.range.start.offset}|${r.range.end.offset}`));
    this.snapshot.attempts = references.length;
    this.snapshot.uniqueReferences = unique.size;
    this.snapshot.repeatedAttempts = Math.max(0, references.length - unique.size);
  }

  end(): ResolutionProfilerSnapshot { this.active = false; return { ...this.snapshot }; }
  isActive(): boolean { return this.enabled && this.active; }

  time<T>(kind: "type" | "function" | "member" | "constructor", fn: () => T): T {
    if (!this.isActive()) return fn();
    const started = performance.now();
    if (kind === "type") {
      this.snapshot.typeResolutionDepth += 1;
      this.snapshot.maxTypeResolutionDepth = Math.max(this.snapshot.maxTypeResolutionDepth, this.snapshot.typeResolutionDepth);
    }
    try { return fn(); }
    finally {
      const ms = performance.now() - started;
      const calls = `${kind}Calls` as "typeCalls" | "functionCalls" | "memberCalls" | "constructorCalls";
      const total = `${kind}Ms` as "typeMs" | "functionMs" | "memberMs" | "constructorMs";
      this.snapshot[calls] += 1;
      this.snapshot[total] += ms;
      if (kind === "type") this.snapshot.typeResolutionDepth -= 1;
    }
  }

  reference(reference: SymbolReference, fn: () => unknown): unknown {
    if (!this.isActive()) return fn();
    const started = performance.now();
    const result = fn();
    const durationMs = performance.now() - started;
    if (durationMs >= SLOW_RESOLUTION_MS) {
      this.snapshot.slowReferences += 1;
      this.snapshot.slowestReferenceMs = Math.max(this.snapshot.slowestReferenceMs, durationMs);
      console.error(`[KFC][Perf] Resolution.SLOW reference=${reference.name} kind=${reference.kind} line=${reference.range.start.row} durationMs=${round(durationMs)}`);
    }
    return result;
  }

  scopeLookup(traversalDepth: number): void {
    if (!this.isActive()) return;
    this.snapshot.scopeLookups += 1;
    this.snapshot.scopeTraversalSteps += traversalDepth;
    this.snapshot.maxTraversalDepth = Math.max(this.snapshot.maxTraversalDepth, traversalDepth);
  }

  lookup(kind: "symbol" | "type" | "member" | "function"): void {
    if (!this.isActive()) return;
    const key = `${kind}Lookups` as "symbolLookups" | "typeLookups" | "memberLookups" | "functionLookups";
    this.snapshot[key] += 1;
  }

  jvmMethodsScanned(scanned: number): void {
    if (!this.isActive()) return;
    this.snapshot.jvmFindMethodCalls += 1;
    this.snapshot.jvmMethodScans += scanned;
  }

  candidates(scanned: number, candidateCount: number): void {
    if (!this.isActive()) return;
    this.snapshot.candidateLookups += 1;
    this.snapshot.candidateScans += scanned;
    this.snapshot.candidateCountTotal += candidateCount;
    this.snapshot.candidateCountMax = Math.max(this.snapshot.candidateCountMax, candidateCount);
  }

  fsCall(durationMs: number): void { if (this.isActive()) { this.snapshot.fsCalls += 1; this.snapshot.fsMs += durationMs; } }
  process(kind: "java" | "gradle" | "other"): void {
    if (!this.isActive()) return;
    if (kind === "java") this.snapshot.javaStarts += 1;
    if (kind === "gradle") this.snapshot.gradleStarts += 1;
    this.snapshot.externalProcesses += 1;
  }
  jar(kind: "read" | "classParser"): void {
    if (!this.isActive()) return;
    if (kind === "read") this.snapshot.readJarCalls += 1;
    else this.snapshot.classParserCalls += 1;
  }

  private empty(): ResolutionProfilerSnapshot {
    return { typeCalls: 0, typeMs: 0, typeResolutionDepth: 0, maxTypeResolutionDepth: 0,
      functionCalls: 0, functionMs: 0, memberCalls: 0, memberMs: 0, constructorCalls: 0, constructorMs: 0,
      scopeLookups: 0, scopeTraversalSteps: 0, maxTraversalDepth: 0, candidateLookups: 0, candidateScans: 0,
      candidateCountTotal: 0, candidateCountMax: 0, jvmFindMethodCalls: 0, jvmMethodScans: 0,
      scopeSymbolLookups: 0, symbolLookups: 0,
      typeLookups: 0, memberLookups: 0, functionLookups: 0, fsCalls: 0, fsMs: 0, javaStarts: 0, gradleStarts: 0,
      externalProcesses: 0, readJarCalls: 0, classParserCalls: 0, attempts: 0, uniqueReferences: 0,
      repeatedAttempts: 0, slowReferences: 0, slowestReferenceMs: 0 };
  }
}

function round(value: number): number { return Math.round(value * 100) / 100; }
export const resolutionProfiler = new ResolutionProfiler();
