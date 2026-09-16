import { existsSync } from "node:fs";
import { join } from "node:path";
import { getJarSymbolCacheStats, readJar, type JvmSymbolIndex } from "../jvm/JarReader.js";
import { perf } from "../util/PerformanceLogger.js";

export class AndroidSdk {

  constructor(private readonly sdkRoot = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME) {}

  get root(): string | undefined {
    return this.sdkRoot;
  }

  findAndroidJar(apiLevel?: number): string | undefined {
    const end = perf.start("AndroidSDK.findAndroidJar", { sdkRoot: this.sdkRoot, apiLevel });
    if (!this.sdkRoot) {
      end({ result: "no-sdk-root" });
      return undefined;
    }
    const platformsRoot = join(this.sdkRoot, "platforms");
    if (apiLevel !== undefined) {
      const candidate = join(platformsRoot, `android-${apiLevel}`, "android.jar");
      const result = existsSync(candidate) ? candidate : undefined;
      end({ result: result ? "found" : "not-found" });
      return result;
    }

    const candidates: { level: number; path: string }[] = [];
    for (const entry of requireDirectory(platformsRoot)) {
      const match = /^android-(\d+)$/.exec(entry);
      if (!match) continue;
      const level = Number(match[1]);
      const path = join(platformsRoot, entry, "android.jar");
      if (existsSync(path)) candidates.push({ level, path });
    }
    candidates.sort((a, b) => b.level - a.level);
    const result = candidates[0]?.path;
    end({ result: result ? "found" : "not-found", candidateCount: candidates.length });
    return result;
  }

  load(apiLevel?: number): JvmSymbolIndex {
    const end = perf.start("AndroidSDK.load", { apiLevel });
    const path = this.findAndroidJar(apiLevel);
    if (!path) {
      end({ result: "not-found" });
      throw new Error(apiLevel === undefined ? "Android SDK android.jar not found" : `Android SDK android-${apiLevel} android.jar not found`);
    }
    const before = getJarSymbolCacheStats();
    const index = readJar(path);
    const after = getJarSymbolCacheStats();
    perf.log("JarSymbolCache", {
      jar: path,
      cacheHits: after.cacheHits - before.cacheHits,
      cacheMisses: after.cacheMisses - before.cacheMisses,
    });
    end({ result: "loaded", jar: path });
    return index;
  }
}

function requireDirectory(path: string): string[] {
  try {
    // eslint-free synchronous directory listing without making the public API async.
    return require("node:fs").readdirSync(path) as string[];
  } catch {
    return [];
  }
}