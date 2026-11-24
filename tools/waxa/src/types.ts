/** Shapes of eval.yaml, tasks, grader results and self-reports. */
// ---- Types ---------------------------------------------------------------

export interface Metric {
  name: string;
  weight: number;
  threshold: number;
  description?: string;
}

export type GraderType = "text" | "code" | "self-report" | "llm";

export interface Grader {
  name: string;
  type: GraderType;
  config: Record<string, unknown>;
}

export interface EvalConfig {
  name: string;
  description?: string;
  skill: string;
  version?: string;
  config?: {
    trials_per_task?: number;  // default 1; N>1 mitigates LLM non-determinism
    timeout_seconds?: number;
    model?: string;
    parallel?: boolean;
    workers?: number;
  };
  metrics?: Metric[];
  graders?: Grader[];
  tasks: string[];
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  inputs: { prompt: string; context?: unknown };
  expected?: { output_contains?: string[]; require_self_report?: boolean };
  graders?: Grader[];
}

export interface GraderResult {
  name: string;
  pass: boolean;
  score: number;
  message?: string;
  durationMs: number;
}

export interface PhaseEntry {
  phase: string;
  status: "OK" | "stuck" | "skipped" | "missing";
  reason?: string;
}

export interface UnclearPoint {
  issue: string;
  cause: string;
  rule: string;
}

export interface SelfReport {
  phaseTrace: PhaseEntry[];
  unclearPoints: UnclearPoint[];
  discretionaryFillIns: string[];
  retries: number;
  raw: string;
}

export interface TaskTrial {
  trial: number;
  output: string;
  selfReport: SelfReport | null;
  graders: GraderResult[];
  passRate: number;
  durationMs: number;
}

export interface TaskResult {
  taskId: string;
  taskName: string;
  trials: TaskTrial[];
  // Aggregates across trials. With trials_per_task=1 these mirror the
  // single trial; with N>1 they are means/totals.
  passRate: number;
  durationMs: number;
}
