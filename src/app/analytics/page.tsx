import { Suspense } from "react";
import AnalyticsView from "@/components/AnalyticsView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics · compound.",
  description: "Historical nutrition trends, daily calorie and protein intake against your goals.",
};

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <main className="app-shell">
          <div className="analytics-loading-card">
            <span className="spinner" />
            <span>Loading analytics...</span>
          </div>
        </main>
      }
    >
      <AnalyticsView />
    </Suspense>
  );
}
