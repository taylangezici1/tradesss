import type { Metadata } from "next";
import { SimulationDetail } from "@/components/simulation-detail";
import { readOne } from "@/lib/sim-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const sim = await readOne(params.id);
  return { title: sim ? sim.name : "Simulation" };
}

export default function SimulationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <SimulationDetail id={params.id} />;
}
