/**
 * Coordinates Unity process launch so callers can react only after the child
 * process has actually started.
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export type SpawnProcess = typeof spawn;

export function launchUnityProcess(
  spawnProcess: SpawnProcess,
  unityPath: string,
  args: string[],
  onSpawned: () => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawnProcess(unityPath, args, {
      stdio: "ignore",
      detached: true,
      // Git Bash (MSYS) rewrites Windows-style paths unless the launch opts out.
      env: {
        ...process.env,
        MSYS_NO_PATHCONV: "1",
      },
    });

    const handleError = (error: Error): void => {
      child.removeListener("spawn", handleSpawn);
      reject(new Error(`Failed to launch Unity: ${error.message}`));
    };

    const handleSpawn = (): void => {
      child.removeListener("error", handleError);
      onSpawned();
      child.unref();
      resolve();
    };

    child.once("error", handleError);
    child.once("spawn", handleSpawn);
  });
}
