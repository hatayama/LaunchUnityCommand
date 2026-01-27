# LaunchUnityCommand

## Architecture

This package has two entry points:

### Library Entry Point (`src/index.ts` -> `src/lib.ts`)

- Used when importing as a library: `import { launch } from 'launch-unity'`
- Configured via `exports` field in `package.json`
- **No `process.exit()` calls** - throws errors instead for proper library behavior
- All exported functions are side-effect free

### CLI Entry Point (`src/launch.ts`)

- Used when running as CLI: `npx launch-unity` or `launch-unity`
- Configured via `bin` field in `package.json`
- **Uses `process.exit()`** - appropriate for CLI behavior
- Has a direct execution guard to prevent side effects when imported

## Why Two Files?

`lib.ts` and `launch.ts` exist separately because:

1. **Library consumers** need functions that throw errors (not exit the process)
2. **CLI users** expect `--help` and `--version` to exit with code 0
3. Separating them ensures no side effects when bundled with tools like esbuild
