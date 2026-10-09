import type { ExperimentSample } from "../viewmodel/candidate-model.ts";

export type ExperimentFault =
  | "hash"
  | "schema"
  | "partition"
  | "stale"
  | "offline-cold"
  | "empty";

const experimentFaults = new Set<ExperimentFault>([
  "hash",
  "schema",
  "partition",
  "stale",
  "offline-cold",
  "empty",
]);

export function parseExperimentFault(value: string | null): ExperimentFault | null {
  return value && experimentFaults.has(value as ExperimentFault) ? (value as ExperimentFault) : null;
}

interface ExperimentManifest {
  schema_version: string;
  pipeline_version: string;
  snapshot_id: string;
  payload_sha256: string;
  counts: {
    styles: number;
    artists: number;
    release_groups: number;
    recordings: number;
    relations: number;
    evidence: number;
    paths: number;
  };
  required_partitions: Array<{
    partition_id: string;
    license: string;
    status: string;
  }>;
}

type ReadinessErrorCode =
  | "MW_PACK_HASH_MISMATCH"
  | "MW_PACK_SCHEMA_UNSUPPORTED"
  | "MW_PACK_INCOMPLETE"
  | "MW_APP_PACK_STALE"
  | "MW_SNAPSHOT_NOT_CACHED"
  | "MW_PACK_EMPTY";

export type ExperimentReadinessResult =
  | { status: "ready"; sample: ExperimentSample }
  | {
      status: "failed" | "incompatible" | "empty";
      error_code: ReadinessErrorCode;
    };

const supportedSchemaMajor = "1";
const supportedPipeline = "experiment-fixture-1";

export async function verifyExperimentFixture(
  sampleText: string,
  manifestInput: unknown,
  fault?: ExperimentFault | null,
): Promise<ExperimentReadinessResult> {
  const manifest = manifestInput as ExperimentManifest;
  if (fault === "offline-cold") return failed("MW_SNAPSHOT_NOT_CACHED");
  if (fault === "schema" || manifest.schema_version.split(".")[0] !== supportedSchemaMajor) {
    return incompatible("MW_PACK_SCHEMA_UNSUPPORTED");
  }
  if (fault === "stale" || manifest.pipeline_version !== supportedPipeline) {
    return incompatible("MW_APP_PACK_STALE");
  }

  let sample: ExperimentSample;
  try {
    sample = JSON.parse(sampleText) as ExperimentSample;
  } catch {
    return failed("MW_PACK_INCOMPLETE");
  }
  if (fault === "empty") return { status: "empty", error_code: "MW_PACK_EMPTY" };

  const expectedHash = fault === "hash" ? "sha256:injected-mismatch" : manifest.payload_sha256;
  if ((await sha256(sampleText)) !== expectedHash) return failed("MW_PACK_HASH_MISMATCH");
  if (sample.snapshot_id !== manifest.snapshot_id || !countsMatch(sample, manifest)) {
    return failed("MW_PACK_INCOMPLETE");
  }
  const samplePartitions = new Map(
    sample.required_partitions.map((partition) => [partition.partition_id, partition]),
  );
  const partitionsReady =
    fault !== "partition" &&
    manifest.required_partitions.length > 0 &&
    manifest.required_partitions.every((partition) => {
      const samplePartition = samplePartitions.get(partition.partition_id);
      return (
        partition.status === "ready" &&
        samplePartition?.status === "ready" &&
        samplePartition.license === partition.license
      );
    });
  if (!partitionsReady) return failed("MW_PACK_INCOMPLETE");

  return { status: "ready", sample };
}

function countsMatch(sample: ExperimentSample, manifest: ExperimentManifest): boolean {
  return (
    sample.styles.length === manifest.counts.styles &&
    sample.artists.length === manifest.counts.artists &&
    sample.release_groups.length === manifest.counts.release_groups &&
    sample.recordings.length === manifest.counts.recordings &&
    sample.relations.length === manifest.counts.relations &&
    sample.evidence.length === manifest.counts.evidence &&
    sample.paths.length === manifest.counts.paths
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function failed(errorCode: ReadinessErrorCode): ExperimentReadinessResult {
  return { status: "failed", error_code: errorCode };
}

function incompatible(errorCode: ReadinessErrorCode): ExperimentReadinessResult {
  return { status: "incompatible", error_code: errorCode };
}
