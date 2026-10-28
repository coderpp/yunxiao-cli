import type {
  YunxiaoClient,
  ReleaseByRepositoryNameOptions,
  ReleaseResult,
  RepositorySummary,
} from "./client.js";
import { YunxiaoApiError } from "./transport.js";
import { CliError, errorInfo } from "./errors.js";
import { paginate } from "./pagination.js";
import { record, records, latestPatch } from "./mr.js";
export async function release(
  c: YunxiaoClient,
  o: ReleaseByRepositoryNameOptions,
): Promise<ReleaseResult> {
  const repositories = records(
    await paginate(
      (page, perPage) =>
        c.listRepositories({
          page,
          perPage,
          search: o.repositoryName,
          archived: false,
        }),
      { allPages: true },
    ),
  );
  const normalize = (s: unknown) =>
    String(s ?? "")
      .replace(/\s*\/\s*/g, "/")
      .toLowerCase();
  const matches = repositories.filter((r) =>
    [r.name, r.path, r.nameWithNamespace, r.pathWithNamespace].some(
      (v) => v && normalize(v) === normalize(o.repositoryName),
    ),
  );
  if (matches.length !== 1)
    throw new CliError(
      matches.length ? "AMBIGUOUS_REPOSITORY" : "NOT_FOUND",
      matches.length
        ? "Multiple repositories match; use the full namespace path."
        : `Repository not found by name: ${o.repositoryName}`,
      matches.length ? 5 : 4,
    );
  const repository = matches[0] as unknown as RepositorySummary;
  const repo = String(repository.id);
  const matching = async () =>
    records(
      await paginate(
        (page, perPage) =>
          c.listChangeRequests({
            page,
            perPage,
            projectIds: repo,
            state: "opened",
          }),
        { allPages: true },
      ),
    ).filter(
      (m) =>
        m.sourceBranch === o.sourceBranch &&
        m.targetBranch === o.targetBranch &&
        String(m.sourceProjectId) === repo &&
        String(m.targetProjectId ?? m.projectId) === repo,
    );
  let mr: Record<string, unknown> | undefined;
  let review: unknown = null;
  let merge: unknown = null;
  let stage = "lookup";
  const completed: string[] = [];
  const recovery = () => ({
    repository,
    changeRequest: mr,
    completed,
    failedStage: stage,
    localId: mr?.localId,
    url: mr?.detailUrl ?? mr?.webUrl,
    resumeArgs:
      mr && Number.isSafeInteger(Number(mr.localId)) && Number(mr.localId) > 0
        ? [
            "mr",
            "release",
            o.repositoryName,
            o.sourceBranch,
            o.targetBranch,
            "--resume",
            String(mr.localId),
            "--yes",
            ...(o.createOnly ? ["--create-only"] : []),
            ...(o.mergeType ? ["--merge-type", o.mergeType] : []),
          ]
        : undefined,
  });
  try {
    if (o.resume) {
      mr = record(await c.getChangeRequest(repo, o.resume));
      if (
        mr.sourceBranch !== o.sourceBranch ||
        mr.targetBranch !== o.targetBranch ||
        String(mr.sourceProjectId) !== repo ||
        String(mr.targetProjectId) !== repo
      )
        throw new CliError(
          "RESUME_MISMATCH",
          "MR does not match the requested repositories and branches.",
          5,
        );
      if (String(mr.status ?? mr.state).toUpperCase() === "MERGED")
        return {
          repository,
          changeRequest: mr,
          review,
          merge,
          status: "already-merged",
        };
      if (String(mr.status ?? mr.state).toUpperCase() === "CLOSED")
        throw new CliError("MR_CLOSED", "Cannot resume a closed MR.", 5);
    } else {
      const existing = await matching();
      if (existing.length) {
        mr = existing.length === 1 ? existing[0] : undefined;
        throw new CliError(
          "EXISTING_MR",
          "Matching open MR exists; explicitly select --resume <mrId>.",
          5,
          { ...recovery(), matches: existing },
        );
      }
      stage = "create";
      const user = await c.getCurrentUser();
      try {
        const created = await c.createChangeRequest(repo, {
          sourceBranch: o.sourceBranch,
          targetBranch: o.targetBranch,
          sourceProjectId: repo,
          targetProjectId: repo,
          title: o.title ?? `Release ${o.sourceBranch} into ${o.targetBranch}`,
          description: o.description,
          reviewerUserIds: [user.id],
        });
        if (
          !created ||
          typeof created !== "object" ||
          Array.isArray(created) ||
          !Number.isSafeInteger(
            Number((created as Record<string, unknown>).localId),
          ) ||
          Number((created as Record<string, unknown>).localId) < 1
        ) {
          throw new CliError(
            "WRITE_RESULT_UNKNOWN",
            "Create response did not identify the MR; verify server state before retrying.",
            7,
          );
        }
        mr = created as Record<string, unknown>;
      } catch (e) {
        // Validation errors other than this exact no-change condition must remain failures.
        if (
          e instanceof YunxiaoApiError &&
          /源分支相对目标分支没有改动，不能新建代码评审/.test(e.responseBody)
        )
          return {
            repository,
            changeRequest: null,
            review,
            merge,
            status: "skipped",
          };
        if (e instanceof CliError && e.exitCode === 7) {
          try {
            const found = await matching();
            if (found.length === 1) mr = found[0];
          } catch {}
          throw new CliError(
            "WRITE_RESULT_UNKNOWN",
            "Create result was uncertain; inspect the matching MR before resuming.",
            7,
            recovery(),
          );
        }
        throw e;
      }
      completed.push("create");
    }
    if (!Number.isSafeInteger(Number(mr.localId)) || Number(mr.localId) < 1)
      throw new CliError(
        "INVALID_RESPONSE",
        "Created MR response has no valid localId.",
        7,
      );
    const id = Number(mr.localId);
    if (o.createOnly)
      return {
        repository,
        changeRequest: mr,
        review,
        merge,
        status: "created",
      };
    stage = "review";
    const before = latestPatch(
      records(await c.listChangeRequestPatchSets(repo, id)),
      "MERGE_SOURCE",
    );
    let alreadyReviewed = false;
    if (o.resume) {
      const user = await c.getCurrentUser();
      const current = record(await c.getChangeRequest(repo, id));
      const created = Date.parse(String(before.createTime));
      alreadyReviewed =
        Number.isFinite(created) &&
        records(current.reviewers ?? []).some(
          (r) =>
            r.userId === user.id &&
            r.reviewOpinionStatus === "PASS" &&
            Date.parse(String(r.reviewTime)) >= created,
        );
    }
    if (!alreadyReviewed)
      review = await c.reviewChangeRequest(repo, id, {
        reviewComment: "Approved by yunxiao-cli release workflow",
      });
    completed.push("review");
    const after = latestPatch(
      records(await c.listChangeRequestPatchSets(repo, id)),
      "MERGE_SOURCE",
    );
    if (
      !before.patchSetBizId ||
      !before.commitId ||
      before.patchSetBizId !== after.patchSetBizId ||
      before.commitId !== after.commitId
    )
      throw new CliError(
        "VERSION_CHANGED",
        "Source version changed during review; inspect and resume.",
        5,
      );
    stage = "merge";
    try {
      merge = await c.mergeChangeRequest(repo, id, {
        mergeType: o.mergeType,
        removeSourceBranch: false,
      });
    } catch (e) {
      if (e instanceof CliError && e.exitCode === 7) {
        try {
          const current = record(await c.getChangeRequest(repo, id));
          if (
            String(current.status ?? current.state).toUpperCase() === "MERGED"
          )
            return {
              repository,
              changeRequest: current,
              review,
              merge: null,
              status: "merged",
            };
        } catch {}
      }
      throw e;
    }
    completed.push("merge");
    return { repository, changeRequest: mr, review, merge, status: "merged" };
  } catch (e) {
    if (
      e instanceof CliError &&
      ["EXISTING_MR", "RESUME_MISMATCH", "MR_CLOSED"].includes(e.code)
    )
      throw e;
    if (e instanceof CliError && e.code === "WRITE_RESULT_UNKNOWN")
      throw new CliError(e.code, e.message, 7, {
        ...recovery(),
        cause: e.details,
      });
    if (mr || completed.length)
      throw new CliError(
        "PARTIAL_OPERATION",
        errorInfo(e).message,
        7,
        recovery(),
      );
    throw e;
  }
}
