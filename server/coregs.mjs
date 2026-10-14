import sql from "mssql";

const problem = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });

export function coreGsCapability(env = process.env) {
  return {
    source: "core_gs",
    enabled: String(env.CORE_GS_ENABLED || "false").toLowerCase() === "true",
    configured: ["CORE_GS_HOST", "CORE_GS_DATABASE", "CORE_GS_USER", "CORE_GS_PASSWORD"].every(key => Boolean(env[key])),
  };
}

// Read-only counterpart of Field's getCoreGsPool/getCoreGsPoints helpers.
// Credentials stay on the Jobs server; Ops job_number is CORE-GS PROJ_ID.
export function createCoreGsPointReader({ env = process.env, driver = sql } = {}) {
  let connecting;

  function configuration() {
    const capability = coreGsCapability(env);
    if (!capability.enabled) throw problem(503, "CORE_GS_DISABLED", "CORE-GS point lookup is disabled. Previously saved points remain available.");
    if (!capability.configured) throw problem(503, "CORE_GS_UNCONFIGURED", "CORE-GS connection is not configured in Jobs. Previously saved points remain available.");
    const port = env.CORE_GS_PORT ? Number(env.CORE_GS_PORT) : undefined;
    const clientId = env.CORE_GS_CLNT_ID || "Geotechnical";
    if ((port != null && (!Number.isInteger(port) || port < 1 || port > 65535)) || !clientId.trim() || clientId.length > 40)
      throw problem(503, "CORE_GS_CONFIG_INVALID", "Check the CORE-GS port and client ID configured in Jobs.");
    return {
      clientId,
      connection: {
        server: env.CORE_GS_HOST,
        ...(port ? { port } : {}),
        database: env.CORE_GS_DATABASE,
        user: env.CORE_GS_USER,
        password: env.CORE_GS_PASSWORD,
        connectionTimeout: 10000,
        requestTimeout: 10000,
        options: {
          ...(env.CORE_GS_INSTANCE ? { instanceName: env.CORE_GS_INSTANCE } : {}),
          encrypt: String(env.CORE_GS_ENCRYPT || "false").toLowerCase() === "true",
          trustServerCertificate: String(env.CORE_GS_TRUST_SERVER_CERTIFICATE || "true").toLowerCase() !== "false",
        },
        pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      },
    };
  }

  async function read(jobNumber) {
    if (typeof jobNumber !== "string" || !jobNumber.trim() || jobNumber.length > 40)
      throw problem(400, "JOB_NUMBER_INVALID", "Enter a job number of 40 characters or fewer.");
    const { clientId, connection } = configuration(), project = jobNumber.trim();
    let rows;
    try {
      if (!connecting) {
        const pool = new driver.ConnectionPool(connection);
        connecting = pool.connect().catch(async error => {
          connecting = undefined;
          await pool.close().catch(() => {});
          throw error;
        });
      }
      const pool = await connecting;
      const result = await pool.request()
        .input("CLNT_ID", driver.NVarChar(40), clientId)
        .input("PROJ_ID", driver.NVarChar(40), project)
        .query(`SELECT POINT_ID, Type, HoleDepth, Location
          FROM dbo.POINT
          WHERE CLNT_ID = @CLNT_ID AND PROJ_ID = @PROJ_ID
          ORDER BY COALESCE(Sort, 2147483647), POINT_ID;`);
      rows = result.recordset;
    } catch (error) {
      // Do not expose connection strings, login details or driver error objects.
      const message = error.code === "ELOGIN"
        ? "CORE-GS rejected the Jobs connection. Check its configured login and permissions."
        : "CORE-GS points could not be read. Check the Jobs connection and read permissions. Previously saved points remain available.";
      throw problem(502, "CORE_GS_UNAVAILABLE", message);
    }
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.POINT_ID !== "string" || !row.POINT_ID.trim() ||
      (row.HoleDepth != null && (!Number.isFinite(Number(row.HoleDepth)) || Number(row.HoleDepth) < 0))))
      throw problem(502, "CORE_GS_RESPONSE_INVALID", "CORE-GS returned invalid point data. Previously saved points remain available.");
    return rows.map(row => ({ jobNumber: project, pointId: row.POINT_ID.trim(), pointType: row.Type ?? null,
      plannedDepthM: row.HoleDepth == null ? null : Number(row.HoleDepth), location: row.Location ?? null }));
  }

  async function close() {
    const pending = connecting;
    connecting = undefined;
    if (pending) await (await pending.catch(() => null))?.close();
  }
  return { read, close };
}

const points = createCoreGsPointReader();
export const getCoreGsPoints = points.read;
export const closeCoreGsPool = points.close;
