import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { pool, query } from "./db.mjs";

const COOKIE_NAME = "substrata_jobs_session";
const sessionDays = Number(process.env.SESSION_DURATION_DAYS || 30);

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(header = "") {
  return header.split(";").map((item) => item.trim()).filter(Boolean).reduce((cookies, item) => {
    const separator = item.indexOf("=");
    if (separator > 0) cookies[item.slice(0, separator)] = decodeURIComponent(item.slice(separator + 1));
    return cookies;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  parts.push(`Path=${options.path || "/"}`);
  return parts.join("; ");
}

function secureCookie(req) {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function normalizeUser(row) {
  return {
    userId: row.user_id,
    employeeCode: row.employee_code,
    displayName: row.full_name,
    roleTitle: row.role_title,
    appRole: row.app_role || "FieldUser",
    division: row.division,
    region: row.region,
    email: row.email,
  };
}

function verifyPassword(password, encoded) {
  const [algorithm, salt, hash] = String(encoded || "").split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const existing = Buffer.from(hash, "hex");
  const derived = scryptSync(password, salt, existing.length);
  return existing.length === derived.length && timingSafeEqual(existing, derived);
}

async function recordAuthEvent({ eventType, accountId = null, userId = null, sessionId = null, loginIdentifier = null, req, metadata = {} }) {
  await query(
    `insert into public.app_auth_events (
      event_type, account_id, user_id, session_id, login_identifier, ip_address, user_agent, metadata
    ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [eventType, accountId, userId, sessionId, loginIdentifier, req.ip || null, req.get("user-agent") || null, JSON.stringify({ application: "substrata-jobs", ...metadata })],
  );
}

export function setSessionCookie(res, req, token, expiresAt) {
  res.setHeader("Set-Cookie", serializeCookie(COOKIE_NAME, token, {
    expires: new Date(expiresAt),
    maxAge: Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
    secure: secureCookie(req),
  }));
}

export function clearSessionCookie(res, req) {
  res.setHeader("Set-Cookie", serializeCookie(COOKIE_NAME, "", { expires: new Date(0), maxAge: 0, secure: secureCookie(req) }));
}

export async function getSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;

  const result = await query(
    `select
      s.id as session_id, s.expires_at,
      a.id as account_id,
      u.id as user_id, u.employee_code, u.full_name, u.role_title, u.app_role,
      u.division, u.region, u.email
    from public.app_sessions s
    join public.app_auth_accounts a on a.id = s.account_id
    join public.app_users u on u.id = a.user_id
    where s.session_token_hash = $1
      and s.revoked_at is null
      and s.expires_at > now()
      and a.is_active = true
      and u.is_active = true
    limit 1`,
    [hashToken(token)],
  );
  if (!result.rowCount) return null;

  const row = result.rows[0];
  await query("update public.app_sessions set last_seen_at = now(), updated_at = now() where id = $1", [row.session_id]);
  return { sessionId: row.session_id, accountId: row.account_id, expiresAt: row.expires_at, user: normalizeUser(row) };
}

export async function requireAuth(req, res, next) {
  try {
    const session = await getSession(req);
    if (!session) {
      clearSessionCookie(res, req);
      res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication required.", retryable: false } });
      return;
    }
    req.auth = session;
    next();
  } catch (error) {
    next(error);
  }
}

export async function login(req, identifier, password) {
  const loginIdentifier = String(identifier || "").trim();
  const rawPassword = String(password || "");
  if (!loginIdentifier || !rawPassword) {
    const error = new Error("Username and password are required.");
    error.statusCode = 400;
    error.code = "AUTH_INPUT_REQUIRED";
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `select
        a.id as account_id, a.password_hash, a.failed_login_count, a.locked_until,
        u.id as user_id, u.employee_code, u.full_name, u.role_title, u.app_role,
        u.division, u.region, u.email
      from public.app_auth_accounts a
      join public.app_users u on u.id = a.user_id
      where (lower(u.login_username) = lower($1) or lower(a.login_email) = lower($2))
        and a.is_active = true and u.is_active = true
      limit 1 for update`,
      [loginIdentifier.replace(/[^A-Za-z0-9]/g, ""), loginIdentifier.toLowerCase()],
    );

    if (!result.rowCount) {
      await client.query("rollback");
      await recordAuthEvent({ eventType: "login_failed", loginIdentifier, req, metadata: { reason: "unknown_login" } });
      const error = new Error("Invalid username or password.");
      error.statusCode = 401;
      error.code = "AUTH_INVALID";
      throw error;
    }

    const account = result.rows[0];
    if (account.locked_until && new Date(account.locked_until).getTime() > Date.now()) {
      await client.query("rollback");
      const error = new Error("This account is temporarily locked. Try again later.");
      error.statusCode = 429;
      error.code = "AUTH_LOCKED";
      throw error;
    }

    if (!verifyPassword(rawPassword, account.password_hash)) {
      await client.query(
        `update public.app_auth_accounts set
          failed_login_count = failed_login_count + 1,
          last_failed_login_at = now(),
          locked_until = case when failed_login_count + 1 >= 5 then now() + interval '15 minutes' else null end,
          updated_at = now()
        where id = $1`,
        [account.account_id],
      );
      await client.query("commit");
      await recordAuthEvent({ eventType: "login_failed", accountId: account.account_id, userId: account.user_id, loginIdentifier, req, metadata: { reason: "invalid_password" } });
      const error = new Error("Invalid username or password.");
      error.statusCode = 401;
      error.code = "AUTH_INVALID";
      throw error;
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + sessionDays * 86_400_000);
    const session = await client.query(
      `insert into public.app_sessions (account_id, session_token_hash, expires_at, last_seen_at)
       values ($1, $2, $3, now()) returning id, expires_at`,
      [account.account_id, hashToken(token), expiresAt],
    );
    await client.query(
      `update public.app_auth_accounts set last_login_at = now(), failed_login_count = 0,
       last_failed_login_at = null, locked_until = null, updated_at = now() where id = $1`,
      [account.account_id],
    );
    await client.query("commit");
    await recordAuthEvent({ eventType: "login_succeeded", accountId: account.account_id, userId: account.user_id, sessionId: session.rows[0].id, loginIdentifier, req });

    return { token, expiresAt: session.rows[0].expires_at, user: normalizeUser(account) };
  } catch (error) {
    if (!error.statusCode) {
      try { await client.query("rollback"); } catch { /* connection may already be outside a transaction */ }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function logout(req) {
  if (req.auth?.sessionId) {
    await query("update public.app_sessions set revoked_at = now(), updated_at = now() where id = $1", [req.auth.sessionId]);
    await recordAuthEvent({ eventType: "logout", accountId: req.auth.accountId, userId: req.auth.user.userId, sessionId: req.auth.sessionId, req });
  }
}
