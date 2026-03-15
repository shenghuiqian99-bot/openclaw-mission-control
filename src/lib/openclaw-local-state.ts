import { readdir, readFile } from "fs/promises";
import path from "path";
import type { OpenClawAgent, OpenClawCronJob } from "@/lib/openclaw-client";

const stateDir = path.join(process.env.USERPROFILE ?? "", ".openclaw");

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toIsoString(value?: number): string | undefined {
  if (!value || !Number.isFinite(value)) return undefined;
  return new Date(value).toISOString();
}

async function resolveDefaultModel(): Promise<string | undefined> {
  const configPath = path.join(stateDir, "openclaw.json");
  const config = await readJsonFile<Record<string, unknown>>(configPath, {});
  const agents = config.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const model = defaults?.model as Record<string, unknown> | undefined;
  return typeof model?.primary === "string" ? model.primary : undefined;
}

export async function listLocalAgents(): Promise<OpenClawAgent[]> {
  const agentsDir = path.join(stateDir, "agents");
  const defaultModel = await resolveDefaultModel();

  try {
    const entries = await readdir(agentsDir, { withFileTypes: true });
    const agents = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const sessionsPath = path.join(agentsDir, entry.name, "sessions", "sessions.json");
          const modelsPath = path.join(agentsDir, entry.name, "agent", "models.json");
          const sessions = await readJsonFile<Record<string, { updatedAt?: number }>>(sessionsPath, {});
          const models = await readJsonFile<Record<string, unknown>>(modelsPath, {});
          const providers = (models.providers as Record<string, { models?: Array<{ id?: string }> }> | undefined) ?? {};
          const firstProvider = Object.entries(providers).find(([, provider]) => Array.isArray(provider.models) && provider.models.length > 0);
          const model = firstProvider?.[1].models?.[0]?.id
            ? `${firstProvider[0]}/${firstProvider[1].models?.[0]?.id}`
            : defaultModel;
          const latestActivity = Object.values(sessions).reduce<number | undefined>((latest, session) => {
            if (typeof session.updatedAt !== "number") return latest;
            if (typeof latest !== "number") return session.updatedAt;
            return Math.max(latest, session.updatedAt);
          }, undefined);

          return {
            id: entry.name,
            name: entry.name,
            model,
            status:
              typeof latestActivity === "number" && Date.now() - latestActivity < 24 * 60 * 60 * 1000
                ? "active"
                : "idle",
          } satisfies OpenClawAgent;
        })
    );

    return agents.sort((left, right) => left.id.localeCompare(right.id));
  } catch {
    return [];
  }
}

type StoredCronJob = {
  id: string;
  enabled?: boolean;
  agentId?: string;
  schedule?: {
    kind?: string;
    expr?: string;
    cron?: string;
    everyMs?: number;
    anchorMs?: number;
  };
  payload?: {
    message?: string;
  };
  state?: {
    lastRunAtMs?: number;
    nextRunAtMs?: number;
  };
};

export async function listLocalCronJobs(): Promise<OpenClawCronJob[]> {
  const jobsPath = path.join(stateDir, "cron", "jobs.json");
  const payload = await readJsonFile<{ jobs?: StoredCronJob[] }>(jobsPath, {});
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

  return jobs.map((job) => ({
    id: job.id,
    prompt: job.payload?.message,
    schedule: job.schedule?.kind === "cron"
      ? job.schedule.expr ?? job.schedule.cron ?? ""
      : job.schedule?.everyMs
        ? {
            kind: "every",
            everyMs: job.schedule.everyMs,
            anchorMs: job.schedule.anchorMs,
          }
        : "",
    enabled: job.enabled !== false,
    agentId: job.agentId,
    lastRun: toIsoString(job.state?.lastRunAtMs),
    nextRun: toIsoString(job.state?.nextRunAtMs),
  }));
}