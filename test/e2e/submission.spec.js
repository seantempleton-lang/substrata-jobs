import { test, expect } from "@playwright/test";
import { createDailyLog, endShift } from "../../src/domain/dailyLog.js";
import { contentHash, workContent, submissionContent } from "../../src/domain/submission.js";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const localSql = sql => execFileSync("docker", ["compose", "-f", "compose.local.yaml", "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "substrata_jobs", "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" }).trim();
const localModule = script => JSON.parse(execFileSync("docker", ["compose", "-f", "compose.local.yaml", "exec", "-T", "jobs", "node", "--input-type=module", "-e", script], { encoding: "utf8" }));
function removeTestProfile(profile, directory, path, remove) {
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) !== path.resolve(directory) || !path.basename(resolved).startsWith("jobs-step5-")) throw new Error("Unexpected browser-test cleanup path");
  remove(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
const login = async request => expect((await request.post("/api/v1/session/login", { data: { username: "localdriller", password: "TestPassword123!" } })).ok()).toBeTruthy();
const bootstrap = async request => (await (await request.get("/api/v1/bootstrap?myAssignmentsOnly=false")).json());
test.beforeAll(() => {
  localSql(`insert into public.app_auth_accounts (id,user_id,login_email,password_hash)
    select 'da626c82-9695-4c23-9f99-62db5d924fea','a44ebd89-2c88-4405-90ac-51d6e9893d01','crew.north@example.test',password_hash from public.app_auth_accounts where user_id='31eb28f2-0bf1-4cee-813c-075f0436b5e7'
    on conflict (id) do update set failed_login_count=0,locked_until=null`);
  localSql(`create table if not exists public.client_contacts(id uuid primary key,client_id uuid references public.clients(id),full_name text,job_title text,email text,is_primary boolean default false);
    insert into public.client_contacts values ('d40a4c97-a67b-4c3e-950c-14922c91694a','fbda6c09-e52d-4b51-b10c-e5cc5d55543f','Fixture Client Representative','Site supervisor','fixture.client@example.test',true) on conflict do nothing`);
});
async function syncLog(request, log, baseRevision = 0) {
  const result = await request.post("/api/v1/sync", { data: { contractVersion: "1.0", batchId: crypto.randomUUID(), deviceId: crypto.randomUUID(), mutations: [{ mutationId: crypto.randomUUID(), entityId: log.id, entityType: "daily_log", operation: "upsert", baseRevision, occurredAt: new Date().toISOString(), payload: log }] } });
  const ack = (await result.json()).acknowledgements[0]; expect(ack.status, ack.message).toBe("applied"); return ack.serverRevision;
}
function rigLog(data, division = "Geotech") {
  const assignment = data.assignments.find(a => a.job?.division === division);
  return endShift(createDailyLog({ assignment, owner: data.currentUser, startingPoint: null, startedAt: new Date(Date.now() - 8 * 3600000).toISOString(), initialActivity: { code: "PRESTART", label: "Site setup" } }), {}, new Date(Date.now() - 3600000).toISOString());
}

test("server validates submissions, captures one immutable revision and explicitly sends the chosen PDF to local capture", async ({ request, playwright }) => {
  await login(request); const data = await bootstrap(request);
  const log = rigLog(data); const baseRevision = await syncLog(request, log);
  const body = { requestId: crypto.randomUUID(), baseRevision, contentHash: await contentHash(submissionContent(log)) };
  const result = await Promise.all([request.post(`/api/v1/daily-logs/${log.id}/submit`, { data: body }), request.post(`/api/v1/daily-logs/${log.id}/submit`, { data: body })]);
  for (const response of result) { expect(response.ok(), await response.text()).toBeTruthy(); expect((await response.json()).log.currentDocumentRevision).toBe(1); }
  expect(localSql(`select count(*) from jobs_app.log_revisions where daily_log_id='${log.id}'`)).toBe("1");
  expect(localSql(`select count(*) from jobs_app.email_deliveries where daily_log_id='${log.id}'`)).toBe("0");
  const before = localSql(`select content_sha256 from jobs_app.log_revisions where daily_log_id='${log.id}'`);
  const overwrite = await request.post("/api/v1/sync", { data: { contractVersion: "1.0", batchId: crypto.randomUUID(), deviceId: crypto.randomUUID(), mutations: [{ mutationId: crypto.randomUUID(), entityId: log.id, entityType: "daily_log", operation: "upsert", baseRevision: 2, occurredAt: new Date().toISOString(), payload: { ...log, notes: "overwrite" } }] } });
  expect((await overwrite.json()).acknowledgements[0].status).toBe("rejected");
  expect(localSql(`select content_sha256 from jobs_app.log_revisions where daily_log_id='${log.id}'`)).toBe(before);
  expect(() => localSql(`update jobs_app.log_revisions set snapshot='{}' where daily_log_id='${log.id}'`)).toThrow(/Immutable/);
  const doc = await request.get(`/api/v1/daily-logs/${log.id}/revisions/1/pdf`); expect(doc.ok()).toBeTruthy();
  const pdf = await doc.body(); expect(pdf.subarray(0, 5).toString()).toBe("%PDF-"); expect(doc.headers()["cache-control"]).toBe("private, no-store");
  const sha = createHash("sha256").update(pdf).digest("hex"); expect(doc.headers()["x-document-sha256"]).toBe(sha);
  const retries = await Promise.all(Array.from({ length: 12 }, () => request.post(`/api/v1/daily-logs/${log.id}/revisions/1/pdf`)));
  for (const r of retries) expect((await r.json()).document.sha256).toBe(sha);
  const send = { requestId: crypto.randomUUID(), recipient: `client-${log.id}@example.test` };
  const sent = await request.post(`/api/v1/daily-logs/${log.id}/revisions/1/send-client-email`, { data: send });
  expect(sent.ok(), await sent.text()).toBeTruthy(); expect((await sent.json()).delivery.state).toBe("sent");
  expect((await (await request.post(`/api/v1/daily-logs/${log.id}/revisions/1/send-client-email`, { data: send })).json()).delivery.state).toBe("sent");
  const capture = await playwright.request.newContext({ baseURL: "http://localhost:18082" });
  const messages = (await (await capture.get("/api/v1/messages")).json()).messages;
  const matching = messages.filter(m => m.To.some(to => to.Address === send.recipient)); expect(matching).toHaveLength(1);
  const message = await (await capture.get(`/api/v1/message/${matching[0].ID}`)).json();
  expect(message.Attachments).toHaveLength(1);
  const attachment = await capture.get(`/api/v1/message/${matching[0].ID}/part/${message.Attachments[0].PartID}`);
  expect(createHash("sha256").update(await attachment.body()).digest("hex")).toBe(sha);
  expect((await request.post(`/api/v1/daily-logs/${log.id}/revisions/1/send-client-email`, { data: { ...send, recipient: "changed@example.test" } })).status()).toBe(409);
  expect((await request.post(`/api/v1/daily-logs/${log.id}/revisions/1/send-client-email`, { data: { ...send, requestId: crypto.randomUUID() } })).status()).toBe(409);
  const resend = await request.post(`/api/v1/daily-logs/${log.id}/revisions/1/send-client-email`, { data: { ...send, requestId: crypto.randomUUID(), resendOf: send.requestId } }); expect((await resend.json()).delivery.state).toBe("sent");
  const other = await playwright.request.newContext({ baseURL: "http://localhost:18080" });
  await other.post("/api/v1/session/login", { data: { username: "localcrew", password: "TestPassword123!" } });
  expect((await other.get(`/api/v1/daily-logs/${log.id}/revisions/1/pdf`)).status()).toBe(403);
  expect((await other.post(`/api/v1/daily-logs/${log.id}/submit`, { data: body })).status()).toBe(403);
  await other.dispose(); await capture.dispose();
  const incomplete = createDailyLog({ owner: data.currentUser, ancillary: true, startedAt: new Date(Date.now()-3600000).toISOString(), initialActivity: { code: "ANC_WORKSHOP", label: "Workshop" } });
  const revision = await syncLog(request, incomplete);
  const rejected = await request.post(`/api/v1/daily-logs/${incomplete.id}/submit`, { data: { requestId: crypto.randomUUID(), baseRevision: revision, contentHash: await contentHash(submissionContent(incomplete)) } });
  expect(rejected.status()).toBe(422); expect((await rejected.json()).error.validationErrors.some(e => e.code === "SHIFT_UNFINISHED")).toBeTruthy();
});

test("signature uploads are encrypted, restricted, replayable and stay bound to earlier content after an edit", async ({ request, playwright }) => {
  await login(request); const data = await bootstrap(request), log = rigLog(data);
  const id = crypto.randomUUID();
  log.clientAcknowledgement = { status: "signed_on_device", signerName: "Local Client", companyRole: "Client / Site supervisor", clientEmail: null, signedAt: new Date().toISOString(), signatureUploadId: id, contentHash: await contentHash(workContent(log)) };
  let baseRevision = await syncLog(request, log);
  const upload = { id, snapshot: log, drawing: { strokes: [[[0.1, 0.4], [0.7, 0.9], [0.8, 0.1]]] } };
  const endpoint = `/api/v1/daily-logs/${log.id}/signatures`;
  const responses = await Promise.all([request.post(endpoint, { data: upload }), request.post(endpoint, { data: upload })]);
  for (const r of responses) expect(r.ok(), await r.text()).toBeTruthy();
  expect(localSql(`select count(*) from jobs_app.signature_assets where id='${id}'`)).toBe("1");
  expect(localSql(`select encode(encrypted_content,'escape') from jobs_app.signature_assets where id='${id}'`)).not.toContain("strokes");
  expect((await (await request.get(`/api/v1/signatures/${id}`)).json()).drawing).toEqual(upload.drawing);
  const other = await playwright.request.newContext({ baseURL: "http://localhost:18080" });
  await other.post("/api/v1/session/login", { data: { username: "localcrew", password: "TestPassword123!" } });
  expect((await other.get(`/api/v1/signatures/${id}`)).status()).toBe(403); await other.dispose();
  expect((await request.post(endpoint, { data: { ...upload, drawing: { strokes: [[[0.1, 0.1], [0.2, 0.2]]] } } })).status()).toBe(409);
  const changed = { ...log, notes: "Work corrected after client signed" }; baseRevision = await syncLog(request, changed, baseRevision);
  const submitted = await request.post(`/api/v1/daily-logs/${log.id}/submit`, { data: { requestId: crypto.randomUUID(), baseRevision, contentHash: await contentHash(submissionContent(changed)) } });
  expect(submitted.ok(), await submitted.text()).toBeTruthy(); const snapshot = (await submitted.json()).log;
  expect(snapshot.clientAcknowledgement.reasonCode).toBe("CONTENT_CHANGED"); expect(snapshot.clientAcknowledgement.priorSignatureUploadId).toBe(id);
  expect(localSql(`select acknowledged_content->>'notes' from jobs_app.signature_assets where id='${id}'`)).toBe("");
});

test("offline signature and Submit survive a complete browser restart, then lost upload/submission responses replay once", async ({ playwright }) => {
  const { mkdtempSync, rmSync } = await import("node:fs"), { tmpdir } = await import("node:os"), path = await import("node:path");
  const profile = mkdtempSync(path.join(tmpdir(), "jobs-step5-")); let context;
  try {
    context = await playwright.chromium.launchPersistentContext(profile, { headless: true, baseURL: "http://localhost:18080", viewport: { width: 390, height: 844 } });
    let page = context.pages()[0]; await page.goto("/"); await page.getByLabel("Username or email").fill("localdriller"); await page.getByLabel("Password").fill("TestPassword123!"); await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Your field workspace", { exact: true })).toBeVisible();
    const data = await bootstrap(page.request), log = rigLog(data); await syncLog(page.request, log);
    await page.evaluate(async log => {
      const db = await new Promise(resolve => { const r=indexedDB.open("substrata-jobs");r.onsuccess=()=>resolve(r.result); });
      await new Promise(resolve => { const tx=db.transaction(["dailyLogs","metadata"],"readwrite");tx.objectStore("dailyLogs").put({ ...log,serverRevision:1 });tx.objectStore("metadata").put(log.id,`active:${log.owner.userId}`);tx.oncomplete=resolve; }); db.close();
    }, log);
    await page.reload(); await expect(page.getByRole("button", { name: "Review completed shift" })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("button", { name: "Review completed shift" }).click(); await page.getByRole("button", { name: "Record client acknowledgement" }).click();
    await page.getByLabel("Acknowledgement outcome").selectOption("signed_on_device"); await page.getByLabel("Representative name").fill("Offline Representative");
    const box = await page.locator("canvas.signature-pad").boundingBox();
    await page.mouse.move(box.x+20,box.y+40); await page.mouse.down(); await page.mouse.move(box.x+100,box.y+80,{steps:8}); await page.mouse.move(box.x+160,box.y+30,{steps:8}); await page.mouse.up();
    await page.getByRole("button", { name: "Save acknowledgement" }).click(); await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByRole("button", { name: "Submit daily log", exact: true }).click(); await expect(page.getByRole("heading", { name: "Submission pending" })).toBeVisible();
    await context.close();
    context = await playwright.chromium.launchPersistentContext(profile, { headless: true, offline: true, baseURL: "http://localhost:18080", viewport: { width: 390, height: 844 } });
    page=context.pages()[0]; await page.goto("/"); await expect(page.getByRole("heading", { name: "Submission pending" })).toBeVisible();
    let uploadLost=false, submitLost=false;
    await page.route("**/signatures",async route=>{ if(!uploadLost){uploadLost=true;await route.fetch();await route.abort("failed");}else await route.continue(); });
    await page.route("**/submit",async route=>{ if(!submitLost){submitLost=true;await route.fetch();await route.abort("failed");}else await route.continue(); });
    await context.setOffline(false);
    for(let i=0;i<3;i++){ await page.locator(".sync-chip").click();await page.getByRole("button",{name:"Sync now",exact:true}).click();await expect(page.getByRole("button",{name:"Sync now",exact:true})).toBeEnabled();await page.getByRole("button",{name:"Close",exact:true}).click(); }
    await expect(page.getByRole("heading",{name:"Submitted daily log"})).toBeVisible();
    await expect(page.getByRole("link",{name:"Preview draft PDF"})).toBeVisible();
    expect(uploadLost).toBeTruthy();expect(submitLost).toBeTruthy();
    expect(localSql(`select count(*) from jobs_app.log_revisions where daily_log_id='${log.id}'`)).toBe("1");
    expect(localSql(`select count(*) from jobs_app.signature_assets where daily_log_id='${log.id}'`)).toBe("1");
    expect(localSql(`select count(*) from jobs_app.email_deliveries where daily_log_id='${log.id}'`)).toBe("0");
    await page.screenshot({path:"test-results/step5-submitted-review.png",fullPage:true});
  } finally {
    await context?.close();
    removeTestProfile(profile,tmpdir(),path,rmSync);
  }
});

test("PDF failures leave submission durable and can retry; unconfigured and uncertain sends never claim successful delivery", async ({ request }) => {
  await login(request); const data=await bootstrap(request),log=rigLog(data,"Water"),id=crypto.randomUUID();
  log.clientAcknowledgement={status:"signed_on_device",signerName:"Test Water Client",clientEmail:null,signedAt:new Date().toISOString(),signatureUploadId:id,contentHash:await contentHash(workContent(log))};
  const baseRevision=await syncLog(request,log);
  expect((await request.post(`/api/v1/daily-logs/${log.id}/signatures`,{data:{id,snapshot:log,drawing:{strokes:[[[0,0],[0.5,0.7]]]}}})).ok()).toBeTruthy();
  const body={requestId:crypto.randomUUID(),baseRevision,contentHash:await contentHash(submissionContent(log))};
  const failed=localModule(`import {submitLog} from './server/submissions.mjs'; import {closePool} from './server/db.mjs';delete process.env.SIGNATURE_ENCRYPTION_KEY;const result=await submitLog(${JSON.stringify(log.id)},${JSON.stringify(body)},${JSON.stringify(data.currentUser)});console.log(JSON.stringify(result));await closePool();`);
  expect(failed.log.status).toBe("submitted");expect(failed.document.state).toBe("failed");
  const retry=await request.post(`/api/v1/daily-logs/${log.id}/revisions/1/pdf`);expect((await retry.json()).document.state).toBe("ready");
  expect(localSql(`select count(*) from jobs_app.log_revisions where daily_log_id='${log.id}'`)).toBe("1");
  const send={requestId:crypto.randomUUID(),recipient:`fail-${log.id}@example.test`};
  const missing=localModule(`import {sendClientEmail} from './server/email.mjs';import {closePool} from './server/db.mjs';process.env.EMAIL_PROVIDER='unconfigured';console.log(JSON.stringify(await sendClientEmail(${JSON.stringify(log.id)},1,${JSON.stringify(send)},${JSON.stringify(data.currentUser)})));await closePool();`);
  expect(missing.state).toBe("failed");expect(missing.error_code).toBe("EMAIL_UNCONFIGURED");
  const ambiguous={...send,requestId:crypto.randomUUID(),resendOf:send.requestId};
  const unknown=localModule(`import {sendClientEmail} from './server/email.mjs';import {closePool} from './server/db.mjs';process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_PORT='1';console.log(JSON.stringify(await sendClientEmail(${JSON.stringify(log.id)},1,${JSON.stringify(ambiguous)},${JSON.stringify(data.currentUser)})));await closePool();`);
  expect(unknown.state).toBe("unknown");
  const replay=await request.post(`/api/v1/daily-logs/${log.id}/revisions/1/send-client-email`,{data:ambiguous});expect((await replay.json()).delivery.state).toBe("unknown");
  const newRequest={...send,requestId:crypto.randomUUID(),resendOf:ambiguous.requestId};
  expect((await request.post(`/api/v1/daily-logs/${log.id}/revisions/1/send-client-email`,{data:newRequest})).status()).toBe(409);
  expect((await (await request.post(`/api/v1/daily-logs/${log.id}/revisions/1/send-client-email`,{data:{...newRequest,confirmPossibleDuplicate:true}})).json()).delivery.state).toBe("sent");
});

test("ancillary submission has no PDF or email; Ops contacts dropdown reads only this client's contacts and does not invent a job default",async({request})=>{
  await login(request);const data=await bootstrap(request);
  const ancillary=endShift(createDailyLog({owner:data.currentUser,ancillary:true,startedAt:new Date(Date.now()-7200000).toISOString(),initialActivity:{code:"ANC_TRAINING",label:"Training"}}),{},new Date(Date.now()-3600000).toISOString());
  const baseRevision=await syncLog(request,ancillary);
  const result=await request.post(`/api/v1/daily-logs/${ancillary.id}/submit`,{data:{requestId:crypto.randomUUID(),baseRevision,contentHash:await contentHash(submissionContent(ancillary))}});
  expect(result.ok()).toBeTruthy();expect((await result.json()).document).toBeNull();expect((await request.get(`/api/v1/daily-logs/${ancillary.id}/revisions/1/pdf`)).status()).toBe(404);
  const rig=rigLog(data);await syncLog(request,rig);const output=(await (await request.get(`/api/v1/daily-logs/${rig.id}/output`)).json());
  expect(output.contacts.options.some(c=>c.email==="fixture.client@example.test")).toBeTruthy();expect(output.contacts.selectedContactId).toBeNull();expect(output.contacts.state).toBe("job_selection_unavailable");
  localSql(`do $$ begin if not exists (select 1 from pg_roles where rolname='jobs_no_contact_test') then create role jobs_no_contact_test; end if; end $$;grant usage on schema public to jobs_no_contact_test;`);
  expect(localSql("set role jobs_no_contact_test;select has_table_privilege(current_user,'public.client_contacts','SELECT')").split("\n").at(-1)).toBe("f");
});

test("browser contact selection, explicit Send and lost-response check send one copy and submitted controls stay locked", async ({ page, playwright }) => {
  await page.goto("/"); await page.getByLabel("Username or email").fill("localdriller"); await page.getByLabel("Password").fill("TestPassword123!"); await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Your field workspace"})).toBeVisible();
  const data=await bootstrap(page.request),log=rigLog(data);await syncLog(page.request,log);
  await page.evaluate(async log=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open("substrata-jobs");r.onsuccess=()=>resolve(r.result);});
    await new Promise(resolve=>{const tx=db.transaction(["dailyLogs","metadata"],"readwrite");tx.objectStore("dailyLogs").put({...log,serverRevision:1});tx.objectStore("metadata").put(log.id,`active:${log.owner.userId}`);tx.oncomplete=resolve;});db.close();
  },log);
  await page.reload();await page.getByRole("button",{name:"Review completed shift"}).click();
  for(const code of ["CLIENT_UNAVAILABLE","CLIENT_DECLINED","WILL_SIGN_LATER","OTHER","not_required"]){
    await page.getByRole("button",{name:"Record client acknowledgement"}).click();await page.getByLabel("Acknowledgement outcome").selectOption(code);
    if(code==="OTHER") await page.getByLabel("Acknowledgement note").fill("Local test: representative reviewing later.");
    await page.getByRole("button",{name:"Save acknowledgement"}).click();await expect(page.getByRole("dialog")).toBeHidden();
  }
  await page.getByRole("button",{name:"Submit daily log",exact:true}).click();await expect(page.getByRole("heading",{name:"Submitted daily log"})).toBeVisible();
  await page.getByLabel("Client contact").selectOption("d40a4c97-a67b-4c3e-950c-14922c91694a");await expect(page.getByLabel("Recipient email")).toHaveValue("fixture.client@example.test");
  const recipient=`browser-${log.id}@example.test`;await page.getByLabel("Recipient email").fill(recipient);
  let lost=false;await page.route("**/send-client-email",async route=>{if(!lost){lost=true;await route.fetch();await route.abort("failed");}else await route.continue();});
  await page.getByRole("button",{name:"Send draft PDF",exact:true}).click();await expect(page.getByRole("button",{name:"Check existing Send request"})).toBeVisible();
  await page.getByRole("button",{name:"Check existing Send request"}).click();await expect(page.getByText("Accepted by local test capture",{exact:true})).toBeVisible();
  await expect(page.getByRole("alert")).toBeHidden();
  const capture=await playwright.request.newContext({baseURL:"http://localhost:18082"});const messages=(await(await capture.get("/api/v1/messages")).json()).messages;
  expect(messages.filter(m=>m.To.some(to=>to.Address===recipient))).toHaveLength(1);await capture.dispose();
  await page.getByRole("button",{name:"Go back"}).click();await expect(page.getByLabel("Daily comments")).toBeDisabled();
  await page.getByRole("button",{name:"Review completed shift"}).click();await expect(page.getByRole("button",{name:"Submit daily log",exact:true})).toBeHidden();
  await page.screenshot({path:"test-results/step5-client-delivery.png",fullPage:true});
});
