import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export type TrafficVersion = { version_id: string; percentage: number };

/** cf returns the latest active deployment first. Preserve its entire traffic split. */
export function parseDeploymentState(payload: unknown): TrafficVersion[] {
  const deployments = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "deployments" in payload
      ? payload.deployments
      : undefined;
  if (!Array.isArray(deployments)) throw new Error("Expected a cf deployments JSON response");
  if (deployments.length === 0) return [];
  const versions = deployments[0]?.versions;
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error("Latest deployment has no traffic versions");
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const result = versions.map(version => {
    if (!version || typeof version.version_id !== "string" || !uuid.test(version.version_id)
      || typeof version.percentage !== "number" || !Number.isFinite(version.percentage)
      || version.percentage <= 0 || version.percentage > 100) {
      throw new Error("Invalid version ID or traffic percentage");
    }
    return { version_id: version.version_id, percentage: version.percentage };
  });
  if (Math.abs(result.reduce((total, version) => total + version.percentage, 0) - 100) > 1e-6) {
    throw new Error("Traffic percentages must total 100");
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error("usage: deployment-state.ts <cf-deployments.json>");
    const payload = JSON.parse(await readFile(process.argv[2], "utf8"));
    console.log(JSON.stringify(parseDeploymentState(payload)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
