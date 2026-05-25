import type { Metadata } from "next";
import { NewSimulationForm } from "@/components/new-simulation-form";

export const metadata: Metadata = { title: "New simulation" };

export default function NewSimulationPage() {
  return <NewSimulationForm />;
}
