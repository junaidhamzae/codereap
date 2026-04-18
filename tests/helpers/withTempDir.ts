import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Create a temporary directory, run the callback, then clean up.
 * Supports both sync and async callbacks via overloads so callers get a
 * precise return type (important for jest's `it()` callback signature).
 *
 * @param prefix - Temp directory name prefix (e.g. 'report-', 'cache-')
 * @param run - Callback receiving the absolute temp dir path
 */
export function withTempDir(prefix: string, run: (dir: string) => Promise<void>): Promise<void>;
export function withTempDir(prefix: string, run: (dir: string) => void): void;
export function withTempDir(
  prefix: string,
  run: (dir: string) => Promise<void> | void
): Promise<void> | void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const cleanup = () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  // Ownership of cleanup is handed off to the returned Promise on the async
  // path. The outer finally only runs cleanup on the sync path, including
  // sync throws (previously the tempdir leaked on sync throw).
  let asyncHandoff = false;
  try {
    const res = run(dir);
    if (res && typeof (res as any).then === 'function') {
      asyncHandoff = true;
      return (res as Promise<void>).finally(cleanup);
    }
  } finally {
    if (!asyncHandoff) cleanup();
  }
}
