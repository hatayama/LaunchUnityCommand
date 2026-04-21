import assert from "node:assert/strict";
import test from "node:test";

import { shouldWaitForUnityStartup } from "../dist/lib.js";

test("should wait for Unity startup only after a new launch", () => {
  assert.equal(shouldWaitForUnityStartup("launched"), true);
  assert.equal(shouldWaitForUnityStartup("killed-and-launched"), true);
  assert.equal(shouldWaitForUnityStartup("focused"), false);
  assert.equal(shouldWaitForUnityStartup("quit"), false);
  assert.equal(shouldWaitForUnityStartup("hub-updated"), false);
});
