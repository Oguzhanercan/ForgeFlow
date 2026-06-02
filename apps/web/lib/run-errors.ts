import type { Run } from "@forgeflow/contracts";

import type { RunProgressState } from "./live-session";

export type RunFailure = {
  runId: string;
  title: string;
  summary: string;
  details: string;
};

export function normalizeRunErrorMessage(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function buildRunFailure({
  progress,
  run,
}: {
  progress?: RunProgressState | null;
  run?: Run | null;
}): RunFailure | null {
  const runId = run?.id ?? progress?.runId;
  const status = progress?.status ?? run?.status;
  if (!runId || status !== "failed") return null;

  const details = normalizeRunErrorMessage(progress?.errorMessage ?? run?.error_message);
  const intent = run?.intent_type ?? progress?.intentType ?? "run";
  const title = `${formatIntentLabel(intent)} failed`;
  return {
    runId,
    title,
    summary: summarizeRunError(details),
    details: details || "The backend marked this run as failed but did not include an error message.",
  };
}

function summarizeRunError(details: string) {
  const oomMatch = details.match(/CUDA out of memory\.\s*Tried to allocate .*? GiB\./i);
  if (oomMatch) return oomMatch[0];

  const tracebackLines = details.split("\n").map((line) => line.trim()).filter(Boolean);
  const exceptionLine = tracebackLines.find((line) => /^[\w.]+Error:/.test(line));
  if (exceptionLine) return exceptionLine;

  return tracebackLines[0]?.slice(0, 180) || "Run failed.";
}

function formatIntentLabel(value: string) {
  const label = value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return label === "Single Object Image" ? "Image generation" : label;
}
