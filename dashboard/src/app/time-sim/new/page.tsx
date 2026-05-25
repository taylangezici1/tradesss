import type { Metadata } from "next";
import { NewTimeSimForm } from "@/components/new-time-sim-form";

export const metadata: Metadata = { title: "New time simulation" };

export default function NewTimeSimPage() {
  return <NewTimeSimForm />;
}
