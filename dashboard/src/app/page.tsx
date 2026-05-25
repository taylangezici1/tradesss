import type { Metadata } from "next";
import { ScannerView } from "@/components/scanner-view";

export const metadata: Metadata = { title: "Scanner" };

export default function Home() {
  return <ScannerView />;
}
