import { NextResponse } from "next/server";
import { listAnalyses } from "@/lib/analysis-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const analyses = await listAnalyses();
  return NextResponse.json({
    count: analyses.length,
    analyses,
  });
}
