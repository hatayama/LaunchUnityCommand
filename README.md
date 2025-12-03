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

## Usage
```bash
# Syntax
launch-unity [OPTIONS] [PROJECT_PATH] [PLATFORM] [-- UNITY_ARGS...]

# Arguments
#   PROJECT_PATH    Unity project directory (searches up to 3 levels deep if omitted)
#   PLATFORM        Passed to Unity as -buildTarget (e.g., StandaloneOSX, Android, iOS)

# Options
#   -h, --help      Show help
#   -r, --restart   Kill running Unity and restart

# Examples
npx launch-unity                   # Search for project and open
npx launch-unity /path/to/Proj     # Open specific project
npx launch-unity /path Android     # Specify build target
npx launch-unity -r                # Restart Unity
npx launch-unity . -- -batchmode -quit -nographics -logFile -  # Pass Unity args
npx launch-unity /path Android -- -executeMethod My.Build.Entry
```

A TypeScript CLI for macOS and Windows that reads the required Unity Editor version from
`ProjectSettings/ProjectVersion.txt`, launches the matching Unity installed via Unity Hub,
and opens the project.

Default Unity paths assumed:
- macOS: `/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity`
- Windows (searched):
  - `%PROGRAMFILES%/Unity/Hub/Editor/<version>/Editor/Unity.exe`
  - `%PROGRAMFILES(X86)%/Unity/Hub/Editor/<version>/Editor/Unity.exe`
  - `%LOCALAPPDATA%/Unity/Hub/Editor/<version>/Editor/Unity.exe`
  - `C:\\Program Files\\Unity\\Hub\\Editor\\<version>\\Editor\\Unity.exe`


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
