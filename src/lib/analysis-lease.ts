type LockLike = { name: string };

type LockManagerLike = {
  request(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: LockLike | null) => Promise<void>
  ): Promise<unknown>;
};

export class AnalysisLease {
  private readonly locks?: LockManagerLike;
  private readonly name: string;
  private releaseHeldLock: (() => void) | null = null;
  private pendingAcquire: Promise<boolean> | null = null;
  private heldRequest: Promise<unknown> | null = null;

  constructor(locks?: LockManagerLike, name = "memory-map-browser-model") {
    this.locks = locks;
    this.name = name;
  }

  acquire(): Promise<boolean> {
    if (this.releaseHeldLock) return Promise.resolve(true);
    if (this.pendingAcquire) return this.pendingAcquire;
    if (!this.locks) {
      this.releaseHeldLock = () => {
        this.releaseHeldLock = null;
      };
      return Promise.resolve(true);
    }

    let settleAcquire: (didAcquire: boolean) => void = () => undefined;
    const acquired = new Promise<boolean>((resolve) => {
      settleAcquire = (didAcquire) => {
        this.pendingAcquire = null;
        resolve(didAcquire);
      };
    });
    this.pendingAcquire = acquired;

    const request = this.locks
      .request(this.name, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) {
          settleAcquire(false);
          return;
        }
        await new Promise<void>((release) => {
          this.releaseHeldLock = () => {
            this.releaseHeldLock = null;
            release();
          };
          settleAcquire(true);
        });
      })
      .catch(() => settleAcquire(false))
      .finally(() => {
        if (this.pendingAcquire === acquired) this.pendingAcquire = null;
        if (this.heldRequest === request) this.heldRequest = null;
      });
    this.heldRequest = request;

    return acquired;
  }

  async release(): Promise<void> {
    const request = this.heldRequest;
    this.releaseHeldLock?.();
    if (request) await request;
  }
}
