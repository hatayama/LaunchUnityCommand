launch-unity
=================

[English](README.md) | [日本語](README.ja.md)

Without Unity Hub, launch Unity from the command line.

## Installation

```bash
# Global install
npm install -g launch-unity

# Use via npx (no install required)
npx launch-unity
```

## Usage Examples
```bash
# NPX (recommended, zero install)
npx launch-unity                   # Open the current directory (if PLATFORM is omitted, uses the project's current build target)
npx launch-unity /path/to/Proj     # Open a specific project
npx launch-unity /path Android     # Specify build target
npx -y launch-unity                # Skip npx "Ok to proceed?" prompt

# Pass through Unity CLI args with --
npx launch-unity . -- -batchmode -quit -nographics -logFile -
npx launch-unity /path Android -- -executeMethod My.Build.Entry

# Installed globally
launch-unity
launch-unity /path/to/MyUnityProject Android
launch-unity . -- -buildTarget iOS -projectPath . # You can override

# Quit the Unity instance holding a project open
quit-unity                 # Quit Unity for current directory project
quit-unity /path/to/Proj   # Quit Unity for a specific project
quit-unity . --timeout 20000 --force
```

A TypeScript CLI for macOS and Windows that reads the required Unity Editor version from
`ProjectSettings/ProjectVersion.txt`, launches the matching Unity installed via Unity Hub,
and opens the project. If `Temp/UnityLockfile` exists, it asks in the terminal whether to
delete it before continuing.

Default Unity paths assumed:
- macOS: `/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity`
- Windows (searched):
  - `%PROGRAMFILES%/Unity/Hub/Editor/<version>/Editor/Unity.exe`
  - `%PROGRAMFILES(X86)%/Unity/Hub/Editor/<version>/Editor/Unity.exe`
  - `%LOCALAPPDATA%/Unity/Hub/Editor/<version>/Editor/Unity.exe`
  - `C:\\Program Files\\Unity\\Hub\\Editor\\<version>\\Editor\\Unity.exe`


## Detailed Usage
```bash
# Basic syntax
launch-unity [PROJECT_PATH] [PLATFORM]

# Arguments
# - PROJECT_PATH (optional): Unity project directory. Defaults to current directory
# - PLATFORM     (optional): Passed to Unity as -buildTarget (e.g., StandaloneOSX, Android, iOS)

# Flags
# -h, --help  Show help

# Quit syntax
quit-unity [PROJECT_PATH] [--timeout <ms>] [--force]

# Flags (quit-unity)
# -t, --timeout <ms>  Time to wait for graceful quit (default: 15000)
# -f, --force         Force kill if not exited within timeout
# -h, --help          Show help
```


## Troubleshooting
- Error: `ProjectVersion.txt not found`
  - The provided directory is not a Unity project. Point to the project root.
- Error: `Unity <version> not found`
  - Install the required version via Unity Hub, or adjust Unity path resolution.


## Platform Notes
- macOS, Windows: Supported via Unity Hub default install paths.
- Linux: Not supported yet. Contributions are welcome.


## Security

This project implements supply chain attack prevention measures:

- **ignore-scripts**: Disables automatic script execution during `npm install`
- **Dependabot**: Automated weekly security updates
- **Security audit CI**: Runs `npm audit` and `lockfile-lint` on every PR
- **Pinned versions**: All dependencies use exact versions (no `^` or `~`)

## License
- MIT. See `LICENSE` for details.
