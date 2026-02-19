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
launch-unity [OPTIONS] [PROJECT_PATH] [-- UNITY_ARGS...]
launch-unity update

# Arguments
#   PROJECT_PATH       Unity project directory (searches up to 3 levels deep if omitted)

# Options
#   -h, --help         Show help
#   -r, --restart      Kill running Unity and restart
#   -d, --delete-recovery  Delete Assets/_Recovery before launch
#   -p, --platform <P> Passed to Unity as -buildTarget (e.g., StandaloneOSX, Android, iOS)
#   -a, -u, --add-unity-hub, --unity-hub-entry
#                      Register to Unity Hub (does not launch Unity)
#   -f, --favorite     Register to Unity Hub as favorite (does not launch Unity)

# Examples
npx launch-unity                       # Search for project and open
npx launch-unity /path/to/Proj         # Open specific project
npx launch-unity -p Android            # Specify build target
npx launch-unity /path -p Android      # Specify path and build target
npx launch-unity -r                    # Restart Unity
npx launch-unity -a                    # Register to Unity Hub only (does not launch Unity)
npx launch-unity -f                    # Register as favorite (does not launch Unity)
npx launch-unity . -- -batchmode -quit -nographics -logFile -  # Pass Unity args
npx launch-unity /path -p Android -- -executeMethod My.Build.Entry

# Self update (for npm global install)
launch-unity update

# If you have a project directory named "update", specify it explicitly
launch-unity ./update
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
