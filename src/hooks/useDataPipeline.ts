import { useState, useEffect, useRef } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

interface SourceStatus {
  source: string;
  type: string;
  status: "LIVE" | "DEGRADED" | "DOWN" | "SCHEDULED";
  latency: number;
  lastCheck: string;
  credibilityScore: number;
  recordsEstimate: number;
  endpoint: string;
}

interface PipelineSummary {
  total: number;
  live: number;
  degraded: number;
  down: number;
  avgLatency: number;
  totalRecordsEstimate: number;
  overallHealth: number;
  avgCredibility: number;
}

interface PipelineData {
  sources: SourceStatus[];
  summary: PipelineSummary;
  timestamp: number;
}

export function useDataPipeline(pollInterval = 15_000) {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = async (force = false) => {
    try {
      const { data: result, error: err } = await governedInvoke<PipelineData>("data-pipeline-status", { force });
      if (err) throw err;
      if (result) setData(result);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Pipeline status fetch failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch_();
    intervalRef.current = setInterval(() => fetch_(), pollInterval);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [pollInterval]);

  return { data, loading, error, refresh: () => fetch_(true) };
}
