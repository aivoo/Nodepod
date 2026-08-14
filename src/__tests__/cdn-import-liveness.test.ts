import { describe, expect, it } from "vitest";
import { withDynamicImportHandle } from "../constants/cdn-urls";
import { getRegistry } from "../helpers/event-loop";

describe("CDN dynamic import liveness", () => {
  it("holds a DynamicImport handle until native import settles", async () => {
    const registry = getRegistry();
    const before = registry.activeRefedCount();
    let finish!: (value: number) => void;
    const pending = withDynamicImportHandle(
      () => new Promise<number>((resolve) => { finish = resolve; }),
    );

    expect(registry.activeRefedCount()).toBe(before + 1);
    expect(registry.groupedByType().DynamicImport).toBe(1);
    finish(42);
    await expect(pending).resolves.toBe(42);
    expect(registry.activeRefedCount()).toBe(before);
    expect(registry.groupedByType().DynamicImport).toBeUndefined();
  });
});
