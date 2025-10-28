#!/usr/bin/env node
/*
  quit-unity: Quit the Unity Editor instance that has the specified project open.
  Platforms: macOS, Windows
*/

import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const TEMP_DIRECTORY_NAME = "Temp";

type QuitOptions = {
  projectPath: string;
  timeoutMs: number;
  force: boolean;
};

function parseArgs(argv: string[]): QuitOptions {
  const defaultProjectPath = process.cwd();
  const defaultTimeoutMs = 15000;
  const defaultForce = false;
  const args: string[] = argv.slice(2);

  let projectPath: string = defaultProjectPath;
  let timeoutMs: number = defaultTimeoutMs;
  let force: boolean = defaultForce;

  for (let i = 0; i < args.length; i++) {
    const arg: string = args[i] ?? "";

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--force" || arg === "-f") {
      force = true;
      continue;
    }

    if (arg === "--timeout" || arg === "-t") {
      const value: string | undefined = args[i + 1];
      if (!value || value.startsWith("-")) {
        console.error("Error: --timeout requires a millisecond value");
        process.exit(1);
      }
      const parsedValue = Number(value);
      const parsed: number = parsedValue;
      if (!Number.isFinite(parsed) || parsed < 0) {
        console.error("Error: --timeout must be a non-negative number (milliseconds)");
        process.exit(1);
      }
      timeoutMs = parsed;
      i++;
      continue;
    }

    if (arg.startsWith("-")) {
      // Unknown flags are ignored to keep CLI permissive
      continue;
    }

    // First positional = project path
    projectPath = resolve(arg);
  }

  return { projectPath, timeoutMs, force };
}

function printHelp(): void {
  const help = `
Usage: quit-unity [PROJECT_PATH] [--timeout <ms>] [--force]

Quit the Unity Editor instance that has PROJECT_PATH open.

Arguments:
  PROJECT_PATH        Optional. Defaults to current directory

Flags:
  -t, --timeout <ms>  Time to wait for graceful quit (default: 15000)
  -f, --force         Force kill if not exited within timeout
  -h, --help          Show this help message
`;
  process.stdout.write(help);
}

function ensureProjectPath(projectPath: string): void {
  if (!existsSync(projectPath)) {
    console.error(`Error: Project directory not found: ${projectPath}`);
    process.exit(1);
  }
}

function readPidFromEditorInstance(projectPath: string): number | null {
  const editorInstancePath: string = join(projectPath, "Library", "EditorInstance.json");
  if (!existsSync(editorInstancePath)) return null;

  try {
    const content: string = readFileSync(editorInstancePath, "utf8");
    const data: Record<string, unknown> = JSON.parse(content) as Record<string, unknown>;

    const candidateKeys: string[] = [
      "process_id",
      "processId",
      "processID",
      "pid",
      "PID",
    ];

    for (const key of candidateKeys) {
      const value: unknown = data[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    }
  } catch {
    // fallthrough
  }
  return null;
}

function isProcessAlive(pid: number): boolean {
  try {
    // signal 0: does not actually send a signal, just tests for existence/permissions
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const start: number = Date.now();
  const stepIntervalMs = 200;
  const stepMs: number = stepIntervalMs;

  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return !isProcessAlive(pid);
}

async function quitByPid(pid: number, force: boolean, timeoutMs: number): Promise<boolean> {
  // Try graceful first
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // If process already exited, consider it success
    if (!isProcessAlive(pid)) return true;
    // If we cannot send the signal and the process is alive, escalate when force is true
    if (!force) return false;
  }

  const graceful: boolean = await waitForExit(pid, timeoutMs);
  if (graceful) return true;

  if (!force) return false;

  // Force kill
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ignore
  }
  // Give a short moment after force
  return await waitForExit(pid, 2000);
}

async function removeTempDirectory(projectPath: string): Promise<void> {
  const tempDirectoryPath: string = join(projectPath, TEMP_DIRECTORY_NAME);
  if (!existsSync(tempDirectoryPath)) return;

  try {
    await rm(tempDirectoryPath, { recursive: true, force: true });
    console.log(`Deleted Temp directory: ${tempDirectoryPath}`);
  } catch (error: unknown) {
    const message: string = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to delete Temp directory: ${message}`);
  }
}

async function main(): Promise<void> {
  const options: QuitOptions = parseArgs(process.argv);
  ensureProjectPath(options.projectPath);

  const pid: number | null = readPidFromEditorInstance(options.projectPath);
  if (pid === null) {
    console.error(
      "Error: Could not find Unity PID. Is this project currently open in Unity? (Missing Library/EditorInstance.json)"
    );
    process.exit(1);
    return;
  }

  console.log(`Attempting to quit Unity (pid: ${pid}) for project: ${options.projectPath}`);
  const ok: boolean = await quitByPid(pid, options.force, options.timeoutMs);
  if (!ok) {
    console.error(
      `Failed to quit Unity (pid: ${pid}) within ${options.timeoutMs}ms.${options.force ? "" : " Try --force."}`
    );
    process.exit(1);
    return;
  }
  console.log("Unity has exited.");
  await removeTempDirectory(options.projectPath);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});


