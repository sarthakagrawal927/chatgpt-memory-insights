import { describe, expect, it } from "vitest";
import { AnalysisLease } from "./analysis-lease";

class TestLockManager {
  private held = false;

  async request(
    name: string,
    _options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: { name: string } | null) => Promise<void>
  ) {
    if (this.held) return callback(null);
    this.held = true;
    try {
      return await callback({ name });
    } finally {
      this.held = false;
    }
  }
}

describe("AnalysisLease", () => {
  it("allows only one browser tab to retain the model lock", async () => {
    const locks = new TestLockManager();
    const first = new AnalysisLease(locks);
    const second = new AnalysisLease(locks);

    await expect(first.acquire()).resolves.toBe(true);
    await expect(second.acquire()).resolves.toBe(false);

    await first.release();
    await expect(second.acquire()).resolves.toBe(true);
    await second.release();
  });

  it("keeps analysis available when the Web Locks API is unavailable", async () => {
    const lease = new AnalysisLease();
    await expect(lease.acquire()).resolves.toBe(true);
    await lease.release();
    await expect(lease.acquire()).resolves.toBe(true);
  });
});
