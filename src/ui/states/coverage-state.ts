import type {
  CandidateViewModelV1,
  CoverageStateDescriptorV1,
} from "../../generated/schema-types.ts";

export type CoverageState = CandidateViewModelV1["answer"]["coverage_state"];

export const coverageStatePresentations = {
  ready: {
    coverage_state: "ready",
    label_zh: "证据就绪",
    label_en: "Evidence ready",
    explanation_zh: "当前答案的必需来源和许可分区均已就绪。",
    explanation_en: "Required evidence and license partitions are ready for this answer.",
    tone: "success",
    can_explore: true,
    recovery_action: "none",
  },
  partial: {
    coverage_state: "partial",
    label_zh: "部分覆盖",
    label_en: "Partial coverage",
    explanation_zh: "已有可核验内容，但部分比较轴仍是编辑候选或缺少来源。",
    explanation_en: "Some claims are verifiable while other axes remain editorial or lack sources.",
    tone: "notice",
    can_explore: true,
    recovery_action: "open_evidence",
  },
  not_in_snapshot: {
    coverage_state: "not_in_snapshot",
    label_zh: "不在当前快照",
    label_en: "Not in snapshot",
    explanation_zh: "该对象不在当前可复现快照中，界面不会临时补造记录。",
    explanation_en: "This object is absent from the reproducible snapshot and is not synthesized.",
    tone: "neutral",
    can_explore: false,
    recovery_action: "load_snapshot",
  },
  not_reviewed: {
    coverage_state: "not_reviewed",
    label_zh: "尚未审阅",
    label_en: "Not reviewed",
    explanation_zh: "对象已经识别，但尚未编入有证据的编辑路径。",
    explanation_en: "The object is identified but has not entered an evidence-reviewed path.",
    tone: "neutral",
    can_explore: false,
    recovery_action: "review_source",
  },
  source_conflict: {
    coverage_state: "source_conflict",
    label_zh: "来源冲突",
    label_en: "Source conflict",
    explanation_zh: "来源对同一命题给出不同结论；异议被保留并可逐条核验。",
    explanation_en: "Sources disagree on this claim; each position remains available for review.",
    tone: "warning",
    can_explore: true,
    recovery_action: "open_evidence",
  },
  partition_loading: {
    coverage_state: "partition_loading",
    label_zh: "数据加载中",
    label_en: "Partition loading",
    explanation_zh: "当前答案依赖的数据分区正在校验，完成前不显示候选结果。",
    explanation_en: "A required partition is being verified; candidate results remain hidden.",
    tone: "loading",
    can_explore: false,
    recovery_action: "none",
  },
  partition_failed: {
    coverage_state: "partition_failed",
    label_zh: "数据分区失败",
    label_en: "Partition failed",
    explanation_zh: "必需分区未通过完整性或兼容性校验，需要重试。",
    explanation_en: "A required partition failed integrity or compatibility checks and must retry.",
    tone: "error",
    can_explore: false,
    recovery_action: "retry_partition",
  },
  extension_not_installed: {
    coverage_state: "extension_not_installed",
    label_zh: "扩展未安装",
    label_en: "Extension not installed",
    explanation_zh: "该关系依赖独立许可扩展；核心数据不会伪造替代结果。",
    explanation_en: "This relation requires a separately licensed extension; core data stays unchanged.",
    tone: "neutral",
    can_explore: false,
    recovery_action: "install_extension",
  },
} as const satisfies Record<CoverageState, CoverageStateDescriptorV1>;

export function getCoveragePresentation(state: CoverageState): CoverageStateDescriptorV1 {
  return coverageStatePresentations[state];
}
