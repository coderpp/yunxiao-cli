import type { YunxiaoClient } from "./client.js";
import type { Flags } from "./arguments.js";
import { confirmed, record, records } from "./mr.js";
import { CliError } from "./errors.js";
export async function runExtendedPipeline(
  command: string,
  p: string[],
  f: Flags,
  c: YunxiaoClient,
): Promise<unknown> {
  const [, , pipelineId, runId, jobId] = p;
  if (command === "logs") return c.getPipelineJobLog(pipelineId, runId, jobId);
  if (command === "jobs") {
    const run = record(await c.getPipelineRun(pipelineId, runId));
    return records(run.stages ?? []).flatMap((stage) => {
      const info = record(stage.stageInfo ?? stage);
      return records(info.jobs ?? []).map((job) => ({
        ...job,
        stageId: stage.id,
        stageName: stage.name ?? info.name,
      }));
    });
  }
  if (command === "start") {
    confirmed(f);
    let params: Record<string, unknown> | undefined;
    if (f.params !== undefined) {
      try {
        params = record(JSON.parse(String(f.params)));
      } catch {
        throw new CliError(
          "INVALID_ARGUMENT",
          "--params must be a JSON object.",
        );
      }
    }
    return {
      pipelineId,
      pipelineRunId: await c.startPipeline(pipelineId, params),
    };
  }
  if (command === "cancel") {
    confirmed(f);
    const accepted = await c.cancelPipeline(pipelineId, runId);
    try {
      return {
        pipelineId,
        pipelineRunId: runId,
        accepted,
        run: await c.getPipelineRun(pipelineId, runId),
      };
    } catch {
      throw new CliError(
        "PARTIAL_OPERATION",
        "Cancel accepted, but reading the final state failed.",
        7,
        { pipelineId, pipelineRunId: runId, accepted },
      );
    }
  }
  throw new CliError(
    "INVALID_ARGUMENT",
    `Unknown pipeline command: ${command}`,
  );
}
