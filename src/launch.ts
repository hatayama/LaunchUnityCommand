#!/usr/bin/env node
/*
  launch-unity: Open a Unity project with the matching Editor version.
  Platforms: macOS, Windows
*/

import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { ensureProjectEntryAndUpdate, updateLastModifiedIfExists, getProjectCliArgs, groupCliArgs } from "./unityHub.js";

export type LaunchOptions = {
  subcommand?: "update";
  projectPath?: string;
  platform?: string | undefined;
  unityArgs: string[];
  searchMaxDepth: number; // -1 for unlimited; default 3
  restart: boolean;
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
const PROJECT_PATH_PATTERN = /-(?:projectPath|projectpath)(?:=|\s+)("[^"]+"|'[^']+'|[^\s"']+)/i;
const PROCESS_LIST_COMMAND_MAC = "ps";
const PROCESS_LIST_ARGS_MAC = ["-axo", "pid=,command=", "-ww"];
const WINDOWS_POWERSHELL = "powershell";
const UNITY_LOCKFILE_NAME = "UnityLockfile";
const TEMP_DIRECTORY_NAME = "Temp";

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const npmExecutableName = (): string => {
  return process.platform === "win32" ? "npm.cmd" : "npm";
};

const runCommand = async (command: string, args: string[]): Promise<CommandResult> => {
  return await new Promise<CommandResult>((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error: Error) => {
      resolve({ exitCode: 127, stdout, stderr: `${stderr}${error.message}\n` });
    });
    child.on("close", (code: number | null) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
};

type SemverTriplet = {
  major: number;
  minor: number;
  patch: number;
  prereleaseIdentifiers?: (number | string)[];
};

const parseSemverTriplet = (value: string): SemverTriplet | undefined => {
  const normalized = value.trim();
  const withoutBuild = normalized.split("+")[0] ?? normalized;
  const match = withoutBuild.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    return undefined;
  }
  const major = Number.parseInt(match[1] ?? "", 10);
  const minor = Number.parseInt(match[2] ?? "", 10);
  const patch = Number.parseInt(match[3] ?? "", 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return undefined;
  }

  const prereleaseRaw: string | undefined = match[4] ?? undefined;
  if (!prereleaseRaw) {
    return { major, minor, patch };
  }

  const prereleaseIdentifiers: (number | string)[] = prereleaseRaw
    .split(".")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const numeric = part.match(/^\d+$/);
      if (numeric) {
        const value = Number.parseInt(part, 10);
        if (Number.isFinite(value)) {
          return value;
        }
      }
      return part;
    });

  if (prereleaseIdentifiers.length === 0) {
    return { major, minor, patch };
  }

  return { major, minor, patch, prereleaseIdentifiers };
};

const compareSemverTriplet = (left: SemverTriplet, right: SemverTriplet): number => {
  if (left.major !== right.major) {
    return left.major < right.major ? -1 : 1;
  }
  if (left.minor !== right.minor) {
    return left.minor < right.minor ? -1 : 1;
  }
  if (left.patch !== right.patch) {
    return left.patch < right.patch ? -1 : 1;
  }

  const leftPre = left.prereleaseIdentifiers;
  const rightPre = right.prereleaseIdentifiers;

  if (!leftPre && !rightPre) {
    return 0;
  }
  if (!leftPre && rightPre) {
    return 1;
  }
  if (leftPre && !rightPre) {
    return -1;
  }

  const leftIdentifiers = leftPre ?? [];
  const rightIdentifiers = rightPre ?? [];
  const length = Math.max(leftIdentifiers.length, rightIdentifiers.length);

  for (let i = 0; i < length; i++) {
    const leftId = leftIdentifiers[i];
    const rightId = rightIdentifiers[i];
    if (leftId === undefined && rightId === undefined) {
      return 0;
    }
    if (leftId === undefined) {
      return -1;
    }
    if (rightId === undefined) {
      return 1;
    }
    if (leftId === rightId) {
      continue;
    }

    const leftIsNumber = typeof leftId === "number";
    const rightIsNumber = typeof rightId === "number";
    if (leftIsNumber && rightIsNumber) {
      return leftId < rightId ? -1 : 1;
    }
    if (leftIsNumber !== rightIsNumber) {
      return leftIsNumber ? -1 : 1;
    }

    const leftText = String(leftId);
    const rightText = String(rightId);
    return leftText < rightText ? -1 : 1;
  }

  return 0;
};

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
  let addUnityHub = false;
  let favoriteUnityHub = false;
  let platform: string | undefined;

  for (let i = 0; i < cliArgs.length; i++) {
    const arg = cliArgs[i] ?? "";
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--version" || arg === "-v") {
      console.log(getVersion());
      process.exit(0);
    }
    if (arg === "-r" || arg === "--restart") {
      restart = true;
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

function getVersion(): string {
  const currentFilePath: string = fileURLToPath(import.meta.url);
  const currentDir: string = dirname(currentFilePath);
  const packageJsonPath: string = join(currentDir, "..", "package.json");
  const packageJson: { version: string } = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return packageJson.version;
}

function printHelp(): void {
  const help = `
Usage:
  launch-unity [OPTIONS] [PROJECT_PATH] [-- UNITY_ARGS...]
  launch-unity update

Open a Unity project with the matching Unity Editor version installed by Unity Hub.

Arguments:
  PROJECT_PATH  Optional. If omitted, searches under the current directory (see --max-depth)

Forwarding:
  Everything after -- is forwarded to Unity unchanged.
  If UNITY_ARGS includes -buildTarget, the -p option is ignored.

Options:
  -h, --help          Show this help message
  -v, --version       Show version number
  -r, --restart       Kill running Unity and restart
  -p, --platform <P>  Passed to Unity as -buildTarget (e.g., StandaloneOSX, Android, iOS)
  --max-depth <N>     Search depth when PROJECT_PATH is omitted (default 3, -1 unlimited)
  -u, -a, --unity-hub-entry, --add-unity-hub
                      Add to Unity Hub if missing and update lastModified (does not launch Unity)
  -f, --favorite      Add to Unity Hub as favorite (does not launch Unity)

Commands:
  update              Update launch-unity to the latest version (npm global install)
`;
  process.stdout.write(help);
}

export function getUnityVersion(projectPath: string): string {
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

export async function handleStaleLockfile(projectPath: string): Promise<void> {
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
  console.log();
}

const KILL_POLL_INTERVAL_MS = 100;
const KILL_TIMEOUT_MS = 10000;

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

async function waitForProcessExit(pid: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < KILL_TIMEOUT_MS) {
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

  const exited = await waitForProcessExit(pid);
  if (!exited) {
    console.error(`Error: Failed to kill Unity (PID: ${pid}) within ${KILL_TIMEOUT_MS / 1000}s.`);
    process.exit(1);
  }

  console.log("Unity killed.");
  console.log();
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
    console.error(`Error: Unity ${unityVersion} not found at ${unityPath}`);
    console.error("Please install Unity through Unity Hub.");
    process.exit(1);
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

  const child = spawn(unityPath, args, { stdio: "ignore", detached: true });
  child.unref();
}

async function main(): Promise<void> {
  const options: LaunchOptions = parseArgs(process.argv);

  if (options.subcommand === "update") {
    await runSelfUpdate();
    return;
  }

  let resolvedProjectPath: string | undefined = options.projectPath;
  if (!resolvedProjectPath) {
    const searchRoot = process.cwd();
    const depthInfo = options.searchMaxDepth === -1 ? "unlimited" : String(options.searchMaxDepth);
    console.log(`Searching for Unity project under ${searchRoot} (max-depth: ${depthInfo})...`);
    const found = findUnityProjectBfs(searchRoot, options.searchMaxDepth);
    if (!found) {
      console.error(`Error: Unity project not found under ${searchRoot}.`);
      process.exit(1);
      return;
    }
    console.log();
    resolvedProjectPath = found;
  }

  ensureProjectPath(resolvedProjectPath);
  const unityVersion = getUnityVersion(resolvedProjectPath);

  // Unity Hub only mode: -a or -f flags skip launching Unity
  const unityHubOnlyMode = options.addUnityHub || options.favoriteUnityHub;
  if (unityHubOnlyMode) {
    console.log(`Detected Unity version: ${unityVersion}`);
    console.log(`Project Path: ${resolvedProjectPath}`);
    const now = new Date();
    try {
      await ensureProjectEntryAndUpdate(resolvedProjectPath, unityVersion, now, options.favoriteUnityHub);
      console.log("Unity Hub entry updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to update Unity Hub: ${message}`);
    }
    return;
  }

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
    unityVersion,
  };
  await launch(resolved);
  // Best-effort update of Unity Hub's lastModified timestamp.
  const now = new Date();
  try {
    await updateLastModifiedIfExists(resolvedProjectPath, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to update Unity Hub lastModified: ${message}`);
  }
}

async function runSelfUpdate(): Promise<void> {
  const currentVersion: string = getVersion();
  const npmCmd: string = npmExecutableName();

  const latestResult = await runCommand(npmCmd, ["view", "launch-unity", "version"]);
  if (latestResult.exitCode !== 0) {
    console.error("Error: Failed to retrieve latest version from npm.");
    if (latestResult.stderr.trim().length > 0) {
      process.stderr.write(latestResult.stderr);
    }
    process.exit(1);
    return;
  }

  const latestVersion: string = latestResult.stdout.trim();
  if (latestVersion.length === 0) {
    console.error("Error: npm returned an empty version.");
    process.exit(1);
    return;
  }

  console.log(`Current: ${currentVersion}`);
  console.log(`Latest:  ${latestVersion}`);

  const currentSemver = parseSemverTriplet(currentVersion);
  const latestSemver = parseSemverTriplet(latestVersion);

  if (currentSemver && latestSemver) {
    const cmp = compareSemverTriplet(currentSemver, latestSemver);
    if (cmp >= 0) {
      console.log("Already up to date.");
      return;
    }
  } else {
    if (currentVersion === latestVersion) {
      console.log("Already up to date.");
      return;
    }
  }

  const installArgs: string[] = ["install", "-g", `launch-unity@${latestVersion}`, "--ignore-scripts"];
  console.log(`Running: ${npmCmd} ${installArgs.join(" ")}`);
  const installResult = await runCommand(npmCmd, installArgs);
  if (installResult.exitCode === 0) {
    console.log("Update complete.");
    return;
  }

  console.error(`Error: Update failed (exit code ${installResult.exitCode}).`);
  if (installResult.stderr.trim().length > 0) {
    process.stderr.write(installResult.stderr);
  }

  if (process.platform === "darwin") {
    const sudoSuggestion = `sudo ${npmCmd} ${installArgs.join(" ")}`;
    console.error("If this is a permissions issue, try:");
    console.error(`  ${sudoSuggestion}`);
  }

  process.exit(1);
}

// Only run main() when this file is executed directly (not when imported as a library)
let isDirectExecution = false;
if (typeof process.argv[1] === "string") {
  try {
    isDirectExecution =
      import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    isDirectExecution = false;
  }
}
if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}


