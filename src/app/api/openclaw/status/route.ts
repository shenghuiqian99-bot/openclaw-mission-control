import { NextResponse } from "next/server";
import { getOpenClawClient } from "@/lib/openclaw-client";
import { listLocalAgents, listLocalCronJobs } from "@/lib/openclaw-local-state";

export async function GET() {
  try {
    const client = getOpenClawClient();
    await client.connect();

    const [health, agents, cronJobs, localAgents, localCronJobs] = await Promise.allSettled([
      client.health(),
      client.listAgents(),
      client.listCronJobs(),
      listLocalAgents(),
      listLocalCronJobs(),
    ]);

    const agentCount =
      agents.status === "fulfilled"
        ? (agents.value as unknown[]).length
        : localAgents.status === "fulfilled"
          ? localAgents.value.length
          : 0;

    const cronJobCount =
      cronJobs.status === "fulfilled"
        ? (cronJobs.value as unknown[]).length
        : localCronJobs.status === "fulfilled"
          ? localCronJobs.value.length
          : 0;

    return NextResponse.json({
      connected: true,
      health: health.status === "fulfilled" ? health.value : null,
      agentCount,
      cronJobCount,
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      error: String(error),
      agentCount: 0,
      cronJobCount: 0,
    });
  }
}
