import type { Metadata } from "next";
import { AnalysesList } from "@/components/analyses-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI Analyses" };

export default function AnalysesPage() {
  return <AnalysesList />;
}
