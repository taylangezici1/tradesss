import type { Metadata } from "next";
import { TimeSimDetail } from "@/components/time-sim-detail";
import { readOne } from "@/lib/timesim-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const sim = await readOne(params.id);
  return { title: sim ? sim.name : "Time Simulation" };
}

export default function TimeSimDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <TimeSimDetail id={params.id} />;
}
