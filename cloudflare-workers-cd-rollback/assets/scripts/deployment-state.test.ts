import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDeploymentState } from "./deployment-state.ts";

const oldVersion = "00000000-0000-4000-8000-000000000001";
const newVersion = "00000000-0000-4000-8000-000000000002";

test("captures the latest cf deployment and preserves a gradual traffic split", () => {
  const versions = [
    { version_id: newVersion, percentage: 25 },
    { version_id: oldVersion, percentage: 75 },
  ];
  assert.deepEqual(parseDeploymentState({ deployments: [
    { versions },
    { versions: [{ version_id: oldVersion, percentage: 100 }] },
  ] }), versions);
});

test("accepts JSON array output and identifies the first deployment", () => {
  assert.deepEqual(parseDeploymentState([]), []);
  assert.deepEqual(parseDeploymentState({ deployments: [] }), []);
  const versions = [{ version_id: oldVersion, percentage: 100 }];
  assert.deepEqual(parseDeploymentState([{ versions }]), versions);
});

test("rejects API errors, malformed versions, and incomplete traffic allocations", () => {
  for (const payload of [
    { errors: [{ code: 10000 }] },
    { deployments: [{}] },
    { deployments: [{ versions: [] }] },
    [{ versions: [{ version_id: oldVersion, percentage: 50 }] }],
    [{ versions: [{ version_id: "invalid", percentage: 100 }] }],
    [{ versions: [{ version_id: oldVersion, percentage: "100" }] }],
    [{ versions: [{ version_id: oldVersion, percentage: 0 }, { version_id: newVersion, percentage: 100 }] }],
  ]) assert.throws(() => parseDeploymentState(payload));
});
