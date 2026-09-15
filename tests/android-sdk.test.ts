import { describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync } from "fflate";
import { AndroidSdk } from "../src/android/AndroidSdk.js";

const fixture = fileURLToPath(new URL("./android-sdk/platforms/android-35/android.jar", import.meta.url));

function tempAndroidSdk(name = "android-sdk"): { root: string; jar: string } {
  const root = mkdtempSync(join(tmpdir(), `kotlin-fast-check-${name}-`));
  const jar = join(root, "platforms", "android-35", "android.jar");
  const directory = join(root, "platforms", "android-35");
  mkdirSync(directory, { recursive: true });
  copyFileSync(fixture, jar);
  return { root, jar };
}

const sdkRoot = fileURLToPath(new URL("./android-sdk", import.meta.url));

describe("AndroidSdk", () => {
  it("finds an API-specific android.jar", () => {
    const sdk = new AndroidSdk(sdkRoot);
    expect(sdk.findAndroidJar(35)).toBe(fileURLToPath(new URL("./android-sdk/platforms/android-35/android.jar", import.meta.url)));
  });

  it("loads and caches the android.jar symbol index", () => {
    const sdk = new AndroidSdk(sdkRoot);
    const first = sdk.load(35);
    const second = sdk.load(35);
    expect(first).toBe(second);
    expect(first.getClass("fixtures.Example")).toBeDefined();
  });

  it("misses when android.jar mtime changes", () => {
    const { root, jar } = tempAndroidSdk("mtime");
    const sdk = new AndroidSdk(root);
    const first = sdk.load(35);
    const current = statSync(jar);
    utimesSync(jar, current.atime, new Date(current.mtimeMs + 10_000));
    const second = sdk.load(35);

    expect(second).not.toBe(first);
  });

  it("misses when android.jar size changes", () => {
    const { root, jar } = tempAndroidSdk("size");
    const sdk = new AndroidSdk(root);
    const first = sdk.load(35);
    const archive = unzipSync(new Uint8Array(readFileSync(jar)));
    archive["cache-marker.txt"] = new Uint8Array([1]);
    writeFileSync(jar, zipSync(archive));
    const second = sdk.load(35);

    expect(statSync(jar).size).not.toBe(statSync(fixture).size);
    expect(second).not.toBe(first);
    expect(second.getClass("fixtures.Example")).toEqual(first.getClass("fixtures.Example"));
  });

  it("does not share entries across different absolute android.jar paths", () => {
    const firstSdk = tempAndroidSdk("first");
    const secondSdk = tempAndroidSdk("second");
    const first = new AndroidSdk(firstSdk.root).load(35);
    const second = new AndroidSdk(secondSdk.root).load(35);

    expect(second).not.toBe(first);
  });
});