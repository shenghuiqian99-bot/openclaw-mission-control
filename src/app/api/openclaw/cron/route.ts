import { NextRequest, NextResponse } from "next/server";
import { getOpenClawClient } from "@/lib/openclaw-client";
import { listLocalCronJobs } from "@/lib/openclaw-local-state";

export async function GET(request: NextRequest) {
  try {
    const client = getOpenClawClient();
    await client.connect();

    const { searchParams } = new URL(request.url);
    const runsFor = searchParams.get("runs");

    if (runsFor) {
      const runs = await client.cronRuns(runsFor);
      return NextResponse.json({ runs });
    }

    const jobs = await client.listCronJobs();
    return NextResponse.json({ jobs });
  } catch (error) {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("runs")) {
      return NextResponse.json(
        { error: String(error), runs: [] },
        { status: 500 }
      );
    }

    const jobs = await listLocalCronJobs();
    return NextResponse.json(
      { error: String(error), jobs, fallback: true }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    const client = getOpenClawClient();
    await client.connect();

    if (action === "add") {
      const job = await client.addCronJob(params);
      return NextResponse.json({ ok: true, job });
    }
    if (action === "run") {
      const result = await client.runCronJob(params.id, params.mode);
      return NextResponse.json({ ok: true, result });
    }
    if (action === "update") {
      const { id, ...patch } = params;
      const job = await client.updateCronJob(id, patch);
      return NextResponse.json({ ok: true, job });
    }
    if (action === "remove") {
      await client.removeCronJob(params.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
