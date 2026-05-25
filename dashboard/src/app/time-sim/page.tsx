import type { Metadata } from "next";
import { TimeSimList } from "@/components/time-sim-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Time Simulations" };

export default function TimeSimPage() {
  return <TimeSimList />;
}
