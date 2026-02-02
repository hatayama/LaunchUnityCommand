# Changelog

## [1.0.0](https://github.com/hatayama/LaunchUnityCommand/compare/launch-unity-v0.12.0...launch-unity-v1.0.0) (2026-02-02)


### ⚠ BREAKING CHANGES

* launch() function is now async and returns Promise<void>

### Features

* support Unity Hub custom CLI arguments ([#77](https://github.com/hatayama/LaunchUnityCommand/issues/77)) ([6e32fe0](https://github.com/hatayama/LaunchUnityCommand/commit/6e32fe07af8b3ab552ff14e51f6e447e1a52874f))

## [0.12.0](https://github.com/hatayama/LaunchUnityCommand/compare/launch-unity-v0.11.0...launch-unity-v0.12.0) (2026-01-27)


### Features

* add library exports for programmatic usage ([#73](https://github.com/hatayama/LaunchUnityCommand/issues/73)) ([6a2538f](https://github.com/hatayama/LaunchUnityCommand/commit/6a2538f324ca09b001a43d472417948befc98f90))

## [0.11.0](https://github.com/hatayama/LaunchUnityCommand/compare/launch-unity-v0.10.1...launch-unity-v0.11.0) (2026-01-18)


### Features

* add -p, --platform option for build target specification ([#65](https://github.com/hatayama/LaunchUnityCommand/issues/65)) ([bcbaa20](https://github.com/hatayama/LaunchUnityCommand/commit/bcbaa20cdfa2e55e08f9231d6f734aa980941751))


### Bug Fixes

* **deps:** sync @typescript-eslint/eslint-plugin to 8.52.0 ([#63](https://github.com/hatayama/LaunchUnityCommand/issues/63)) ([3bb6499](https://github.com/hatayama/LaunchUnityCommand/commit/3bb64993be341fa64e41e3740588c6f5cd541be4))

## [0.10.1](https://github.com/hatayama/LaunchUnityCommand/compare/launch-unity-v0.10.0...launch-unity-v0.10.1) (2025-12-20)


### Bug Fixes

* restore version to 0.10.0 after release-please misconfiguration ([#49](https://github.com/hatayama/LaunchUnityCommand/issues/49)) ([3089b18](https://github.com/hatayama/LaunchUnityCommand/commit/3089b18067667525085600baf94453e12af5bb1a))

## [0.6.2](https://github.com/hatayama/LaunchUnityCommand/compare/launch-unity-v0.10.0...launch-unity-v0.6.2) (2025-12-18)


### Features

* add -a and -f flags for Unity Hub registration without launching Unity ([#32](https://github.com/hatayama/LaunchUnityCommand/issues/32)) ([75b4922](https://github.com/hatayama/LaunchUnityCommand/commit/75b4922a3e103e393c466633911322a19690c0df))
* add -r/--restart option to kill and restart Unity ([#25](https://github.com/hatayama/LaunchUnityCommand/issues/25)) ([499820b](https://github.com/hatayama/LaunchUnityCommand/commit/499820b22d82e4c38601377cd182cea109a669a8))
* add -v/--version option to display version number ([#35](https://github.com/hatayama/LaunchUnityCommand/issues/35)) ([8a0be4c](https://github.com/hatayama/LaunchUnityCommand/commit/8a0be4c4856114a32bf9c12a05f81287c30b82d5))
* add launch-unity update (self-update) ([#37](https://github.com/hatayama/LaunchUnityCommand/issues/37)) ([b4ecca1](https://github.com/hatayama/LaunchUnityCommand/commit/b4ecca1c8e97d9bc643bcda15d361bf8329ebea6))
* Add supply chain attack prevention measures ([#10](https://github.com/hatayama/LaunchUnityCommand/issues/10)) ([44597b1](https://github.com/hatayama/LaunchUnityCommand/commit/44597b16bbd9fe7512cea059cbbb0447cacc60c8))
* **cli:** add quit-unity and rename main CLI to launch ([b7f2b9d](https://github.com/hatayama/LaunchUnityCommand/commit/b7f2b9d4f5f0c61bdd42001daea82d944ec003e1))
* **launch:** add auxiliary process detection for Unity on macOS and Windows ([#8](https://github.com/hatayama/LaunchUnityCommand/issues/8)) ([41c1b55](https://github.com/hatayama/LaunchUnityCommand/commit/41c1b550b5dcc7aa2ddbee99ef94d58214b5b852))
* update launch ([#4](https://github.com/hatayama/LaunchUnityCommand/issues/4)) ([cc591be](https://github.com/hatayama/LaunchUnityCommand/commit/cc591be729b2d07652377627672d25990d6728a7))
* update Unity Hub lastModified on launch (macOS/Windows) ([#6](https://github.com/hatayama/LaunchUnityCommand/issues/6)) ([ca7bbb8](https://github.com/hatayama/LaunchUnityCommand/commit/ca7bbb87c47bfedff35dda262ce8331796e23966))


### Bug Fixes

* add build step to npm publish workflow ([#21](https://github.com/hatayama/LaunchUnityCommand/issues/21)) ([bcc380f](https://github.com/hatayama/LaunchUnityCommand/commit/bcc380f92bc8facb92ff2b55f11fb66691487975))
* add js-yaml override to fix security vulnerability (GHSA-mh29-5h37-fv8m) ([#20](https://github.com/hatayama/LaunchUnityCommand/issues/20)) ([a963014](https://github.com/hatayama/LaunchUnityCommand/commit/a96301439f292e8944d1730ac7dd97fa65fd7cbb))
* force release-as 0.2.1 ([57851ff](https://github.com/hatayama/LaunchUnityCommand/commit/57851fff16a9ee8caf0f253c676328d729fd6648))
* trigger 0.2.1 release ([3376ea0](https://github.com/hatayama/LaunchUnityCommand/commit/3376ea00d04caf7a06064f137f11d38f9d3a949f))
* trigger first automated release ([f1b4af0](https://github.com/hatayama/LaunchUnityCommand/commit/f1b4af073bf6c00d04946a09a00a6e137bc465ef))
* update npm publish command to include provenance flag in workflow ([#38](https://github.com/hatayama/LaunchUnityCommand/issues/38)) ([9914fca](https://github.com/hatayama/LaunchUnityCommand/commit/9914fca2e6f84bbfc1945e4ffe4c3d376427b036))


### Miscellaneous Chores

* trigger release ([6cd982f](https://github.com/hatayama/LaunchUnityCommand/commit/6cd982f62b0344d166ddc2d12131d8454cf896a2))

## [0.10.0](https://github.com/hatayama/LaunchUnityCommand/compare/v0.9.0...v0.10.0) (2025-12-12)


### Features

* add launch-unity update (self-update) ([#37](https://github.com/hatayama/LaunchUnityCommand/issues/37)) ([b4ecca1](https://github.com/hatayama/LaunchUnityCommand/commit/b4ecca1c8e97d9bc643bcda15d361bf8329ebea6))


### Bug Fixes

* update npm publish command to include provenance flag in workflow ([#38](https://github.com/hatayama/LaunchUnityCommand/issues/38)) ([9914fca](https://github.com/hatayama/LaunchUnityCommand/commit/9914fca2e6f84bbfc1945e4ffe4c3d376427b036))

## [0.9.0](https://github.com/hatayama/LaunchUnityCommand/compare/v0.8.0...v0.9.0) (2025-12-08)


### Features

* add -v/--version option to display version number ([#35](https://github.com/hatayama/LaunchUnityCommand/issues/35)) ([8a0be4c](https://github.com/hatayama/LaunchUnityCommand/commit/8a0be4c4856114a32bf9c12a05f81287c30b82d5))

## [0.8.0](https://github.com/hatayama/LaunchUnityCommand/compare/v0.7.0...v0.8.0) (2025-12-06)


### Features

* add -a and -f flags for Unity Hub registration without launching Unity ([#32](https://github.com/hatayama/LaunchUnityCommand/issues/32)) ([75b4922](https://github.com/hatayama/LaunchUnityCommand/commit/75b4922a3e103e393c466633911322a19690c0df))

## [0.7.0](https://github.com/hatayama/LaunchUnityCommand/compare/v0.6.2...v0.7.0) (2025-12-03)


### Features

* add -r/--restart option to kill and restart Unity ([#25](https://github.com/hatayama/LaunchUnityCommand/issues/25)) ([499820b](https://github.com/hatayama/LaunchUnityCommand/commit/499820b22d82e4c38601377cd182cea109a669a8))

## [0.6.2](https://github.com/hatayama/LaunchUnityCommand/compare/v0.6.1...v0.6.2) (2025-12-02)


### Miscellaneous Chores

* trigger release ([6cd982f](https://github.com/hatayama/LaunchUnityCommand/commit/6cd982f62b0344d166ddc2d12131d8454cf896a2))

## [0.6.1](https://github.com/hatayama/LaunchUnityCommand/compare/v0.6.0...v0.6.1) (2025-12-02)


### Bug Fixes

* add build step to npm publish workflow ([#21](https://github.com/hatayama/LaunchUnityCommand/issues/21)) ([bcc380f](https://github.com/hatayama/LaunchUnityCommand/commit/bcc380f92bc8facb92ff2b55f11fb66691487975))

## [0.6.0](https://github.com/hatayama/LaunchUnityCommand/compare/v0.5.0...v0.6.0) (2025-12-02)


### Features

* Add supply chain attack prevention measures ([#10](https://github.com/hatayama/LaunchUnityCommand/issues/10)) ([44597b1](https://github.com/hatayama/LaunchUnityCommand/commit/44597b16bbd9fe7512cea059cbbb0447cacc60c8))


### Bug Fixes

* add js-yaml override to fix security vulnerability (GHSA-mh29-5h37-fv8m) ([#20](https://github.com/hatayama/LaunchUnityCommand/issues/20)) ([a963014](https://github.com/hatayama/LaunchUnityCommand/commit/a96301439f292e8944d1730ac7dd97fa65fd7cbb))

## [0.5.0](https://github.com/hatayama/LaunchUnityCommand/compare/v0.4.0...v0.5.0) (2025-11-13)


### Features

* **launch:** add auxiliary process detection for Unity on macOS and Windows ([#8](https://github.com/hatayama/LaunchUnityCommand/issues/8)) ([41c1b55](https://github.com/hatayama/LaunchUnityCommand/commit/41c1b550b5dcc7aa2ddbee99ef94d58214b5b852))

## [0.4.0](https://github.com/hatayama/LaunchUnityCommand/compare/v0.3.0...v0.4.0) (2025-11-11)


### Features

* update Unity Hub lastModified on launch (macOS/Windows) ([#6](https://github.com/hatayama/LaunchUnityCommand/issues/6)) ([ca7bbb8](https://github.com/hatayama/LaunchUnityCommand/commit/ca7bbb87c47bfedff35dda262ce8331796e23966))

## [0.3.0](https://github.com/hatayama/LaunchUnityCommand/compare/v0.2.1...v0.3.0) (2025-10-28)


### Features

* update launch ([#4](https://github.com/hatayama/LaunchUnityCommand/issues/4)) ([cc591be](https://github.com/hatayama/LaunchUnityCommand/commit/cc591be729b2d07652377627672d25990d6728a7))

## 0.2.1 (2025-10-28)


### Features

* **cli:** add quit-unity and rename main CLI to launch ([b7f2b9d](https://github.com/hatayama/LaunchUnityCommand/commit/b7f2b9d4f5f0c61bdd42001daea82d944ec003e1))


### Bug Fixes

* force release-as 0.2.1 ([57851ff](https://github.com/hatayama/LaunchUnityCommand/commit/57851fff16a9ee8caf0f253c676328d729fd6648))
* trigger 0.2.1 release ([3376ea0](https://github.com/hatayama/LaunchUnityCommand/commit/3376ea00d04caf7a06064f137f11d38f9d3a949f))
* trigger first automated release ([f1b4af0](https://github.com/hatayama/LaunchUnityCommand/commit/f1b4af073bf6c00d04946a09a00a6e137bc465ef))
