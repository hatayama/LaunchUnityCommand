#!/usr/bin/env node
/*
  launch-unity: Open a Unity project with the matching Editor version.
  Platforms: macOS, Windows
*/

import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { updateLastModifiedIfExists } from "./unityHub.js";

type LaunchOptions = {
  projectPath?: string;
  platform?: string | undefined;
  unityArgs: string[];
  searchMaxDepth: number; // -1 for unlimited; default 3
  restart: boolean;
};

type LaunchResolvedOptions = {
  projectPath: string;
  platform?: string | undefined;
  unityArgs: string[];
};

type UnityProcessInfo = {
  pid: number;
  projectPath: string;
};

const execFileAsync = promisify(execFile);
const UNITY_EXECUTABLE_PATTERN_MAC = /Unity\.app\/Contents\/MacOS\/Unity/i;
const UNITY_EXECUTABLE_PATTERN_WINDOWS = /Unity\.exe/i;
const PROJECT_PATH_PATTERN = /-(?:projectPath|projectpath)(?:=|\s+)("[^"]+"|'[^']+'|[^\s"']+)/i;
const PROCESS_LIST_COMMAND_MAC = "ps";
const PROCESS_LIST_ARGS_MAC = ["-axo", "pid=,command=", "-ww"];
const WINDOWS_POWERSHELL = "powershell";
const UNITY_LOCKFILE_NAME = "UnityLockfile";
const TEMP_DIRECTORY_NAME = "Temp";

function parseArgs(argv: string[]): LaunchOptions {
  const args: string[] = argv.slice(2);

  const doubleDashIndex: number = args.indexOf("--");
  const cliArgs: string[] = doubleDashIndex >= 0 ? args.slice(0, doubleDashIndex) : args;
  const unityArgs: string[] = doubleDashIndex >= 0 ? args.slice(doubleDashIndex + 1) : [];

  const positionals: string[] = [];
  let maxDepth = 3; // default 3; -1 means unlimited
  let restart = false;

  for (let i = 0; i < cliArgs.length; i++) {
    const arg = cliArgs[i] ?? "";
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "-r" || arg === "--restart") {
      restart = true;
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
      continue;
    }
    positionals.push(arg);
  }

  let projectPath: string | undefined;
  let platform: string | undefined;

  if (positionals.length === 0) {
    projectPath = undefined; // trigger search
    platform = undefined;
  } else if (positionals.length === 1) {
    const first = positionals[0] ?? "";
    const resolvedFirst = resolve(first);
    if (existsSync(resolvedFirst)) {
      projectPath = resolvedFirst;
      platform = undefined;
    } else {
      // Treat as platform when path does not exist
      projectPath = undefined; // trigger search
      platform = String(first);
    }
  } else {
    projectPath = resolve(positionals[0] ?? "");
    platform = String(positionals[1] ?? "");
  }

  const options: LaunchOptions = { unityArgs, searchMaxDepth: maxDepth, restart };
  if (projectPath !== undefined) {
    options.projectPath = projectPath;
  }
  if (platform !== undefined) {
    options.platform = platform;
  }
  return options;
}

function printHelp(): void {
  const help = `
Usage: launch-unity [PROJECT_PATH] [PLATFORM] -- [UNITY_ARGS...]

Open a Unity project with the matching Unity Editor version installed by Unity Hub.

Arguments:
  PROJECT_PATH  Optional. Defaults to current directory
  PLATFORM      Optional. Passed to Unity as -buildTarget (e.g., StandaloneOSX, Android, iOS)

Forwarding:
  Everything after -- is forwarded to Unity unchanged.
  If UNITY_ARGS includes -buildTarget, the PLATFORM argument is ignored.

Flags:
  -h, --help          Show this help message
  -r, --restart       Kill running Unity and restart
  --max-depth <N>     Search depth when PROJECT_PATH is omitted (default 3, -1 unlimited)
`;
  process.stdout.write(help);
}

function getUnityVersion(projectPath: string): string {
  const versionFile: string = join(projectPath, "ProjectSettings", "ProjectVersion.txt");
  if (!existsSync(versionFile)) {
    console.error(`Error: ProjectVersion.txt not found at ${versionFile}`);
    console.error("This does not appear to be a Unity project.");
    process.exit(1);
  }

  const content: string = readFileSync(versionFile, "utf8");
  const version: string | undefined = content.match(/m_EditorVersion:\s*([^\s\n]+)/)?.[1];
  if (!version) {
    console.error(`Error: Could not extract Unity version from ${versionFile}`);
    process.exit(1);
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

function ensureProjectPath(projectPath: string): void {
  if (!existsSync(projectPath)) {
    console.error(`Error: Project directory not found: ${projectPath}`);
    process.exit(1);
  }
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

async function findRunningUnityProcess(projectPath: string): Promise<UnityProcessInfo | undefined> {
  const normalizedTarget: string = normalizePath(projectPath);
  const processes = await listUnityProcesses();
  return processes.find((candidate) => pathsEqual(candidate.projectPath, normalizedTarget));
}

async function focusUnityProcess(pid: number): Promise<void> {
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

async function handleStaleLockfile(projectPath: string): Promise<void> {
  const tempDirectoryPath: string = join(projectPath, TEMP_DIRECTORY_NAME);
  const lockfilePath: string = join(tempDirectoryPath, UNITY_LOCKFILE_NAME);
  if (!existsSync(lockfilePath)) {
    return;
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
}

function killProcess(pid: number): void {
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process already exited
  }
}

async function killRunningUnity(projectPath: string): Promise<void> {
  const processInfo = await findRunningUnityProcess(projectPath);
  if (!processInfo) {
    console.log("No running Unity process found for this project.");
    return;
  }

  const pid = processInfo.pid;
  console.log(`Killing Unity (PID: ${pid})...`);
  killProcess(pid);
  console.log("Unity killed.");
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
  const hasVersion: boolean = existsSync(versionFile);
  if (!hasVersion) {
    return false;
  }
  const libraryDir: string = join(candidateDir, "Library");
  return existsSync(libraryDir);
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

function findUnityProjectBfs(rootDir: string, maxDepth: number): string | undefined {
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

function launch(opts: LaunchResolvedOptions): void {
  const { projectPath, platform, unityArgs } = opts;
  const unityVersion: string = getUnityVersion(projectPath);
  const unityPath: string = getUnityPath(unityVersion);

  console.log(`Detected Unity version: ${unityVersion}`);

  if (!existsSync(unityPath)) {
    console.error(`Error: Unity ${unityVersion} not found at ${unityPath}`);
    console.error("Please install Unity through Unity Hub.");
    process.exit(1);
  }

  console.log("Opening Unity...");
  console.log(`Project Path: ${projectPath}`);

  const args: string[] = ["-projectPath", projectPath];

  const unityArgsContainBuildTarget: boolean = hasBuildTargetArg(unityArgs);
  if (platform && platform.length > 0 && !unityArgsContainBuildTarget) {
    args.push("-buildTarget", platform);
  }

  if (unityArgs.length > 0) {
    args.push(...unityArgs);
  }

  const child = spawn(unityPath, args, { stdio: "ignore", detached: true });
  child.unref();
}

async function main(): Promise<void> {
  const options: LaunchOptions = parseArgs(process.argv);

  let resolvedProjectPath: string | undefined = options.projectPath;
  if (!resolvedProjectPath) {
    const searchRoot = process.cwd();
    const depthInfo = options.searchMaxDepth === -1 ? "unlimited" : String(options.searchMaxDepth);
    console.log(`No PROJECT_PATH provided. Searching under ${searchRoot} (max-depth: ${depthInfo})...`);
    const found = findUnityProjectBfs(searchRoot, options.searchMaxDepth);
    if (!found) {
      console.error(`Error: Unity project not found under ${searchRoot}.`);
      process.exit(1);
      return;
    }
    console.log(`Selected project: ${found}`);
    resolvedProjectPath = found;
  }

  ensureProjectPath(resolvedProjectPath);

  if (options.restart) {
    await killRunningUnity(resolvedProjectPath);
  } else {
    const runningProcess = await findRunningUnityProcess(resolvedProjectPath);
    if (runningProcess) {
      console.log(
        `Unity process already running for project: ${resolvedProjectPath} (PID: ${runningProcess.pid})`,
      );
      await focusUnityProcess(runningProcess.pid);
      process.exit(0);
      return;
    }
  }

  await handleStaleLockfile(resolvedProjectPath);
  const resolved: LaunchResolvedOptions = {
    projectPath: resolvedProjectPath,
    platform: options.platform,
    unityArgs: options.unityArgs,
  };
  launch(resolved);
  // Best-effort update of Unity Hub's lastModified timestamp.
  try {
    await updateLastModifiedIfExists(resolvedProjectPath, new Date());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to update Unity Hub lastModified: ${message}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});


