import { YunxiaoClient } from "./client.js";
import { CliError } from "./errors.js";
import type { Flags } from "./arguments.js";
export function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new CliError("INVALID_RESPONSE", "Expected API object.", 1);
  return v as Record<string, unknown>;
}
export function records(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v))
    throw new CliError("INVALID_RESPONSE", "Expected API array.", 1);
  return v.map(record);
}
export function required(f: Flags, key: string): string {
  if (typeof f[key] !== "string" || !String(f[key]).trim())
    throw new CliError("INVALID_ARGUMENT", `--${key} is required.`);
  return String(f[key]);
}
export function confirmed(f: Flags): void {
  if (f.yes !== true)
    throw new CliError(
      "CONFIRMATION_REQUIRED",
      "This command changes state. Re-run with --yes after reviewing the operation.",
      2,
    );
}
export function latestPatch(
  patches: Record<string, unknown>[],
  type: string,
): Record<string, unknown> {
  const list = patches
    .filter((p) => p.relatedMergeItemType === type)
    .sort((a, b) => Number(b.versionNo) - Number(a.versionNo));
  if (!list.length)
    throw new CliError(
      "PATCH_NOT_FOUND",
      `No ${type} patch found; specify patch IDs.`,
      5,
    );
  return list[0];
}
export async function patchPair(
  client: YunxiaoClient,
  repo: string,
  id: number,
  f: Flags,
) {
  const patches = records(await client.listChangeRequestPatchSets(repo, id));
  function select(key: string, type: string) {
    const p =
      f[key] === undefined
        ? latestPatch(patches, type)
        : patches.find((p) => p.patchSetBizId === f[key]);
    if (
      !p ||
      typeof p.patchSetBizId !== "string" ||
      typeof p.commitId !== "string"
    )
      throw new CliError("PATCH_NOT_FOUND", `Invalid ${key} for this MR.`, 5);
    return p;
  }
  return {
    from: select("from-patch-set-id", "MERGE_TARGET"),
    to: select("to-patch-set-id", "MERGE_SOURCE"),
  };
}
export async function mrDiff(
  client: YunxiaoClient,
  repo: string,
  id: number,
  f: Flags,
): Promise<unknown> {
  const pair = await patchPair(client, repo, id, f);
  const tree = record(
    await client.getChangeRequestTree(repo, id, {
      fromPatchSetId: String(pair.from.patchSetBizId),
      toPatchSetId: String(pair.to.patchSetBizId),
    }),
  );
  const items = records(tree.changedTreeItems);
  const comparison = record(
    await client.compare(
      repo,
      String(pair.from.commitId),
      String(pair.to.commitId),
      pair.from.relatedMergeItemType === "MERGE_SOURCE",
    ),
  );
  const diffs = records(comparison.diffs);
  const files: Array<Record<string, unknown> & { complete: boolean }> =
    items.map((item) => {
      const d = diffs.find(
        (d) => d.newPath === item.newPath && d.oldPath === item.oldPath,
      );
      const text = typeof d?.diff === "string" ? d.diff : "";
      let inHunk = false,
        added = 0,
        deleted = 0;
      for (const line of text.split("\n")) {
        if (line.startsWith("@@ ")) {
          inHunk = true;
          continue;
        }
        if (inHunk && line.startsWith("+")) added++;
        if (inHunk && line.startsWith("-")) deleted++;
      }
      const binary = item.isBinary === true || d?.isBinary === true;
      const matches =
        d &&
        (!item.newObjectId || item.newObjectId === d.newId) &&
        (!item.oldObjectId || item.oldObjectId === d.oldId);
      const complete =
        !binary &&
        !!matches &&
        d?.truncated !== true &&
        d?.tooLarge !== true &&
        Number(item.addLines) === added &&
        Number(item.delLines) === deleted;
      return {
        ...item,
        diff: text,
        complete,
        reason: binary
          ? "binary"
          : complete
            ? undefined
            : "missing, truncated, or inconsistent comparison",
      };
    });
  if (
    f.file &&
    !files.some((x) => x.newPath === f.file || x.oldPath === f.file)
  )
    throw new CliError("FILE_NOT_FOUND", "File is not in this MR diff.", 4);
  const selected = f.file
    ? files.filter((x) => x.newPath === f.file || x.oldPath === f.file)
    : files;
  return {
    fromPatchSetId: pair.from.patchSetBizId,
    toPatchSetId: pair.to.patchSetBizId,
    fromCommit: pair.from.commitId,
    toCommit: pair.to.commitId,
    complete:
      Number(tree.count) === items.length && selected.every((f) => f.complete),
    files: selected,
  };
}
export async function runExtendedMr(
  command: string,
  p: string[],
  f: Flags,
  c: YunxiaoClient,
): Promise<unknown> {
  const repo = p[2];
  const id = Number(p[3]);
  if (command === "create") {
    confirmed(f);
    const source = required(f, "source"),
      target = required(f, "target"),
      title = required(f, "title");
    const targetRepo = record(await c.getRepository(repo));
    const sourceRepo = f["source-project-id"]
      ? record(await c.getRepository(String(f["source-project-id"])))
      : targetRepo;
    if (targetRepo.id === undefined || sourceRepo.id === undefined)
      throw new CliError("INVALID_RESPONSE", "Repository ID missing.", 1);
    return c.createChangeRequest(repo, {
      sourceBranch: source,
      targetBranch: target,
      title,
      description: f.description as string | undefined,
      sourceProjectId: String(sourceRepo.id),
      targetProjectId: String(targetRepo.id),
      reviewerUserIds: f.reviewers
        ? String(f.reviewers).split(",").filter(Boolean)
        : undefined,
    });
  }
  if (!Number.isSafeInteger(id) || id < 1)
    throw new CliError("INVALID_ARGUMENT", "MR ID must be a positive integer.");
  if (command === "get") return c.getChangeRequest(repo, id);
  if (command === "diff") return mrDiff(c, repo, id, f);
  if (command === "comments")
    return c.listChangeRequestComments(repo, id, {
      file_path: f.file,
      comment_type: f["comment-type"],
      resolved: f.resolved,
      patchset_biz_id_list: f["patch-set-ids"]
        ? String(f["patch-set-ids"]).split(",")
        : undefined,
    });
  if (command === "update") {
    confirmed(f);
    const body = { title: f.title, description: f.description };
    if (body.title === undefined && body.description === undefined)
      throw new CliError(
        "INVALID_ARGUMENT",
        "Provide --title or --description.",
      );
    return c.updateChangeRequest(repo, id, body);
  }
  if (command === "close") {
    confirmed(f);
    return c.closeChangeRequest(repo, id);
  }
  if (command === "comment") {
    confirmed(f);
    const content = required(f, "content");
    if (content.length > 65535)
      throw new CliError(
        "INVALID_ARGUMENT",
        "Comment exceeds 65535 characters.",
      );
    const inline = f.file !== undefined;
    if (
      !inline &&
      ["line", "side", "from-patch-set-id"].some((k) => f[k] !== undefined)
    )
      throw new CliError(
        "INVALID_ARGUMENT",
        "Line comment options require --file.",
      );
    const body: Record<string, unknown> = {
      comment_type: inline ? "INLINE_COMMENT" : "GLOBAL_COMMENT",
      content,
      draft: false,
      resolved: false,
      parent_comment_biz_id: f["parent-id"],
    };
    if (inline) {
      required(f, "line");
      required(f, "side");
      required(f, "to-patch-set-id");
      const pair = await patchPair(c, repo, id, f);
      const tree = record(
        await c.getChangeRequestTree(repo, id, {
          fromPatchSetId: String(pair.from.patchSetBizId),
          toPatchSetId: String(pair.to.patchSetBizId),
        }),
      );
      if (
        !records(tree.changedTreeItems).some(
          (item) => item[f.side === "old" ? "oldPath" : "newPath"] === f.file,
        )
      )
        throw new CliError(
          "FILE_NOT_FOUND",
          "File is not present on the selected side of the MR diff.",
          4,
        );
      Object.assign(body, {
        file_path: f.file,
        line_number: Number(f.line),
        from_patchset_biz_id: pair.from.patchSetBizId,
        to_patchset_biz_id: pair.to.patchSetBizId,
        patchset_biz_id:
          f.side === "old" ? pair.from.patchSetBizId : pair.to.patchSetBizId,
      });
    } else {
      const patches = records(await c.listChangeRequestPatchSets(repo, id));
      const patch = f["to-patch-set-id"]
        ? patches.find((p) => p.patchSetBizId === f["to-patch-set-id"])
        : latestPatch(patches, "MERGE_SOURCE");
      if (!patch?.patchSetBizId)
        throw new CliError("PATCH_NOT_FOUND", "Comment patch not found.", 5);
      body.patchset_biz_id = patch.patchSetBizId;
    }
    return c.createChangeRequestComment(repo, id, body);
  }
  throw new CliError("INVALID_ARGUMENT", `Unknown MR command: ${command}`);
}
