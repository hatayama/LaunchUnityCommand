/**
 * launch-unity library entry point.
 * Exports core functions for programmatic usage.
 * Uses lib.ts which has no CLI side effects.
 */

export {
  // Types
  LaunchOptions,
  LaunchResolvedOptions,
  UnityProcessInfo,
  // Functions
  parseArgs,
  findUnityProjectBfs,
  getUnityVersion,
  launch,
  findRunningUnityProcess,
  focusUnityProcess,
  killRunningUnity,
  quitRunningUnity,
  handleStaleLockfile,
  ensureProjectEntryAndUpdate,
  updateLastModifiedIfExists,
  getProjectCliArgs,
  parseCliArgs,
  groupCliArgs,
} from './lib.js';
