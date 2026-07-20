import { query } from "./db.mjs";

function isoDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function isoInstant(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizedText(value) {
  return String(value || "").trim().toLowerCase();
}

function parsePersonnel(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { return JSON.parse(value); } catch { return []; }
}

function userRef(user) {
  return {
    userId: user.id,
    employeeCode: user.employee_code,
    displayName: user.full_name,
    roleTitle: user.role_title,
    appRole: user.app_role || "FieldUser",
    division: user.division,
    region: user.region,
  };
}

function resolvePersonnel(personnel, users) {
  const byId = new Map(users.map((user) => [user.id, user]));
  const byCode = new Map(users.map((user) => [normalizedText(user.employee_code), user]));
  const byName = new Map(users.map((user) => [normalizedText(user.full_name), user]));
  return parsePersonnel(personnel).map((entry) => {
    const source = typeof entry === "string" ? { displayName: entry } : entry;
    const match = byId.get(source.userId || source.id)
      || byCode.get(normalizedText(source.employeeCode || source.employee_code))
      || byName.get(normalizedText(source.displayName || source.name || source.fullName));
    return match ? userRef(match) : null;
  }).filter(Boolean);
}

export async function getBootstrap({ user, from, to, myAssignmentsOnly }) {
  const [usersResult, assignmentsResult, cataloguesResult] = await Promise.all([
    query(`select id, employee_code, full_name, role_title, app_role, division, region
           from public.app_users where is_active = true order by full_name`),
    query(
      `select
        pa.id, pa.assignment_type, pa.title, pa.start_date, pa.end_date, pa.personnel, pa.updated_at,
        j.id as job_id, j.job_number, j.title as job_title, j.division as job_division,
        j.site_name, j.site_address,
        c.id as client_id, c.name as client_name,
        e.id as equipment_id, e.equipment_code, e.name as equipment_name,
        e.equipment_type, e.division as equipment_division
       from public.planner_assignments pa
       join public.equipment e on e.id = pa.equipment_id
       left join public.jobs j on j.id = pa.job_id
       left join public.clients c on c.id = j.client_id
       where pa.end_date >= $1::date and pa.start_date <= $2::date
       order by pa.start_date, e.equipment_code`,
      [from, to],
    ),
    query(
      `select cv.version, cv.effective_from, ci.catalogue_type, ci.code, ci.label,
              ci.division, ci.unit, ci.active, ci.sort_order
       from jobs_app.catalogue_versions cv
       join jobs_app.catalogue_items ci on ci.catalogue_version = cv.version
       where cv.is_current = true
       order by ci.catalogue_type, ci.sort_order, ci.label`,
    ),
  ]);

  const users = usersResult.rows;
  const assignments = assignmentsResult.rows.map((row) => {
    const personnel = resolvePersonnel(row.personnel, users);
    const isMine = personnel.some((person) => person.userId === user.userId);
    return {
      assignmentId: row.id,
      assignmentType: row.assignment_type,
      startsOn: isoDate(row.start_date),
      endsOn: isoDate(row.end_date),
      title: row.title,
      job: row.job_id ? {
        jobId: row.job_id,
        jobNumber: row.job_number,
        title: row.job_title,
        division: row.job_division,
        clientId: row.client_id,
        clientName: row.client_name,
        siteName: row.site_name,
        siteAddress: row.site_address,
      } : null,
      equipment: {
        equipmentId: row.equipment_id,
        equipmentCode: row.equipment_code,
        name: row.equipment_name,
        equipmentType: row.equipment_type,
        division: row.equipment_division,
      },
      personnel,
      points: [],
      isMine,
      updatedAt: isoInstant(row.updated_at),
    };
  }).filter((assignment) => !myAssignmentsOnly || assignment.isMine);

  const catalogueRows = cataloguesResult.rows;
  const mapCatalogue = (types) => catalogueRows.filter((row) => types.includes(row.catalogue_type)).map((row) => ({
    code: row.code,
    label: row.label,
    division: row.division,
    unit: row.unit,
    active: row.active,
    sortOrder: row.sort_order,
    itemType: row.catalogue_type,
  }));

  return {
    contractVersion: "1.0",
    serverTime: new Date().toISOString(),
    syncCursor: `bootstrap:${Date.now()}`,
    retentionDays: 14,
    currentUser: user,
    permissions: permissionsFor(user.appRole),
    assignments,
    catalogues: {
      version: catalogueRows[0]?.version || 1,
      effectiveFrom: catalogueRows[0] ? isoInstant(catalogueRows[0].effective_from) : new Date(0).toISOString(),
      activities: mapCatalogue(["activity"]),
      ancillaryCodes: mapCatalogue(["ancillary"]),
      items: mapCatalogue(["material", "service", "measurement", "subcontractor"]),
    },
  };
}

function permissionsFor(role) {
  const base = ["assignments:view", "daily_logs:create", "daily_logs:submit"];
  if (["Supervisor", "Administrator", "SuperUser"].includes(role)) base.push("daily_logs:review", "assignments:view_all");
  if (["Administrator", "SuperUser"].includes(role)) base.push("daily_logs:reopen", "catalogues:manage");
  return base;
}

export async function recordSyncProbe({ userId, deviceId, probeId, clientCreatedAt, platform, appVersion }) {
  const client = await query(
    `insert into jobs_app.devices (id, user_id, platform, app_version, last_seen_at)
     values ($1, $2, $3, $4, now())
     on conflict (id) do update set user_id = excluded.user_id, platform = excluded.platform,
       app_version = excluded.app_version, last_seen_at = now()
     where jobs_app.devices.user_id = excluded.user_id
     returning id`,
    [deviceId, userId, platform || null, appVersion || null],
  );
  if (!client.rowCount) throw new Error("Unable to register device.");

  const result = await query(
    `insert into jobs_app.sync_probes (id, device_id, user_id, client_created_at, payload)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (id) do nothing returning server_received_at`,
    [probeId, deviceId, userId, clientCreatedAt, JSON.stringify({ platform, appVersion })],
  );
  return {
    probeId,
    status: result.rowCount ? "applied" : "duplicate",
    serverTime: result.rows[0]?.server_received_at ? isoInstant(result.rows[0].server_received_at) : new Date().toISOString(),
  };
}
