import type { Metadata } from "next";
import { SimulationsList } from "@/components/simulations-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Simulations" };

export default function SimulationsPage() {
  return <SimulationsList />;
}
