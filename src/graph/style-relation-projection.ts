import type { StyleRelationAssertionV2 } from "../generated/schema-types.ts";
import { validateStyleRelationV2 } from "../data/relations/style-relation-v2.ts";

export interface StyleRelationPoint {
  x: number;
  y: number;
  z: number;
}

export interface StyleRelationSegment {
  from_style_id: string | null;
  to_style_id: string | null;
  from: StyleRelationPoint;
  to: StyleRelationPoint;
}

export interface StyleRelationProjection {
  relation_id: string;
  assertion_ids: string[];
  evidence_ids: string[];
  relation_type: StyleRelationAssertionV2["relation_type"];
  assertion_kind: StyleRelationAssertionV2["assertion_kind"];
  visual_kind: "directed_bridge" | "fusion_bundle" | "undirected_bridge" | "verified_gap";
  source_style_ids: string[];
  target_style_ids: string[];
  peer_style_ids: string[];
  junction: StyleRelationPoint | null;
  gap_center: StyleRelationPoint | null;
  input_segments: StyleRelationSegment[];
  output_segments: StyleRelationSegment[];
  terminal_segments: StyleRelationSegment[];
}

interface ProjectionOptions {
  includeCandidates?: boolean;
}

export function projectStyleRelations(
  relations: readonly StyleRelationAssertionV2[],
  positions: Readonly<Record<string, StyleRelationPoint>>,
  options: ProjectionOptions = {},
): StyleRelationProjection[] {
  const grouped = new Map<string, StyleRelationAssertionV2[]>();
  for (const relation of relations) {
    if (!isVisibleRelation(relation, options)) continue;
    validateStyleRelationV2(relation);
    const assertions = grouped.get(relation.relation_id) ?? [];
    const existing = assertions[0];
    if (existing && relationShapeKey(existing) !== relationShapeKey(relation)) {
      throw new Error(`Style relation ${relation.relation_id} has inconsistent assertion shapes.`);
    }
    assertions.push(relation);
    grouped.set(relation.relation_id, assertions);
  }
  return [...grouped.values()].map((assertions) =>
    projectStyleRelation(assertions[0]!, assertions, positions)
  );
}

function projectStyleRelation(
  relation: StyleRelationAssertionV2,
  assertions: readonly StyleRelationAssertionV2[],
  positions: Readonly<Record<string, StyleRelationPoint>>,
): StyleRelationProjection {
  const sources = participantsByRole(relation, "source");
  const targets = participantsByRole(relation, "target");
  const peers = participantsByRole(relation, "peer");
  const base = {
    relation_id: relation.relation_id,
    assertion_ids: uniqueSorted(assertions.map((assertion) => assertion.assertion_id)),
    evidence_ids: uniqueSorted(assertions.flatMap((assertion) => assertion.evidence_ids)),
    relation_type: relation.relation_type,
    assertion_kind: strongestAssertionKind(assertions),
    source_style_ids: sources,
    target_style_ids: targets,
    peer_style_ids: peers,
  };

  if (relation.relation_type === "fusion_of") {
    const targetId = targets[0]!;
    const target = requiredPoint(positions, targetId);
    const sourcePoints = sources.map((styleId) => requiredPoint(positions, styleId));
    const junction = interpolate(centroid(sourcePoints), target, 0.58);
    return {
      ...base,
      visual_kind: "fusion_bundle",
      junction,
      gap_center: null,
      input_segments: sources.map((styleId, index) => ({
        from_style_id: styleId,
        to_style_id: null,
        from: sourcePoints[index]!,
        to: junction,
      })),
      output_segments: [{
        from_style_id: null,
        to_style_id: targetId,
        from: junction,
        to: target,
      }],
      terminal_segments: [],
    };
  }

  if (relation.relation_type === "unrelated_within_scope") {
    const leftId = peers[0]!;
    const rightId = peers[1]!;
    const left = requiredPoint(positions, leftId);
    const right = requiredPoint(positions, rightId);
    const gapCenter = interpolate(left, right, 0.5);
    return {
      ...base,
      visual_kind: "verified_gap",
      junction: null,
      gap_center: gapCenter,
      input_segments: [],
      output_segments: [],
      terminal_segments: [
        {
          from_style_id: leftId,
          to_style_id: null,
          from: left,
          to: interpolate(left, gapCenter, 0.72),
        },
        {
          from_style_id: rightId,
          to_style_id: null,
          from: right,
          to: interpolate(right, gapCenter, 0.72),
        },
      ],
    };
  }

  if (relation.direction === "undirected") {
    const leftId = peers[0]!;
    const rightId = peers[1]!;
    return {
      ...base,
      visual_kind: "undirected_bridge",
      junction: null,
      gap_center: null,
      input_segments: [],
      output_segments: [{
        from_style_id: leftId,
        to_style_id: rightId,
        from: requiredPoint(positions, leftId),
        to: requiredPoint(positions, rightId),
      }],
      terminal_segments: [],
    };
  }

  const sourceId = sources[0]!;
  const targetId = targets[0]!;
  return {
    ...base,
    visual_kind: "directed_bridge",
    junction: null,
    gap_center: null,
    input_segments: [],
    output_segments: [{
      from_style_id: sourceId,
      to_style_id: targetId,
      from: requiredPoint(positions, sourceId),
      to: requiredPoint(positions, targetId),
    }],
    terminal_segments: [],
  };
}

function relationShapeKey(relation: StyleRelationAssertionV2): string {
  return JSON.stringify({
    relation_type: relation.relation_type,
    direction: relation.direction,
    participants: [...relation.participants]
      .sort((left, right) =>
        left.role.localeCompare(right.role) ||
        left.ordinal - right.ordinal ||
        left.style_id.localeCompare(right.style_id)
      )
      .map(({ style_id, role, ordinal }) => ({ style_id, role, ordinal })),
  });
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function strongestAssertionKind(
  assertions: readonly StyleRelationAssertionV2[],
): StyleRelationAssertionV2["assertion_kind"] {
  if (assertions.some((assertion) => assertion.assertion_kind === "fact")) return "fact";
  if (assertions.some((assertion) => assertion.assertion_kind === "inferred")) return "inferred";
  return "candidate";
}

function participantsByRole(
  relation: StyleRelationAssertionV2,
  role: StyleRelationAssertionV2["participants"][number]["role"],
): string[] {
  return relation.participants
    .filter((participant) => participant.role === role)
    .sort((left, right) => left.ordinal - right.ordinal || left.style_id.localeCompare(right.style_id))
    .map((participant) => participant.style_id);
}

function isVisibleRelation(
  relation: StyleRelationAssertionV2,
  options: ProjectionOptions,
): boolean {
  if (relation.stance !== "supports" || relation.review_status === "rejected") return false;
  if (relation.assertion_kind === "candidate" || relation.review_status === "unreviewed") {
    return options.includeCandidates === true;
  }
  if (relation.relation_type === "unrelated_within_scope") {
    return relation.review_status === "accepted" && relation.assertion_kind === "fact";
  }
  return relation.review_status === "accepted";
}

function requiredPoint(
  positions: Readonly<Record<string, StyleRelationPoint>>,
  styleId: string,
): StyleRelationPoint {
  const point = positions[styleId];
  if (!point) throw new Error(`Style relation projection is missing position ${styleId}.`);
  return point;
}

function centroid(points: readonly StyleRelationPoint[]): StyleRelationPoint {
  const sum = points.reduce(
    (current, point) => ({
      x: current.x + point.x,
      y: current.y + point.y,
      z: current.z + point.z,
    }),
    { x: 0, y: 0, z: 0 },
  );
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
    z: sum.z / points.length,
  };
}

function interpolate(
  from: StyleRelationPoint,
  to: StyleRelationPoint,
  amount: number,
): StyleRelationPoint {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    z: from.z + (to.z - from.z) * amount,
  };
}
