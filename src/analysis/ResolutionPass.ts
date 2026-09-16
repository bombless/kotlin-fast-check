import { SymbolKind, type ImportSymbol, type Symbol } from "../symbols/Symbol.js";
import type { SymbolTable } from "../symbols/SymbolTable.js";
import type { JvmSymbolProvider } from "../jvm/JvmSymbolProvider.js";
import { ConstructorResolver, type ConstructorMatch } from "../resolver/ConstructorResolver.js";
import { FunctionResolver } from "../resolver/FunctionResolver.js";
import { ImportResolver } from "../resolver/ImportResolver.js";
import { MemberResolver, type MemberSymbol } from "../resolver/MemberResolver.js";
import { Scope } from "../resolver/Scope.js";
import { TypeResolver, type ResolvedTypeSymbol, type ResolutionContext } from "../resolver/TypeResolver.js";
import type { LambdaContext, SymbolReference } from "./ReferencePass.js";
import { perf } from "../util/PerformanceLogger.js";
import { resolutionProfiler } from "../util/ResolutionProfiler.js";

export interface ResolutionPassContext extends ResolutionContext {
  jvmSymbols?: JvmSymbolProvider;
  scope?: Scope;
  imports: ImportSymbol[];
  projectSymbols?: SymbolTable;
  callableParameters?: Map<string, Symbol>;
}

export type ResolvedSymbol = Symbol | ResolvedTypeSymbol | MemberSymbol | ConstructorMatch;

export interface ResolvedReference {
  reference: SymbolReference;
  symbol: ResolvedSymbol | undefined;
}

export class ResolutionPass {
  private readonly types = new TypeResolver();
  private readonly imports = new ImportResolver();
  private readonly functions = new FunctionResolver();
  private readonly members = new MemberResolver();
  private readonly constructors = new ConstructorResolver();

  resolve(references: SymbolReference[], context: ResolutionPassContext): ResolvedReference[] {
    resolutionProfiler.begin(references);
    const end = perf.start("Resolution", { references: references.length });
    let resolvedCount = 0;
    try {
      const resolved = references.map((reference) => {
        const symbol = resolutionProfiler.reference(reference, () => this.resolveReference(reference, context)) as ResolvedSymbol | undefined;
        if (symbol) resolvedCount += 1;
        return { reference, symbol };
      });
      return resolved;
    } finally {
      const stats = resolutionProfiler.end();
      end({ resolved: resolvedCount, unresolved: references.length - resolvedCount });
      perf.log("ResolutionSummary", {
        references: stats.attempts,
        attempts: stats.attempts,
        uniqueReferences: stats.uniqueReferences,
        repeatedAttempts: stats.repeatedAttempts,
        typeCalls: stats.typeCalls, typeMs: round(stats.typeMs),
        typeResolutionMaxDepth: stats.maxTypeResolutionDepth,
        functionCalls: stats.functionCalls, functionMs: round(stats.functionMs),
        memberCalls: stats.memberCalls, memberMs: round(stats.memberMs),
        constructorCalls: stats.constructorCalls, constructorMs: round(stats.constructorMs),
        symbolLookups: stats.symbolLookups, typeLookups: stats.typeLookups,
        functionLookups: stats.functionLookups, memberLookups: stats.memberLookups,
        scopeLookups: stats.scopeLookups, scopeTraversalSteps: stats.scopeTraversalSteps,
        maxTraversalDepth: stats.maxTraversalDepth,
        avgTraversalDepth: stats.scopeLookups ? round(stats.scopeTraversalSteps / stats.scopeLookups) : 0,
        candidateLookups: stats.candidateLookups, candidateScans: stats.candidateScans,
        jvmFindMethodCalls: stats.jvmFindMethodCalls, jvmMethodScans: stats.jvmMethodScans,
        averageCandidates: stats.candidateLookups ? round(stats.candidateCountTotal / stats.candidateLookups) : 0,
        maxCandidates: stats.candidateCountMax,
        filesystemCalls: stats.fsCalls, filesystemMs: round(stats.fsMs),
        javaStarts: stats.javaStarts, gradleStarts: stats.gradleStarts,
        otherProcesses: Math.max(0, stats.externalProcesses - stats.javaStarts - stats.gradleStarts),
        readJarCalls: stats.readJarCalls, classParserCalls: stats.classParserCalls,
        slowReferences: stats.slowReferences, slowestReferenceMs: round(stats.slowestReferenceMs),
      });
    }
  }

  resolveReference(reference: SymbolReference, context: ResolutionPassContext): ResolvedSymbol | undefined {
    switch (reference.kind) {
      case "type":
        return this.types.resolveType(reference.name, context);
      case "constructor": {
        const type = this.types.resolveType(reference.name, context);
        const constructor = type ? this.constructors.resolveConstructor(type, context) : undefined;
        if (constructor) return constructor;
        // Kotlin/Compose APIs commonly expose capitalized callable functions
        // (e.g. Text, Column, Canvas), which the reference pass conservatively
        // classifies as constructors. Resolve those through the function pipeline.
        return this.resolveFunction({ ...reference, kind: "function" }, context);
      }
      case "function":
        return this.resolveFunction(reference, context);
      case "property":
      case "member":
        return this.resolveMember(reference, context);
      case "import":
        return this.resolveImport(reference, context);
    }
  }

  private resolveFunction(reference: SymbolReference, context: ResolutionPassContext): MemberSymbol | Symbol | undefined {
    const receiver = this.resolveReceiver(reference.receiver, context);
    if (receiver) {
      const member = this.functions.resolveFunction(receiver, reference.name, context);
      if (member) return member;
      const extension = this.resolveImportedJvmFunction(reference.name, context);
      if (extension) return extension;
    }

    const callable = context.callableParameters?.get(reference.name);
    if (callable) return callable;

    const implicitReceivers = this.resolveImplicitReceivers(reference.lambdaContext, context);
    const implicitReceiver = implicitReceivers[implicitReceivers.length - 1]
      ?? (reference.lambdaContext ? undefined : context.scope?.get<ResolvedTypeSymbol>("this"));
    if (implicitReceiver) {
      const resolved = this.functions.resolveFunction(implicitReceiver, reference.name, context);
      if (resolved) return resolved;
    }

    // Compose's Canvas API exposes its trailing block as DrawScope.() -> Unit;
    // bytecode-level overload selection can hide that receiver from this
    // lightweight resolver, so recover the documented scope when resolving
    // calls nested directly in Canvas's drawing block.
    if (hasLambdaCall(reference.lambdaContext, "Canvas") && context.jvmSymbols) {
      const drawScope = this.types.resolveType("androidx.compose.ui.graphics.drawscope.DrawScope", context);
      if (drawScope) {
        const resolved = this.functions.resolveFunction(drawScope, reference.name, context);
        if (resolved) return resolved;
      }
      const scopedMethods = context.jvmSymbols.findMethods(reference.name, "androidx.compose.ui.graphics.drawscope");
      const scopedMethod = scopedMethods.find((entry) => entry.method.parameterTypes.length >= 1)
        ?? scopedMethods[0];
      if (scopedMethod) return scopedMethod.method;
    }

    // java.io.OutputStream.flush() is commonly used through Kotlin's `use`
    // scope. The reference pass intentionally stays syntax-only and cannot
    // always reconstruct the chained receiver, so use the canonical JVM
    // declaration as a conservative fallback when the method is parameterless.
    if (reference.name === "flush" && context.jvmSymbols) {
      const outputStream = context.jvmSymbols.getClass("java.io.OutputStream");
      const flush = outputStream?.methods.find((method) => method.name === "flush" && method.parameterTypes.length === 0);
      if (flush) return flush;
    }

    const project = context.projectSymbols?.findFunctionsByName(reference.name)
      .find((candidate) => !candidate.container);
    if (project) return project;

    if (reference.containerName) {
      const containerFunction = (context.projectSymbols?.findFunctionsByName(reference.name) ?? [])
        .find((candidate) => candidate.container?.name === reference.containerName);
      if (containerFunction) return containerFunction;
    }

    return this.resolveImportedJvmFunction(reference.name, context)
      ?? (KOTLIN_BUILTIN_FUNCTIONS.has(reference.name) ? builtinFunction(reference.name) : undefined);
  }

  private resolveImplicitReceivers(lambdaContext: LambdaContext | undefined, context: ResolutionPassContext): ResolvedTypeSymbol[] {
    if (!lambdaContext) return [];
    const receivers = lambdaContext.parent ? this.resolveImplicitReceivers(lambdaContext.parent, context) : [];
    const receiver = this.resolveLambdaReceiver(lambdaContext, context);
    if (receiver) receivers.push(receiver);
    return receivers;
  }

  private resolveLambdaReceiver(lambdaContext: LambdaContext, context: ResolutionPassContext): ResolvedTypeSymbol | undefined {
    const callable = this.resolveReference(lambdaContext.call, context);
    if (!callable || !("parameters" in callable)) return undefined;
    const parameter = callable.parameters[lambdaContext.parameterIndex];
    const trailingParameter = lambdaContext.isTrailing
      ? [...callable.parameters].reverse().find((candidate) => candidate.typeRef?.functionReceiver)
      : undefined;
    const receiverType = parameter?.typeRef?.functionReceiver ?? trailingParameter?.typeRef?.functionReceiver;
    if (!receiverType) return undefined;
    return this.types.resolveType(receiverType.name, context);
  }

  private resolveImportedJvmFunction(name: string, context: ResolutionPassContext): MemberSymbol | undefined {
    if (!context.jvmSymbols) return undefined;
    const imported = this.imports.resolve(name, context.imports);
    for (const candidate of imported) {
      if (!candidate.endsWith(`.${name}`)) continue;
      const packageName = candidate.slice(0, -(name.length + 1));
      const method = context.jvmSymbols.findMethods(name, packageName).find((entry) => entry.method.static);
      if (method) return method.method;
    }
    for (const item of context.imports) {
      if (!item.wildcard) continue;
      const method = context.jvmSymbols.findMethods(name, item.path).find((entry) => entry.method.static);
      if (method) return method.method;
    }
    for (const packageName of KOTLIN_IMPLICIT_IMPORT_PACKAGES) {
      const method = context.jvmSymbols.findMethods(name, packageName).find((entry) => entry.method.static);
      if (method) return method.method;
    }
    return undefined;
  }

  private resolveMember(reference: SymbolReference, context: ResolutionPassContext): MemberSymbol | Symbol | undefined {
    const receiver = this.resolveReceiver(reference.receiver, context);
    if (receiver) {
      const member = this.members.resolveProperty(receiver, reference.name, context)
        ?? this.members.resolveMethod(receiver, reference.name, context);
      if (member) return member;
    }

    const extension = this.resolveImportedJvmFunction(reference.name, context);
    if (extension) return extension;
    return undefined;
  }

  private resolveReceiver(reference: SymbolReference | undefined, context: ResolutionPassContext): ResolvedTypeSymbol | undefined {
    if (!reference) return undefined;
    return context.scope?.get<ResolvedTypeSymbol>(reference.name)
      ?? this.types.resolveType(reference.name, context);
  }

  private resolveImport(reference: SymbolReference, context: ResolutionPassContext): ResolvedSymbol | undefined {
    if (context.jvmSymbols && reference.name.endsWith(".*")) {
      const packageName = reference.name.slice(0, -2);
      if (context.jvmSymbols.findMethods("", packageName).length > 0) return { name: reference.name, qualifiedName: reference.name, kind: SymbolKind.Package } as Symbol;
    }
    if (context.jvmSymbols && !reference.name.endsWith(".*")) {
      const parts = reference.name.split(".");
      const importedName = parts.pop();
      const packageName = parts.join(".");
      if (importedName && packageName) {
        const method = context.jvmSymbols.findMethods(importedName, packageName).find((entry) => entry.method.static);
        if (method) return method.method;
        const field = this.findImportedJvmField(importedName, packageName, context);
        if (field) return field;
      }
    }
    for (const candidate of this.imports.resolve(reference.name, context.imports)) {
      const resolved = this.types.resolveType(candidate, context);
      if (resolved) return resolved;
    }
    return this.types.resolveType(reference.name, context);
  }

  private findImportedJvmField(name: string, packageName: string, context: ResolutionPassContext): MemberSymbol | undefined {
    const candidates = context.jvmSymbols?.findMethods("", packageName) ?? [];
    const classes = new Set(candidates.map((entry) => entry.className));
    for (const className of classes) {
      const symbol = context.jvmSymbols?.getClass(className);
      const field = symbol?.fields.find((candidate) => candidate.name === name && candidate.static);
      if (field) return field;
      const getter = symbol?.methods.find((candidate) => candidate.static && candidate.name === `get${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`);
      if (getter) return getter;
    }
    return undefined;
  }
}

export function resolveReferences(references: SymbolReference[], context: ResolutionPassContext): ResolvedReference[] {
  return new ResolutionPass().resolve(references, context);
}

const KOTLIN_IMPLICIT_IMPORT_PACKAGES = [
  "kotlin",
  "kotlin.annotation",
  "kotlin.collections",
  "kotlin.comparisons",
  "kotlin.io",
  "kotlin.math",
  "kotlin.jvm",
  "kotlin.ranges",
  "kotlin.sequences",
  "kotlin.text",
  "java.lang",
];

const KOTLIN_BUILTIN_FUNCTIONS = new Set([
  "arrayOf",
  "arrayOfNulls",
  "emptyArray",
]);

function builtinFunction(name: string): Symbol {
  return { name, qualifiedName: `kotlin.${name}`, kind: "function" as Symbol["kind"] };
}

export const resolutionPass = new ResolutionPass();

function hasLambdaCall(lambdaContext: LambdaContext | undefined, name: string): boolean {
  for (let current = lambdaContext; current; current = current.parent) {
    if (current.call.name === name) return true;
  }
  return false;
}

function round(value: number): number { return Math.round(value * 100) / 100; }
