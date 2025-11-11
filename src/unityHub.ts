import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type UnityHubProjectEntry = {
  readonly title?: string | null;
  readonly path: string;
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
    const home: string = process.env.HOME ?? "";
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

    const projectKey: string | undefined = Object.keys(json.data).find(
      (key) => json.data?.[key]?.path === projectPath,
    );
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


