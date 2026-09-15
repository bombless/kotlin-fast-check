import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { AndroidSdk } from "../src/android/AndroidSdk.js";

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
});