import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import MarkdownIt from "markdown-it";
import { YunxiaoClient, type Fetcher } from "./client.js";

type RecordData = Record<string, unknown>;
type Image = { fileId: string; path: string; source: string };
export type ContentOptions = { dir: string; downloadAttachments?: boolean; fetcher?: Fetcher };
export function parseWorkitemUrl(link: string): { projectId: string; workitemId: string } {
  const u = new URL(link);
  const parts = u.pathname.replace(/\/$/, "").split("/");
  if (u.protocol !== "https:" || u.host !== "devops.aliyun.com" || u.username || u.password ||
      parts.length !== 6 || parts[1] !== "projex" || parts[2] !== "project" || !parts[3] || !parts[4] || !parts[5]) {
    throw new Error("Expected a Yunxiao workitem URL: https://devops.aliyun.com/projex/project/<projectId>/<type>/<workitemId>");
  }
  return { projectId: parts[3], workitemId: parts[5] };
}
function record(value: unknown): RecordData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected workitem API response.");
  return value as RecordData;
}
function records(value: unknown): RecordData[] {
  if (!Array.isArray(value)) throw new Error("Expected an API array.");
  return value.map(record);
}
function str(value: unknown): string { return typeof value === "string" ? value : ""; }
function markup(content: unknown, format: unknown): string {
  const text = str(content);
  if (format === "MARKDOWN") return new MarkdownIt({ html: true }).render(text);
  if (text.trimStart().startsWith("{")) {
    const rich = record(JSON.parse(text));
    if (typeof rich.htmlValue !== "string") throw new Error("Rich text is missing htmlValue.");
    return rich.htmlValue;
  }
  return text;
}
function imageExtension(head: Buffer): string {
  if (head.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ".png";
  if (head[0] === 255 && head[1] === 216 && head[2] === 255) return ".jpg";
  if (/^GIF8[79]a/.test(head.toString("ascii", 0, 6))) return ".gif";
  if (head.toString("ascii",0,4) === "RIFF" && head.toString("ascii",8,12) === "WEBP") return ".webp";
  if (head.toString("ascii",0,2) === "BM") return ".bmp";
  if (head.subarray(0,4).equals(Buffer.from([0,0,1,0]))) return ".ico";
  throw new Error("Download is not a supported image (PNG/JPEG/GIF/WebP/BMP/ICO).");
}
async function download(url: string, target: string, image: boolean, fetcher: Fetcher): Promise<string> {
  let response: Response;
  try { response = await fetcher(url, { signal: AbortSignal.timeout(120000) }); }
  catch { throw new Error("File download failed (network error or timeout)."); }
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`File download failed: HTTP ${response.status}.`);
  }
  const reader = response.body.getReader();
  let file: Awaited<ReturnType<typeof open>> | undefined;
  let destination = target;
  let complete = false;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    while (size < 16) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(Buffer.from(chunk.value)); size += chunk.value.length;
    }
    const head = Buffer.concat(chunks);
    if (image) destination += imageExtension(head);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    file = await open(destination, "wx", 0o600);
    await file.writeFile(head);
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      await file.writeFile(chunk.value);
    }
    await file.close();
    complete = true;
    return destination;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`File already exists; choose a new directory: ${destination}`);
    // Do not leak signed storage URLs from fetch errors.
    throw new Error(`Unable to save file ${destination}: download or filesystem error.`);
  } finally {
    await reader.cancel().catch(() => undefined);
    if (file && !complete) { await file.close(); await rm(destination, { force: true }); }
  }
}
async function localize(client: YunxiaoClient, id: string, content: unknown, format: unknown, source: string,
  dir: string, cache: Map<string,string>, images: Image[], fetcher: Fetcher): Promise<string> {
  const tree = parseFragment(markup(content, format));
  async function visit(node: DefaultTreeAdapterMap["node"]): Promise<void> {
    if ("tagName" in node && node.tagName === "img") {
      const src = node.attrs.find(a => a.name === "src");
      const fileId = src && new URL(src.value, "https://devops.aliyun.com").searchParams.get("fileIdentifier");
      if (!src || !fileId) throw new Error(`${source}: only Yunxiao images with fileIdentifier are supported.`);
      let local = cache.get(fileId);
      if (!local) {
        const file = record(await client.getWorkitemFile(id, fileId));
        if (!str(file.url)) throw new Error(`Missing download URL for image ${fileId}.`);
        local = await download(str(file.url), path.resolve(dir, String(cache.size+1).padStart(2,"0")), true, fetcher);
        cache.set(fileId,local);
      }
      src.value = local;
      if (!images.some(i => i.fileId === fileId && i.source === source)) images.push({ fileId, path: local, source });
    }
    if ("childNodes" in node) for (const child of node.childNodes) await visit(child);
  }
  await visit(tree);
  return serialize(tree);
}
async function attachments(client: YunxiaoClient, id: string, options: ContentOptions): Promise<RecordData[]> {
  const files = records(await client.listWorkitemAttachments(id));
  for (const [index,file] of files.entries()) {
    const url = str(file.url);
    delete file.url;
    if (!options.downloadAttachments) continue;
    if (!url) throw new Error(`Missing download URL for attachment ${index+1}.`);
    let name = path.posix.basename(str(file.fileName).replaceAll("\\", "/"));
    if (!name || name === "." || name === "..") name = "attachment";
    file.path = await download(url, path.resolve(options.dir, `${String(index+1).padStart(2,"0")}-${name}`), false, options.fetcher ?? fetch);
  }
  return files;
}
export async function downloadWorkitemAttachments(client: YunxiaoClient, id: string, options: ContentOptions): Promise<RecordData[]> {
  return attachments(client, id, { ...options, downloadAttachments: true });
}
export async function readWorkitemContent(client: YunxiaoClient, link: string, options: ContentOptions) {
  const { projectId, workitemId: id } = parseWorkitemUrl(link);
  const workitem = record(await client.getWorkitem(id));
  if (workitem.id !== id || record(workitem.space).id !== projectId) throw new Error("Workitem/project does not match the link.");
  const comments = records(await client.listWorkitemComments(id));
  const images: Image[] = [];
  const cache = new Map<string,string>();
  const dir = path.join(options.dir,"images");
  const fetcher = options.fetcher ?? fetch;
  const descriptionHtml = await localize(client,id,workitem.description,workitem.formatType,"description",dir,cache,images,fetcher);
  for (const c of comments) c.contentHtml = await localize(client,id,c.content,c.contentFormat,`comment:${c.id}`,dir,cache,images,fetcher);
  return { url: link, workitem, descriptionHtml, comments, images,
    attachments: await attachments(client,id,{ ...options, dir:path.join(options.dir,"attachments") }) };
}
export async function downloadWorkitemImages(client: YunxiaoClient, id: string, options: ContentOptions): Promise<Image[]> {
  const workitem = record(await client.getWorkitem(id));
  const comments = records(await client.listWorkitemComments(id));
  const images: Image[] = []; const cache = new Map<string,string>(); const fetcher = options.fetcher ?? fetch;
  await localize(client,id,workitem.description,workitem.formatType,"description",options.dir,cache,images,fetcher);
  for (const c of comments) await localize(client,id,c.content,c.contentFormat,`comment:${c.id}`,options.dir,cache,images,fetcher);
  return images;
}
