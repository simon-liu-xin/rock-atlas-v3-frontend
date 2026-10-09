import type { CandidateViewModelV1 } from "../generated/schema-types.ts";

export type ReadyCandidateViewModel = Exclude<CandidateViewModelV1, { relations: [] }>;
