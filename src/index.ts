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
  OrchestrateOptions,
  OrchestrateResult,
  // Functions
  parseArgs,
  findUnityProjectBfs,
  getUnityVersion,
  launch,
  orchestrateLaunch,
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
