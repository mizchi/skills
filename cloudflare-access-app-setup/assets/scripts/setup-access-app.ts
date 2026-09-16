#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const DEFAULT_API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_APP_NAME = "My Worker";
const DEFAULT_DOMAIN = "REPLACE_ME.workers.dev/v1/*";
const DEFAULT_SESSION_DURATION = "24h";

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function requireValue(value, name) {
  if (String(value ?? "").length === 0) {
    throw new Error(`${name} is required`);
  }
  return String(value);
}

function validateEmails(emails) {
  if (emails.length === 0) {
    throw new Error("APP_ACCESS_ALLOWED_EMAILS or APP_ACCESS_ALLOWED_EMAIL is required");
  }
  for (const email of emails) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`invalid Access allowlist email: ${email}`);
    }
  }
}

function accessDomainToTeamDomain(authDomain) {
  const value = String(authDomain ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (value.length === 0) return undefined;
  return `https://${value}`;
}

function redactEmail(email) {
  const [local, domain] = String(email).split("@");
  if (!local || !domain) return "<redacted>";
  const prefix = local.slice(0, 1);
  return `${prefix}***@${domain}`;
}

function redactPayload(payload) {
  return {
    ...payload,
    policies: payload.policies.map((policy) => ({
      ...policy,
      include: policy.include.map((rule) => {
        const email = rule.email?.email;
        return email ? { email: { email: redactEmail(email) } } : rule;
      }),
    })),
  };
}

export function buildAccessApplicationPayload({
  name = DEFAULT_APP_NAME,
  domain = DEFAULT_DOMAIN,
  allowedEmails,
  sessionDuration = DEFAULT_SESSION_DURATION,
} = {}) {
  const emails = splitCsv(Array.isArray(allowedEmails) ? allowedEmails.join(",") : allowedEmails);
  validateEmails(emails);
  return {
    name,
    domain,
    type: "self_hosted",
    app_launcher_visible: false,
    session_duration: sessionDuration,
    destinations: [{ type: "public", uri: domain }],
    policies: [
      {
        name: `${name} allow listed emails`,
        decision: "allow",
        precedence: 1,
        include: emails.map((email) => ({ email: { email } })),
      },
    ],
  };
}

export function readAccessSetupConfig(env = process.env) {
  const allowedEmails =
    env.APP_ACCESS_ALLOWED_EMAILS ?? env.APP_ACCESS_ALLOWED_EMAIL ?? "";
  return {
    apiBase: env.CLOUDFLARE_API_BASE ?? DEFAULT_API_BASE,
    token: env.CLOUDFLARE_API_TOKEN ?? "",
    accountId: env.CLOUDFLARE_ACCOUNT_ID ?? "",
    name: env.APP_ACCESS_APP_NAME ?? DEFAULT_APP_NAME,
    domain: env.APP_ACCESS_DOMAIN ?? DEFAULT_DOMAIN,
    allowedEmails,
    sessionDuration: env.APP_ACCESS_SESSION_DURATION ?? DEFAULT_SESSION_DURATION,
  };
}

async function cloudflareApi({
  apiBase,
  token,
  path,
  method = "GET",
  body,
  fetchImpl = globalThis.fetch,
}) {
  const response = await fetchImpl(`${apiBase}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text.length > 0 ? JSON.parse(text) : {};
  if (!response.ok || json.success === false) {
    const messages = Array.isArray(json.errors)
      ? json.errors.map((error) => error.message).join("; ")
      : text;
    throw new Error(`Cloudflare API ${method} ${path} failed: ${messages || response.status}`);
  }
  return json.result;
}

async function listAccessApplications(config, fetchImpl) {
  const result = await cloudflareApi({
    ...config,
    path: `/accounts/${config.accountId}/access/apps?per_page=100`,
    fetchImpl,
  });
  return Array.isArray(result) ? result : [];
}

async function getAccessOrganization(config, fetchImpl) {
  return await cloudflareApi({
    ...config,
    path: `/accounts/${config.accountId}/access/organizations`,
    fetchImpl,
  });
}

export async function setupAccessApplication(config, { fetchImpl = globalThis.fetch } = {}) {
  requireValue(config.token, "CLOUDFLARE_API_TOKEN");
  requireValue(config.accountId, "CLOUDFLARE_ACCOUNT_ID");
  const payload = buildAccessApplicationPayload(config);
  const [organization, apps] = await Promise.all([
    getAccessOrganization(config, fetchImpl),
    listAccessApplications(config, fetchImpl),
  ]);
  const existing = apps.find((app) => app.domain === payload.domain || app.name === payload.name);
  const app = existing ?? await cloudflareApi({
    ...config,
    path: `/accounts/${config.accountId}/access/apps`,
    method: "POST",
    body: payload,
    fetchImpl,
  });
  const teamDomain = accessDomainToTeamDomain(organization?.auth_domain);
  return {
    ok: true,
    created: existing === undefined,
    app: {
      id: app.id,
      name: app.name,
      domain: app.domain,
      aud: app.aud,
    },
    vars: {
      APP_ACCESS_TEAM_DOMAIN: teamDomain,
      APP_ACCESS_AUD: app.aud,
    },
  };
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const dryRun = argv.includes("--dry-run");
  const config = readAccessSetupConfig(env);
  const payload = buildAccessApplicationPayload(config);
  if (dryRun) {
    printJson({
      ok: true,
      dry_run: true,
      account_id_present: config.accountId.length > 0,
      api_token_present: config.token.length > 0,
      payload: redactPayload(payload),
    });
    return;
  }
  const result = await setupAccessApplication(config);
  printJson(result);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  });
}
