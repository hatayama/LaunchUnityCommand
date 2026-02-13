/**
 * launch-unity core library functions.
 * Pure library code without CLI entry point or side effects.
 */

import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { ensureProjectEntryAndUpdate, updateLastModifiedIfExists, getProjectCliArgs, parseCliArgs, groupCliArgs } from "./unityHub.js";

export type LaunchOptions = {
  subcommand?: "update";
  projectPath?: string;
  platform?: string | undefined;
  unityArgs: string[];
  searchMaxDepth: number; // -1 for unlimited; default 3
  restart: boolean;
  quit: boolean;
  addUnityHub: boolean;
  favoriteUnityHub: boolean;
};

export type LaunchResolvedOptions = {
  projectPath: string;
  platform?: string | undefined;
  unityArgs: string[];
  unityVersion: string;
};

export type UnityProcessInfo = {
  pid: number;
  projectPath: string;
};

const execFileAsync = promisify(execFile);
const UNITY_EXECUTABLE_PATTERN_MAC = /Unity\.app\/Contents\/MacOS\/Unity/i;
const UNITY_EXECUTABLE_PATTERN_WINDOWS = /Unity\.exe/i;
const PROJECT_PATH_PATTERN = /-(?:projectPath|projectpath)(?:=|\s+)("[^"]+"|'[^']+'|.+?)(?=\s+-[a-zA-Z]|$)/i;
const PROCESS_LIST_COMMAND_MAC = "ps";
const PROCESS_LIST_ARGS_MAC = ["-axo", "pid=,command=", "-ww"];
const WINDOWS_POWERSHELL = "powershell";
const UNITY_LOCKFILE_NAME = "UnityLockfile";
const TEMP_DIRECTORY_NAME = "Temp";

export function parseArgs(argv: string[]): LaunchOptions {
  const args: string[] = argv.slice(2);

  const doubleDashIndex: number = args.indexOf("--");
  let cliArgs: string[] = doubleDashIndex >= 0 ? args.slice(0, doubleDashIndex) : args;
  const unityArgs: string[] = doubleDashIndex >= 0 ? args.slice(doubleDashIndex + 1) : [];

  let subcommand: "update" | undefined;
  const firstToken: string | undefined = cliArgs[0];
  if (firstToken === "update") {
    subcommand = "update";
    cliArgs = cliArgs.slice(1);
  }

  const positionals: string[] = [];
  let maxDepth = 3; // default 3; -1 means unlimited
  let restart = false;
  let quit = false;
  let addUnityHub = false;
  let favoriteUnityHub = false;
  let platform: string | undefined;

  for (let i = 0; i < cliArgs.length; i++) {
    const arg = cliArgs[i] ?? "";
    if (arg === "--help" || arg === "-h") {
      continue; // Skip help flag - caller should handle
    }
    if (arg === "--version" || arg === "-v") {
      continue; // Skip version flag - caller should handle
    }
    if (arg === "-r" || arg === "--restart") {
      restart = true;
      continue;
    }
    if (arg === "-q" || arg === "--quit") {
      quit = true;
      continue;
    }
    if (
      arg === "-u" ||
      arg === "-a" ||
      arg === "--unity-hub-entry" ||
      arg === "--add-unity-hub"
    ) {
      addUnityHub = true;
      continue;
    }
    if (arg === "-f" || arg === "--favorite") {
      favoriteUnityHub = true;
      continue;
    }
    if (arg === "-p" || arg === "--platform") {
      const next = cliArgs[i + 1];
      if (typeof next === "string" && !next.startsWith("-")) {
        platform = next;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith("--platform=")) {
      const value = arg.slice("--platform=".length);
      if (value.length > 0) {
        platform = value;
      }
      continue;
    }
    if (arg.startsWith("--max-depth")) {
      const parts = arg.split("=");
      if (parts.length === 2) {
        const value = Number.parseInt(parts[1] ?? "", 10);
        if (Number.isFinite(value)) {
          maxDepth = value;
        }
        continue;
      }
      const next = cliArgs[i + 1];
      if (typeof next === "string" && !next.startsWith("-")) {
        const value = Number.parseInt(next, 10);
        if (Number.isFinite(value)) {
          maxDepth = value;
        }
        i += 1;
        continue;
      }
      continue;
    }
    if (arg.startsWith("-")) {
      console.warn(`Warning: Unknown option ignored: ${arg}`);
      continue;
    }
    positionals.push(arg);
  }

  let projectPath: string | undefined;
  if (positionals.length > 0) {
    projectPath = resolve(positionals[0] ?? "");
  }
  if (positionals.length > 1) {
    const ignored: string = positionals.slice(1).join(", ");
    console.warn(`Warning: Extra arguments ignored: ${ignored}`);
    console.warn("  Use -p option for platform: launch-unity -p <platform>");
  }

  const options: LaunchOptions = {
    unityArgs,
    searchMaxDepth: maxDepth,
    restart,
    quit,
    addUnityHub,
    favoriteUnityHub,
  };
  if (subcommand) {
    options.subcommand = subcommand;
  }
  if (projectPath !== undefined) {
    options.projectPath = projectPath;
  }
  if (platform !== undefined) {
    options.platform = platform;
  }
  return options;
}

export function getUnityVersion(projectPath: string): string {
  const versionFile: string = join(projectPath, "ProjectSettings", "ProjectVersion.txt");
  if (!existsSync(versionFile)) {
    throw new Error(
      `ProjectVersion.txt not found at ${versionFile}. This does not appear to be a Unity project.`,
    );
  }

  const content: string = readFileSync(versionFile, "utf8");
  const version: string | undefined = content.match(/m_EditorVersion:\s*([^\s\n]+)/)?.[1];
  if (!version) {
    throw new Error(`Could not extract Unity version from ${versionFile}`);
  }
  return version;
}

function getUnityPathWindows(version: string): string {
  const candidates: string[] = [];
  const programFiles: string | undefined = process.env["PROGRAMFILES"];
  const programFilesX86: string | undefined = process.env["PROGRAMFILES(X86)"];
  const localAppData: string | undefined = process.env["LOCALAPPDATA"];

  const addCandidate = (base: string | undefined): void => {
    if (!base) {
      return;
    }
    candidates.push(join(base, "Unity", "Hub", "Editor", version, "Editor", "Unity.exe"));
  };

  addCandidate(programFiles);
  addCandidate(programFilesX86);
  addCandidate(localAppData);
  candidates.push(join("C:\\", "Program Files", "Unity", "Hub", "Editor", version, "Editor", "Unity.exe"));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? join("C:\\", "Program Files", "Unity", "Hub", "Editor", version, "Editor", "Unity.exe");
}

function getUnityPath(version: string): string {
  if (process.platform === "darwin") {
    return `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`;
  }
  if (process.platform === "win32") {
    return getUnityPathWindows(version);
  }
  return `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`;
}

const removeTrailingSeparators = (target: string): string => {
  let trimmed = target;
  while (trimmed.length > 1 && (trimmed.endsWith("/") || trimmed.endsWith("\\"))) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
};

const normalizePath = (target: string): string => {
  const resolvedPath = resolve(target);
  const trimmed = removeTrailingSeparators(resolvedPath);
  return trimmed;
};

const toComparablePath = (value: string): string => {
  return value.replace(/\\/g, "/").toLocaleLowerCase();
};

const pathsEqual = (left: string, right: string): boolean => {
  return toComparablePath(normalizePath(left)) === toComparablePath(normalizePath(right));
};

function extractProjectPath(command: string): string | undefined {
  const match = command.match(PROJECT_PATH_PATTERN);
  if (!match) {
    return undefined;
  }

  const raw = match[1];
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

const isUnityAuxiliaryProcess = (command: string): boolean => {
  const normalizedCommand: string = command.toLowerCase();
  if (normalizedCommand.includes("-batchmode")) {
    return true;
  }
  return normalizedCommand.includes("assetimportworker");
};

async function listUnityProcessesMac(): Promise<UnityProcessInfo[]> {
  let stdout = "";
  try {
    const result = await execFileAsync(PROCESS_LIST_COMMAND_MAC, PROCESS_LIST_ARGS_MAC);
    stdout = result.stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to retrieve Unity process list: ${message}`);
    return [];
  }

  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const processes: UnityProcessInfo[] = [];

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.*)$/);
    if (!match) {
      continue;
    }

    const pidValue = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(pidValue)) {
      continue;
    }

    const command = match[2] ?? "";
    if (!UNITY_EXECUTABLE_PATTERN_MAC.test(command)) {
      continue;
    }
    if (isUnityAuxiliaryProcess(command)) {
      continue;
    }

    const projectArgument = extractProjectPath(command);
    if (!projectArgument) {
      continue;
    }

    processes.push({
      pid: pidValue,
      projectPath: normalizePath(projectArgument),
    });
  }

  return processes;
}

async function listUnityProcessesWindows(): Promise<UnityProcessInfo[]> {
  const scriptLines: string[] = [
    "$ErrorActionPreference = 'Stop'",
    "$processes = Get-CimInstance Win32_Process -Filter \"Name = 'Unity.exe'\" | Where-Object { $_.CommandLine }",
    "foreach ($process in $processes) {",
    "  $commandLine = $process.CommandLine -replace \"`r\", ' ' -replace \"`n\", ' '",
    "  Write-Output (\"{0}|{1}\" -f $process.ProcessId, $commandLine)",
    "}",
  ];

  let stdout = "";
  try {
    const result = await execFileAsync(WINDOWS_POWERSHELL, ["-NoProfile", "-Command", scriptLines.join("\n")]);
    stdout = result.stdout ?? "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to retrieve Unity process list on Windows: ${message}`);
    return [];
  }

  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const processes: UnityProcessInfo[] = [];

  for (const line of lines) {
    const delimiterIndex = line.indexOf("|");
    if (delimiterIndex < 0) {
      continue;
    }

    const pidText = line.slice(0, delimiterIndex).trim();
    const command = line.slice(delimiterIndex + 1).trim();

    const pidValue = Number.parseInt(pidText, 10);
    if (!Number.isFinite(pidValue)) {
      continue;
    }

    if (!UNITY_EXECUTABLE_PATTERN_WINDOWS.test(command)) {
      continue;
    }
    if (isUnityAuxiliaryProcess(command)) {
      continue;
    }

    const projectArgument = extractProjectPath(command);
    if (!projectArgument) {
      continue;
    }

    processes.push({
      pid: pidValue,
      projectPath: normalizePath(projectArgument),
    });
  }

  return processes;
}

async function listUnityProcesses(): Promise<UnityProcessInfo[]> {
  if (process.platform === "darwin") {
    return await listUnityProcessesMac();
  }
  if (process.platform === "win32") {
    return await listUnityProcessesWindows();
  }
  return [];
}

export async function findRunningUnityProcess(projectPath: string): Promise<UnityProcessInfo | undefined> {
  const normalizedTarget: string = normalizePath(projectPath);
  const processes = await listUnityProcesses();
  return processes.find((candidate) => pathsEqual(candidate.projectPath, normalizedTarget));
}

export async function focusUnityProcess(pid: number): Promise<void> {
  if (process.platform === "darwin") {
    await focusUnityProcessMac(pid);
    return;
  }
  if (process.platform === "win32") {
    await focusUnityProcessWindows(pid);
  }
}

async function focusUnityProcessMac(pid: number): Promise<void> {
  const script = `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`;
  try {
    await execFileAsync("osascript", ["-e", script]);
    console.log("Brought existing Unity to the front.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to bring Unity to front: ${message}`);
  }
}

async function focusUnityProcessWindows(pid: number): Promise<void> {
  const addTypeLines: string[] = [
    "Add-Type -TypeDefinition @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class Win32Interop {",
    "  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
    "  [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);",
    "}",
    "\"@",
  ];

  const scriptLines: string[] = [
    "$ErrorActionPreference = 'Stop'",
    ...addTypeLines,
    `try { $process = Get-Process -Id ${pid} -ErrorAction Stop } catch { return }`,
    "$handle = $process.MainWindowHandle",
    "if ($handle -eq 0) { return }",
    "[Win32Interop]::ShowWindowAsync($handle, 9) | Out-Null",
    "[Win32Interop]::SetForegroundWindow($handle) | Out-Null",
  ];

  try {
    await execFileAsync(WINDOWS_POWERSHELL, ["-NoProfile", "-Command", scriptLines.join("\n")]);
    console.log("Brought existing Unity to the front.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to bring Unity to front on Windows: ${message}`);
  }
}

async function isLockfileHeldMac(lockfilePath: string): Promise<boolean> {
  try {
    const result = await execFileAsync("lsof", [lockfilePath]);
    const lines: string[] = result.stdout.split("\n").filter((line) => line.length > 0);
    // lsof output: header line + one line per process holding the file
    return lines.length > 1;
  } catch {
    // lsof returns exit code 1 when no process holds the file
    return false;
  }
}

async function isLockfileHeldWindows(lockfilePath: string): Promise<boolean> {
  const escapedPath: string = lockfilePath.replace(/'/g, "''");
  // PowerShell スクリプトは常に exit 0 で終了し、stdout で結果を返す。
  // これにより PowerShell 自体の実行失敗（ENOENT 等）と区別できる。
  const scriptLines: string[] = [
    "try {",
    `  $f = [System.IO.File]::Open('${escapedPath}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)`,
    "  $f.Close()",
    "  Write-Output 'UNLOCKED'",
    "} catch [System.IO.IOException] {",
    "  Write-Output 'LOCKED'",
    "} catch {",
    "  Write-Output 'UNLOCKED'",
    "}",
  ];
  try {
    const result = await execFileAsync(WINDOWS_POWERSHELL, ["-NoProfile", "-Command", scriptLines.join("\n")]);
    return result.stdout.trim() === "LOCKED";
  } catch {
    // PowerShell 自体が見つからない/実行できない場合はロックなし扱い
    return false;
  }
}

async function isLockfileHeld(lockfilePath: string): Promise<boolean> {
  if (process.platform === "darwin") {
    return await isLockfileHeldMac(lockfilePath);
  }
  if (process.platform === "win32") {
    return await isLockfileHeldWindows(lockfilePath);
  }
  return false;
}

export async function handleStaleLockfile(projectPath: string): Promise<void> {
  const tempDirectoryPath: string = join(projectPath, TEMP_DIRECTORY_NAME);
  const lockfilePath: string = join(tempDirectoryPath, UNITY_LOCKFILE_NAME);
  if (!existsSync(lockfilePath)) {
    return;
  }

  if (await isLockfileHeld(lockfilePath)) {
    throw new Error(
      `Unity appears to be running for this project (lockfile is held: ${lockfilePath}). ` +
      "Use -r to restart or -q to quit the running instance.",
    );
  }

  console.log(`UnityLockfile found without active Unity process: ${lockfilePath}`);
  console.log("Assuming previous crash. Cleaning Temp directory and continuing launch.");

  try {
    await rm(tempDirectoryPath, { recursive: true, force: true });
    console.log("Deleted Temp directory.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to delete Temp directory: ${message}`);
  }

  try {
    await rm(lockfilePath, { force: true });
    console.log("Deleted UnityLockfile.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to delete UnityLockfile: ${message}`);
  }
  console.log();
}

const KILL_POLL_INTERVAL_MS = 100;
const KILL_TIMEOUT_MS = 10000;
const GRACEFUL_QUIT_TIMEOUT_MS = 10000;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcess(pid: number): void {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process already exited
  }
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, KILL_POLL_INTERVAL_MS));
  }
  return false;
}

export async function killRunningUnity(projectPath: string): Promise<void> {
  const processInfo = await findRunningUnityProcess(projectPath);
  if (!processInfo) {
    console.log("No running Unity process found for this project.");
    console.log();
    return;
  }

  const pid = processInfo.pid;
  console.log(`Killing Unity (PID: ${pid})...`);
  killProcess(pid);

  const exited = await waitForProcessExit(pid, KILL_TIMEOUT_MS);
  if (!exited) {
    throw new Error(`Failed to kill Unity (PID: ${pid}) within ${KILL_TIMEOUT_MS / 1000}s.`);
  }

  console.log("Unity killed.");
  console.log();
}

async function sendGracefulQuitMac(pid: number): Promise<void> {
  // System Events quit and "tell application to quit" leave UnityLockfile behind,
  // so we send Cmd+Q keystroke to trigger Unity's normal user-initiated shutdown flow
  const script = [
    'tell application "System Events"',
    `  set frontmost of (first process whose unix id is ${pid}) to true`,
    '  keystroke "q" using {command down}',
    "end tell",
  ].join("\n");
  try {
    await execFileAsync("osascript", ["-e", script]);
  } catch {
    // Process may have already exited
  }
}

async function sendGracefulQuitWindows(pid: number): Promise<void> {
  // process.kill(pid, "SIGTERM") forcefully kills on Windows, so use CloseMainWindow() to send WM_CLOSE
  const scriptLines: string[] = [
    "$ErrorActionPreference = 'Stop'",
    `try { $proc = Get-Process -Id ${pid} -ErrorAction Stop; $proc.CloseMainWindow() | Out-Null } catch { }`,
  ];
  try {
    await execFileAsync(WINDOWS_POWERSHELL, ["-NoProfile", "-Command", scriptLines.join("\n")]);
  } catch {
    // Process may have already exited
  }
}

async function sendGracefulQuit(pid: number): Promise<void> {
  if (process.platform === "darwin") {
    await sendGracefulQuitMac(pid);
    return;
  }
  if (process.platform === "win32") {
    await sendGracefulQuitWindows(pid);
    return;
  }
}

export async function quitRunningUnity(projectPath: string): Promise<void> {
  const processInfo = await findRunningUnityProcess(projectPath);
  if (!processInfo) {
    console.log("No running Unity process found for this project.");
    return;
  }

  const pid = processInfo.pid;
  console.log(`Quitting Unity (PID: ${pid})...`);

  await sendGracefulQuit(pid);
  console.log(`Sent graceful quit signal. Waiting up to ${GRACEFUL_QUIT_TIMEOUT_MS / 1000}s...`);

  const exitedGracefully = await waitForProcessExit(pid, GRACEFUL_QUIT_TIMEOUT_MS);
  if (exitedGracefully) {
    console.log("Unity quit gracefully.");
    return;
  }

  console.log("Unity did not respond to graceful quit. Force killing...");
  killProcess(pid);

  const exitedAfterKill = await waitForProcessExit(pid, KILL_TIMEOUT_MS);
  if (!exitedAfterKill) {
    throw new Error(`Failed to kill Unity (PID: ${pid}) within ${KILL_TIMEOUT_MS / 1000}s.`);
  }

  console.log("Unity force killed.");
}

function hasBuildTargetArg(unityArgs: string[]): boolean {
  for (const arg of unityArgs) {
    if (arg === "-buildTarget") {
      return true;
    }
    if (arg.startsWith("-buildTarget=")) {
      return true;
    }
  }
  return false;
}

const EXCLUDED_DIR_NAMES = new Set<string>([
  "library",
  "temp",
  "logs",
  "obj",
  ".git",
  "node_modules",
  ".idea",
  ".vscode",
  ".vs",
]);

function isUnityProjectRoot(candidateDir: string): boolean {
  const versionFile: string = join(candidateDir, "ProjectSettings", "ProjectVersion.txt");
  return existsSync(versionFile);
}

function listSubdirectoriesSorted(dir: string): string[] {
  let entries: string[] = [];
  try {
    const dirents = readdirSync(dir, { withFileTypes: true });
    const subdirs = dirents
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => !EXCLUDED_DIR_NAMES.has(name.toLocaleLowerCase()));
    subdirs.sort((a, b) => a.localeCompare(b));
    entries = subdirs.map((name) => join(dir, name));
  } catch {
    // Ignore directories we cannot read
    entries = [];
  }
  return entries;
}

export function findUnityProjectBfs(rootDir: string, maxDepth: number): string | undefined {
  const queue: { dir: string; depth: number }[] = [];
  let rootCanonical: string;
  try {
    rootCanonical = realpathSync(rootDir);
  } catch {
    rootCanonical = rootDir;
  }
  queue.push({ dir: rootCanonical, depth: 0 });
  const visited = new Set<string>([toComparablePath(normalizePath(rootCanonical))]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const { dir, depth } = current;

    if (isUnityProjectRoot(dir)) {
      return normalizePath(dir);
    }

    const canDescend: boolean = maxDepth === -1 || depth < maxDepth;
    if (!canDescend) {
      continue;
    }

    const children: string[] = listSubdirectoriesSorted(dir);
    for (const child of children) {
      let childCanonical: string = child;
      try {
        const stat = lstatSync(child);
        if (stat.isSymbolicLink()) {
          try {
            childCanonical = realpathSync(child);
          } catch {
            // Broken symlink: skip
            continue;
          }
        }
      } catch {
        continue;
      }

      const key = toComparablePath(normalizePath(childCanonical));
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      queue.push({ dir: childCanonical, depth: depth + 1 });
    }
  }
  return undefined;
}

export async function launch(opts: LaunchResolvedOptions): Promise<void> {
  const { projectPath, platform, unityArgs, unityVersion } = opts;
  const unityPath: string = getUnityPath(unityVersion);

  if (!existsSync(unityPath)) {
    throw new Error(
      `Unity ${unityVersion} not found at ${unityPath}. Please install Unity through Unity Hub.`,
    );
  }

  console.log("Opening Unity...");
  console.log(`Project Path: ${projectPath}`);
  console.log(`Detected Unity version: ${unityVersion}`);

  const args: string[] = ["-projectPath", projectPath];

  const unityArgsContainBuildTarget: boolean = hasBuildTargetArg(unityArgs);
  if (platform && platform.length > 0 && !unityArgsContainBuildTarget) {
    args.push("-buildTarget", platform);
  }

  const hubCliArgs: string[] = await getProjectCliArgs(projectPath);
  if (hubCliArgs.length > 0) {
    console.log("Unity Hub launch options:");
    for (const line of groupCliArgs(hubCliArgs)) {
      console.log(`  ${line}`);
    }
    args.push(...hubCliArgs);
  } else {
    console.log("Unity Hub launch options: none");
  }

  if (unityArgs.length > 0) {
    args.push(...unityArgs);
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(unityPath, args, {
      stdio: "ignore",
      detached: true,
      // Git Bash (MSYS) がWindows パスをUnix 形式に自動変換するのを防ぐ
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
      child.unref();
      resolve();
    };

    child.once("error", handleError);
    child.once("spawn", handleSpawn);
  });
}

export type OrchestrateOptions = {
  projectPath?: string | undefined;
  searchRoot: string;
  searchMaxDepth: number;
  platform?: string | undefined;
  unityArgs: string[];
  restart: boolean;
  quit: boolean;
  addUnityHub: boolean;
  favoriteUnityHub: boolean;
};

export type OrchestrateResult =
  | { action: "launched"; projectPath: string; unityVersion: string }
  | { action: "focused"; projectPath: string; pid: number }
  | { action: "quit"; projectPath: string }
  | { action: "killed-and-launched"; projectPath: string; unityVersion: string }
  | { action: "hub-updated"; projectPath: string; unityVersion: string };

export async function orchestrateLaunch(options: OrchestrateOptions): Promise<OrchestrateResult> {
  if (options.quit && options.restart) {
    throw new Error("--quit and --restart cannot be used together.");
  }

  let resolvedProjectPath: string | undefined = options.projectPath;
  if (!resolvedProjectPath) {
    const depthInfo: string = options.searchMaxDepth === -1 ? "unlimited" : String(options.searchMaxDepth);
    console.log(`Searching for Unity project under ${options.searchRoot} (max-depth: ${depthInfo})...`);
    const found: string | undefined = findUnityProjectBfs(options.searchRoot, options.searchMaxDepth);
    if (!found) {
      throw new Error(`Unity project not found under ${options.searchRoot}.`);
    }
    console.log();
    resolvedProjectPath = found;
  }

  if (!existsSync(resolvedProjectPath)) {
    throw new Error(`Project directory not found: ${resolvedProjectPath}`);
  }

  const unityVersion: string = getUnityVersion(resolvedProjectPath);

  if (options.addUnityHub || options.favoriteUnityHub) {
    console.log(`Detected Unity version: ${unityVersion}`);
    console.log(`Project Path: ${resolvedProjectPath}`);
    const now: Date = new Date();
    await ensureProjectEntryAndUpdate(resolvedProjectPath, unityVersion, now, options.favoriteUnityHub);
    console.log("Unity Hub entry updated.");
    return { action: "hub-updated", projectPath: resolvedProjectPath, unityVersion };
  }

  if (options.quit) {
    await quitRunningUnity(resolvedProjectPath);
    return { action: "quit", projectPath: resolvedProjectPath };
  }

  const isRestart: boolean = options.restart;

  if (isRestart) {
    await killRunningUnity(resolvedProjectPath);
  } else {
    const runningProcess: UnityProcessInfo | undefined = await findRunningUnityProcess(resolvedProjectPath);
    if (runningProcess) {
      console.log(
        `Unity process already running for project: ${resolvedProjectPath} (PID: ${runningProcess.pid})`,
      );
      await focusUnityProcess(runningProcess.pid);
      return { action: "focused", projectPath: resolvedProjectPath, pid: runningProcess.pid };
    }
  }

  await handleStaleLockfile(resolvedProjectPath);

  const resolved: LaunchResolvedOptions = {
    projectPath: resolvedProjectPath,
    platform: options.platform,
    unityArgs: options.unityArgs,
    unityVersion,
  };
  await launch(resolved);

  // Hub timestamp update is non-critical external I/O; failure should not block after successful launch
  const now: Date = new Date();
  try {
    await updateLastModifiedIfExists(resolvedProjectPath, now);
  } catch (error) {
    const message: string = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to update Unity Hub lastModified: ${message}`);
  }

  const action: "killed-and-launched" | "launched" = isRestart ? "killed-and-launched" : "launched";
  return { action, projectPath: resolvedProjectPath, unityVersion };
}

// Re-export Unity Hub functions
export { ensureProjectEntryAndUpdate, updateLastModifiedIfExists, getProjectCliArgs, parseCliArgs, groupCliArgs };
