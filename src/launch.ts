#!/usr/bin/env node
/*
  launch-unity: Open a Unity project with the matching Editor version.
  Platforms: macOS, Windows
*/

import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { orchestrateLaunch, LaunchOptions, OrchestrateResult } from "./lib.js";

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

function parseArgs(argv: string[]): LaunchOptions {
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
  let deleteRecovery = false;
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
    if (arg === "-d" || arg === "--delete-recovery") {
      deleteRecovery = true;
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
    deleteRecovery,
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
  -d, --delete-recovery  Delete Assets/_Recovery before launch
  -q, --quit          Quit running Unity gracefully (force-kill on timeout)
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

async function main(): Promise<void> {
  const options: LaunchOptions = parseArgs(process.argv);

  if (options.subcommand === "update") {
    await runSelfUpdate();
    return;
  }

  const result: OrchestrateResult = await orchestrateLaunch({
    projectPath: options.projectPath,
    searchRoot: process.cwd(),
    searchMaxDepth: options.searchMaxDepth,
    platform: options.platform,
    unityArgs: options.unityArgs,
    restart: options.restart,
    quit: options.quit,
    deleteRecovery: options.deleteRecovery,
    addUnityHub: options.addUnityHub,
    favoriteUnityHub: options.favoriteUnityHub,
  });

  if (result.action === "focused") {
    process.exit(0);
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
