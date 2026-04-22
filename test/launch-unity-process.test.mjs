/* eslint-disable @typescript-eslint/explicit-function-return-type -- node:test fixtures in .mjs cannot use TypeScript-style return annotations. */

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { launchUnityProcess } from "../dist/launchUnityProcess.js";

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.unrefCallCount = 0;
  }

  unref() {
    this.unrefCallCount += 1;
  }
}

test("launchUnityProcess runs onSpawned only after the child process spawns", async () => {
  const child = new FakeChildProcess();
  const notifications = [];

  const spawnProcess = (unityPath, args, options) => {
    assert.equal(unityPath, "/Applications/Unity");
    assert.deepEqual(args, ["-projectPath", "/tmp/project"]);
    assert.equal(options.env.MSYS_NO_PATHCONV, "1");
    queueMicrotask(() => {
      child.emit("spawn");
    });
    return child;
  };

  await launchUnityProcess(
    spawnProcess,
    "/Applications/Unity",
    ["-projectPath", "/tmp/project"],
    () => {
      notifications.push("waiting");
    },
  );

  assert.deepEqual(notifications, ["waiting"]);
  assert.equal(child.unrefCallCount, 1);
});

test("launchUnityProcess does not run onSpawned when the child process errors immediately", async () => {
  const child = new FakeChildProcess();
  const notifications = [];

  const spawnProcess = () => {
    queueMicrotask(() => {
      child.emit("error", new Error("EACCES"));
    });
    return child;
  };

  await assert.rejects(
    launchUnityProcess(spawnProcess, "/Applications/Unity", ["-projectPath", "/tmp/project"], () => {
      notifications.push("waiting");
    }),
    /Failed to launch Unity: EACCES/,
  );

  assert.deepEqual(notifications, []);
  assert.equal(child.unrefCallCount, 0);
});
