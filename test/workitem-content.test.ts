import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { YunxiaoClient, type Fetcher } from "../src/client.js";
import { readWorkitemContent, parseWorkitemUrl, downloadWorkitemImages } from "../src/workitem-content.js";
import { runCli } from "../src/cli.js";
const link = "https://devops.aliyun.com/projex/project/project/req/wi";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG3sAAAAASUVORK5CYII=", "base64");
function fixture() {
  let attachmentDownloads = 0;
  const fetcher: Fetcher = async (url, init) => {
    const u = new URL(String(url));
    if (u.host === "storage.test") {
      assert.equal(new Headers(init?.headers).get("x-yunxiao-token"), null);
      if (u.pathname === "/attachment") { attachmentDownloads++; return new Response("document"); }
      return new Response(png);
    }
    assert.equal(new Headers(init?.headers).get("x-yunxiao-token"), "test");
    let value: unknown;
    if (u.pathname.endsWith("/comments")) value = [
      { id:"c1",parentId:"parent",contentFormat:"MARKDOWN",content:"Comment ![image](/file?fileIdentifier=comment)" },
      { id:"c2",contentFormat:"RICHTEXT",content:JSON.stringify({htmlValue:'<img src="/file?fileIdentifier=body">'}) }
    ];
    else if (u.pathname.endsWith("/attachments")) value = [{ fileId:"a",fileName:"../../template.docx",size:8,url:"https://storage.test/attachment?secret=private" }];
    else if (u.pathname.includes("/files/")) value = {url:"https://storage.test/image?secret=private"};
    else value = {id:"wi",space:{id:"project"},customFieldValues:["kept"],description:JSON.stringify({htmlValue:'<p>Body</p><img src="/file?x=1&amp;fileIdentifier=body">'})};
    return new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});
  };
  const client = new YunxiaoClient({token:"test",organizationId:"org",fetcher});
  return {client,fetcher,attachmentDownloads:()=>attachmentDownloads};
}
test("full content preserves fields and localizes rich text/Markdown images; attachment download is optional", async () => {
  const dir = await mkdtemp(path.join(tmpdir(),"yunxiao-test-"));
  const f=fixture();
  try {
    const result = await readWorkitemContent(f.client,link,{dir,fetcher:f.fetcher});
    assert.deepEqual(result.workitem.customFieldValues,["kept"]);
    assert.equal(result.comments[0].parentId,"parent");
    assert.equal(result.images.length,3);
    assert.equal(new Set(result.images.map(i=>i.path)).size,2);
    assert.ok(result.descriptionHtml.includes(result.images[0].path));
    assert.ok(String(result.comments[0].contentHtml).includes(result.images[1].path));
    for (const image of result.images) assert.deepEqual(await readFile(image.path),png);
    assert.equal(f.attachmentDownloads(),0);
    assert.equal(result.attachments[0].path,undefined);
    assert.equal(result.attachments[0].url,undefined);
    assert.deepEqual(await readdir(dir),["images"]);
    const withFiles = await readWorkitemContent(f.client,link,{dir:path.join(dir,"all"),fetcher:f.fetcher,downloadAttachments:true});
    assert.equal(f.attachmentDownloads(),1);
    assert.equal(await readFile(String(withFiles.attachments[0].path),"utf8"),"document");
    assert.equal(path.dirname(String(withFiles.attachments[0].path)),path.join(dir,"all","attachments"));
    await assert.rejects(readWorkitemContent(f.client,link,{dir,fetcher:f.fetcher}),/already exists/);
    const images=await downloadWorkitemImages(f.client,"wi",{dir:path.join(dir,"only-images"),fetcher:f.fetcher});
    assert.equal(images[1].source,"comment:c1");
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test("invalid links and out-of-scope projects fail before fetching",async()=>{
  for (const url of ["https://example.com/projex/project/p/req/id", "https://devops.aliyun.com/projex/project/p", "https://devops.aliyun.com/projex/project/p/req/.."]) assert.throws(()=>parseWorkitemUrl(url));
  let error="";
  const exit=await runCli(["workitem","content",link],{YUNXIAO_TOKEN:"test",YUNXIAO_ORGANIZATION_ID:"org",YUNXIAO_PROJECT_IDS:"other"},{stderr:s=>{error+=s;},fetcher:async()=>{throw new Error("must not fetch");}});
  assert.equal(exit,2); assert.match(error,/project scope/);
});
test("failed streams leave no partial file and do not expose signed URLs",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"yunxiao-failure-"));
  const f=fixture();
  try {
    const fetcher: Fetcher=async()=>new Response(new ReadableStream({start(c){c.enqueue(png);},pull(c){c.error(new Error("https://storage.test/?secret=private"));}}));
    await assert.rejects(readWorkitemContent(f.client,link,{dir,fetcher}),error=>{
      assert.ok(error instanceof Error);assert.doesNotMatch(error.message,/private/);return true;
    });
    assert.deepEqual(await readdir(path.join(dir,"images")),[]);
  }finally{await rm(dir,{recursive:true,force:true});}
});
