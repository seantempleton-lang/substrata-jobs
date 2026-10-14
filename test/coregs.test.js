import test from "node:test";
import assert from "node:assert/strict";
import { coreGsCapability, createCoreGsPointReader } from "../server/coregs.mjs";

const env = { CORE_GS_ENABLED: "true", CORE_GS_HOST: "fixture-host", CORE_GS_DATABASE: "fixture-db", CORE_GS_USER: "fixture-user", CORE_GS_PASSWORD: "fixture-password" };
function fixture({ rows = [], failConnect = 0, queryError } = {}) {
  const calls = { connections: 0, closes: 0, queries: [] };
  const driver = {
    NVarChar: length => ({ length }),
    ConnectionPool: class {
      constructor(config) { calls.config = config; }
      async connect() { calls.connections++; if (failConnect-- > 0) throw new Error("private connection details"); return this; }
      async close() { calls.closes++; }
      request() {
        const inputs = {};
        return { input(name, type, value) { inputs[name] = { type, value }; return this; }, async query(text) {
          calls.queries.push({ text, inputs });
          if (queryError) throw queryError;
          return { recordset: rows };
        } };
      }
    },
  };
  return { driver, calls };
}

test("CORE-GS points use Field's client/project parameters and preserve source order, null depth and units", async () => {
  const { driver, calls } = fixture({ rows: [
    { POINT_ID: "BH2", Type: "CP", HoleDepth: "12.50", Location: "Site B" },
    { POINT_ID: "BH1", Type: null, HoleDepth: null, Location: null },
  ] });
  const reader = createCoreGsPointReader({ env: { ...env, CORE_GS_CLNT_ID: "Water", CORE_GS_PORT: "1435", CORE_GS_INSTANCE: "FIXTURE", CORE_GS_ENCRYPT: "true", CORE_GS_TRUST_SERVER_CERTIFICATE: "false" }, driver });
  const project = "302670' OR 1=1 --";
  const [points] = await Promise.all([reader.read(project), reader.read("302684")]);
  assert.equal(calls.connections, 1);
  assert.deepEqual(points, [
    { jobNumber: project, pointId: "BH2", pointType: "CP", plannedDepthM: 12.5, location: "Site B" },
    { jobNumber: project, pointId: "BH1", pointType: null, plannedDepthM: null, location: null },
  ]);
  assert.equal(calls.queries[0].inputs.CLNT_ID.value, "Water");
  assert.equal(calls.queries[0].inputs.PROJ_ID.value, project);
  assert.equal(calls.queries[0].inputs.PROJ_ID.type.length, 40);
  assert.ok(!calls.queries[0].text.includes(project));
  assert.match(calls.queries[0].text, /WHERE CLNT_ID = @CLNT_ID AND PROJ_ID = @PROJ_ID/);
  assert.match(calls.queries[0].text, /ORDER BY COALESCE\(Sort, 2147483647\), POINT_ID/);
  assert.ok(!/\b(INSERT|UPDATE|DELETE|MERGE)\b/i.test(calls.queries[0].text));
  assert.equal(calls.config.port, 1435);
  assert.deepEqual(calls.config.options, { instanceName: "FIXTURE", encrypt: true, trustServerCertificate: false });
  await reader.close(); assert.equal(calls.closes, 1);
});

test("CORE-GS configuration and job validation do not depend on Field settings", async () => {
  const { driver, calls } = fixture();
  assert.deepEqual(coreGsCapability(env), { source: "core_gs", enabled: true, configured: true });
  for (const [settings, code] of [
    [{ ...env, CORE_GS_ENABLED: "false" }, "CORE_GS_DISABLED"],
    [{ ...env, CORE_GS_PASSWORD: "" }, "CORE_GS_UNCONFIGURED"],
    [{ ...env, CORE_GS_PORT: "not-a-port" }, "CORE_GS_CONFIG_INVALID"],
  ]) await assert.rejects(createCoreGsPointReader({ env: settings, driver }).read("302670"), { code });
  const reader = createCoreGsPointReader({ env, driver });
  for (const project of ["", " ", ["302670"], "x".repeat(41)]) await assert.rejects(reader.read(project), { code: "JOB_NUMBER_INVALID" });
  assert.equal(calls.connections, 0);
  assert.deepEqual(await reader.read("302670"), []);
  assert.equal(calls.queries[0].inputs.CLNT_ID.value, "Geotechnical");
  await reader.close();
});

test("CORE-GS failed connections retry and failures do not expose credentials or become empty success", async () => {
  const { driver, calls } = fixture({ failConnect: 1 });
  const reader = createCoreGsPointReader({ env, driver });
  await assert.rejects(reader.read("302670"), error => error.code === "CORE_GS_UNAVAILABLE" && !error.message.includes("private"));
  assert.deepEqual(await reader.read("302670"), []);
  assert.equal(calls.connections, 2);
  await reader.close();
  const rejected = createCoreGsPointReader({ env, driver: fixture({ queryError: Object.assign(new Error("fixture-password"), { code: "ELOGIN" }) }).driver });
  await assert.rejects(rejected.read("302670"), error => error.code === "CORE_GS_UNAVAILABLE" && !error.message.includes("fixture-password"));
  await rejected.close();
  const invalid = createCoreGsPointReader({ env, driver: fixture({ rows: [null] }).driver });
  await assert.rejects(invalid.read("302670"), { code: "CORE_GS_RESPONSE_INVALID" });
  await invalid.close();
});
