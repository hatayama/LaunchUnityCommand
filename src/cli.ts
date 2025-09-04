#!/usr/bin/env node
/*
  launch-unity: Open a Unity project with the matching Editor version.
  Platforms: macOS, Windows
*/

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, createReadStream, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import readline from "node:readline";

type LaunchOptions = {
  projectPath: string;
  platform?: string | undefined;
  unityArgs: string[];
};

function parseArgs(argv: string[]): LaunchOptions {
  const defaultProjectPath = process.cwd();
  const args: string[] = argv.slice(2);

  const doubleDashIndex = args.indexOf("--");
  const cliArgs: string[] = doubleDashIndex >= 0 ? args.slice(0, doubleDashIndex) : args;
  const unityArgs: string[] = doubleDashIndex >= 0 ? args.slice(doubleDashIndex + 1) : [];

  const positionals: string[] = [];

  for (const arg of cliArgs) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("-")) {
      // Unknown flags are ignored to keep CLI permissive
      continue;
    } else {
      positionals.push(arg);
    }
  }

  const projectPath: string = positionals[0] ? resolve(positionals[0]) : defaultProjectPath;
  const platform: string | undefined = positionals[1] ? String(positionals[1]) : undefined;
  const options: LaunchOptions = { projectPath, platform, unityArgs };
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
  -h, --help    Show this help message
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
    if (!base) return;
    candidates.push(join(base, "Unity", "Hub", "Editor", version, "Editor", "Unity.exe"));
  };

  addCandidate(programFiles);
  addCandidate(programFilesX86);
  addCandidate(localAppData);
  candidates.push(join("C:\\", "Program Files", "Unity", "Hub", "Editor", version, "Editor", "Unity.exe"));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
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

function createPromptInterface(): { rl: readline.Interface; close: () => void } | null {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const rl: readline.Interface = readline.createInterface({ input: process.stdin, output: process.stdout });
    const close = (): void => rl.close();
    return { rl, close };
  }

  try {
    if (process.platform === "win32") {
      const inCandidates: string[] = ["\\\\.\\CONIN$", "CONIN$"];
      const outCandidates: string[] = ["\\\\.\\CONOUT$", "CONOUT$"];
      for (const inPath of inCandidates) {
        for (const outPath of outCandidates) {
          try {
            const input = createReadStream(inPath);
            const output = createWriteStream(outPath);
            const rl: readline.Interface = readline.createInterface({ input, output });
            const close = (): void => {
              rl.close();
              input.destroy();
              output.end();
            };
            return { rl, close };
          } catch {
            continue;
          }
        }
      }
    } else {
      const input = createReadStream("/dev/tty");
      const output = createWriteStream("/dev/tty");
      const rl: readline.Interface = readline.createInterface({ input, output });
      const close = (): void => {
        rl.close();
        input.destroy();
        output.end();
      };
      return { rl, close };
    }
  } catch {
    // fallthrough
  }
  return null;
}

async function handleUnityLockfilePrompt(lockfilePath: string): Promise<boolean> {
  // Prefer single-key confirmation when a real TTY is available
  if (process.stdin.isTTY && process.stdout.isTTY && typeof (process.stdin as unknown as { setRawMode?: (mode: boolean) => void }).setRawMode === "function") {
    const confirmedByKey = await promptYesNoSingleKey("Delete UnityLockfile and continue? Type 'y' to continue; anything else aborts: ");
    if (!confirmedByKey) {
      console.log("Aborted by user.");
      return false;
    }
    rmSync(lockfilePath, { force: true });
    console.log("Deleted UnityLockfile. Continuing launch.");
    return true;
  }

  // Fallback to line-based prompt through OS console handles
  const prompt = createPromptInterface();
  if (!prompt) {
    console.error("UnityLockfile exists. No interactive console available for confirmation.");
    return false;
  }

  const confirmed: boolean = await new Promise<boolean>((resolve) => {
    prompt.rl.question("Delete UnityLockfile and continue? Type 'y' to continue; anything else aborts: ", (answer: string) => {
      resolve(answer.trim() === "y");
    });
  });
  prompt.close();

  if (!confirmed) {
    console.log("Aborted by user.");
    return false;
  }

  rmSync(lockfilePath, { force: true });
  console.log("Deleted UnityLockfile. Continuing launch.");
  return true;
}

function stdinSupportsRawMode(): boolean {
  const stdin = process.stdin as unknown as { isTTY?: boolean; setRawMode?: (mode: boolean) => void };
  return Boolean(stdin && stdin.isTTY && typeof stdin.setRawMode === "function" && process.stdout.isTTY);
}

async function promptYesNoSingleKey(message: string): Promise<boolean> {
  if (!stdinSupportsRawMode()) return false;

  const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void };

  return await new Promise<boolean>((resolve) => {
    const handleData = (data: Buffer): void => {
      const firstByte: number = data[0] ?? 0;
      const char: string = data.toString();

      let result = false;
      if (char === "y") {
        result = true;
      } else if (firstByte === 3 /* Ctrl+C */ || firstByte === 27 /* ESC */ || char === "n" || char === "N" || firstByte === 13 /* Enter */) {
        result = false;
      } else {
        result = false;
      }

      process.stdout.write("\n");
      cleanup();
      resolve(result);
    };

    const cleanup = (): void => {
      if (typeof stdin.setRawMode === "function") stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", handleData);
    };

    process.stdout.write(message);
    if (typeof stdin.setRawMode === "function") stdin.setRawMode(true);
    stdin.resume();
    stdin.once("data", handleData);
  });
}

async function checkUnityRunning(projectPath: string): Promise<boolean> {
  const lockfile: string = join(projectPath, "Temp", "UnityLockfile");
  if (!existsSync(lockfile)) return true;

  console.log(`UnityLockfile found: ${lockfile}`);
  console.log("Another Unity process may be using this project.");

  return await handleUnityLockfilePrompt(lockfile);
}

function hasBuildTargetArg(unityArgs: string[]): boolean {
  for (const arg of unityArgs) {
    if (arg === "-buildTarget") return true;
    if (arg.startsWith("-buildTarget=")) return true;
  }
  return false;
}

function launch(opts: LaunchOptions): void {
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
  ensureProjectPath(options.projectPath);
  const ok: boolean = await checkUnityRunning(options.projectPath);
  if (!ok) {
    process.exit(0);
    return;
  }
  launch(options);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

