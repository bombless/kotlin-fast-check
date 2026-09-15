import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJar, type JvmSymbolIndex } from "../jvm/JarReader.js";

export class AndroidSdk {

  constructor(private readonly sdkRoot = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME) {}

  get root(): string | undefined {
    return this.sdkRoot;
  }

  findAndroidJar(apiLevel?: number): string | undefined {
    if (!this.sdkRoot) return undefined;
    const platformsRoot = join(this.sdkRoot, "platforms");
    if (apiLevel !== undefined) {
      const candidate = join(platformsRoot, `android-${apiLevel}`, "android.jar");
      return existsSync(candidate) ? candidate : undefined;
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
    return candidates[0]?.path;
  }

  load(apiLevel?: number): JvmSymbolIndex {
    const path = this.findAndroidJar(apiLevel);
    if (!path) throw new Error(apiLevel === undefined ? "Android SDK android.jar not found" : `Android SDK android-${apiLevel} android.jar not found`);
    return readJar(path);
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