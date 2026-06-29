import { describe, expect, it } from "vitest";
import { isBlueprintLive } from "./index";

describe("isBlueprintLive", () => {
  it("treats only the python-service blueprint as live", () => {
    expect(isBlueprintLive({ name: "python-service" })).toBe(true);
    expect(isBlueprintLive({ name: "rust-service" })).toBe(false);
    expect(isBlueprintLive({ name: "node-service" })).toBe(false);
  });
});
