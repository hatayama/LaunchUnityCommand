import { readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

type UnityHubProjectEntry = {
  readonly title?: string | null;
  readonly path: string;
  readonly containingFolderPath?: string | null;
  readonly version: string;
  readonly lastModified?: number | null;
  readonly isFavorite?: boolean | null;
};

type UnityHubProjectsJson = {
  readonly schema_version?: string;
  readonly data?: Record<string, UnityHubProjectEntry>;
};

const resolveUnityHubProjectFiles = (): string[] => {
  if (process.platform === "darwin") {
    const home: string | undefined = process.env.HOME;
    if (!home) {
      return [];
    }
    const base: string = join(home, "Library", "Application Support", "UnityHub");
    return [join(base, "projects-v1.json"), join(base, "projects.json")];
  }
  if (process.platform === "win32") {
    const appData: string | undefined = process.env.APPDATA;
    if (!appData) {
      return [];
    }
    const base: string = join(appData, "UnityHub");
    return [join(base, "projects-v1.json"), join(base, "projects.json")];
  }
  return [];
};

const removeTrailingSeparators = (target: string): string => {
  let trimmed = target;
  while (trimmed.length > 1 && (trimmed.endsWith("/") || trimmed.endsWith("\\"))) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
};

const normalizePath = (target: string): string => {
  const resolvedPath = resolve(target);
  return removeTrailingSeparators(resolvedPath);
};

const resolvePathWithActualCase = (target: string): string => {
  try {
    return removeTrailingSeparators(realpathSync.native(target));
  } catch {
    return normalizePath(target);
  }
};

const toComparablePath = (value: string): string => {
  return value.replace(/\\/g, "/").toLocaleLowerCase();
};

const pathsEqual = (left: string, right: string): boolean => {
  return toComparablePath(normalizePath(left)) === toComparablePath(normalizePath(right));
};

const safeParseProjectsJson = (content: string): UnityHubProjectsJson | undefined => {
  try {
    return JSON.parse(content) as UnityHubProjectsJson;
  } catch {
    return undefined;
  }
};

const logDebug = (message: string): void => {
  if (process.env["LAUNCH_UNITY_DEBUG"] === "1") {
    console.log(`[unityHub] ${message}`);
  }
};

export const ensureProjectEntryAndUpdate = async (
  projectPath: string,
  version: string,
  when: Date,
  setFavorite = false,
): Promise<void> => {
  const canonicalProjectPath = resolvePathWithActualCase(projectPath);
  const projectTitle = basename(canonicalProjectPath);
  const containingFolderPath = dirname(canonicalProjectPath);
  const candidates: string[] = resolveUnityHubProjectFiles();
  if (candidates.length === 0) {
    logDebug("No Unity Hub project files found.");
    return;
  }

  for (const path of candidates) {
    logDebug(`Trying Unity Hub file: ${path}`);
    const content = await readFile(path, "utf8").catch(() => undefined);
    if (!content) {
      logDebug("Read failed or empty content, skipping.");
      continue;
    }

    const json = safeParseProjectsJson(content);
    if (!json) {
      logDebug("Parse failed, skipping.");
      continue;
    }

    const data: Record<string, UnityHubProjectEntry> = { ...(json.data ?? {}) };
    const existingKey: string | undefined = Object.keys(data).find((key) => {
      const entryPath = data[key]?.path;
      return entryPath ? pathsEqual(entryPath, projectPath) : false;
    });

    const targetKey = existingKey ?? canonicalProjectPath;
    const existingEntry = existingKey ? data[existingKey] : undefined;
    logDebug(
      existingKey
        ? `Found existing entry for project (key=${existingKey}). Updating lastModified.`
        : `No existing entry. Adding new entry (key=${targetKey}).`,
    );
    const updatedEntry: UnityHubProjectEntry = {
      ...existingEntry,
      path: existingEntry?.path ?? canonicalProjectPath,
      containingFolderPath: existingEntry?.containingFolderPath ?? containingFolderPath,
      version: existingEntry?.version ?? version,
      title: existingEntry?.title ?? projectTitle,
      lastModified: when.getTime(),
      isFavorite: setFavorite ? true : (existingEntry?.isFavorite ?? false),
    };

    const updatedJson: UnityHubProjectsJson = {
      ...json,
      data: {
        ...data,
        [targetKey]: updatedEntry,
      },
    };

    try {
      await writeFile(path, JSON.stringify(updatedJson, undefined, 2), "utf8");
      logDebug("Write succeeded.");
    } catch (error) {
      logDebug(`Write failed: ${error instanceof Error ? error.message : String(error)}`);
      // Ignore write errors to avoid breaking CLI flow
    }
    return;
  }
};

export const updateLastModifiedIfExists = async (
  projectPath: string,
  when: Date,
): Promise<void> => {
  const candidates: string[] = resolveUnityHubProjectFiles();
  if (candidates.length === 0) {
    return;
  }

  // Try primary then fallback only if read/parse fails
  for (const path of candidates) {
    let content: string;
    let json: UnityHubProjectsJson;
    try {
      content = await readFile(path, "utf8");
    } catch {
      // Try next candidate on read error
      continue;
    }

    try {
      json = JSON.parse(content) as UnityHubProjectsJson;
    } catch {
      // Try next candidate on parse error
      continue;
    }

    if (!json.data) {
      // If file is readable but has no data, do not attempt fallback
      return;
    }

    const projectKey: string | undefined = Object.keys(json.data).find((key) => {
      const entryPath = json.data?.[key]?.path;
      return entryPath ? pathsEqual(entryPath, projectPath) : false;
    });
    if (!projectKey) {
      // Project not registered in Hub; do nothing
      return;
    }

    const original = json.data[projectKey];
    if (!original) {
      return;
    }

    json.data[projectKey] = {
      ...original,
      lastModified: when.getTime(),
    };

    try {
      await writeFile(path, JSON.stringify(json, undefined, 2), "utf8");
    } catch {
      // Swallow write errors per requirement to not crash CLI
    }
    return;
  }
};


