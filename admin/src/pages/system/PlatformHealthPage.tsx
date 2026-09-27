import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/lib/api";
import { Card } from "@/components/ui";
import Pagination from "@/components/ui/Pagination";
import { SkeletonCardGrid } from "@/components/ui/Skeleton";
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, Clock, Zap, RefreshCw,
} from "lucide-react";

interface ServiceHealthEntry {
  status: "up" | "degraded" | "down";
  http_status?: number;
  url: string;
  error?: string;
}
interface ServiceHealthResponse {
  gateway: string;
  overall: "healthy" | "degraded";
  services: Record<string, ServiceHealthEntry>;
}
interface RouteMetric {
  route: string;
  service: string;
  avg_ms?: number;
  requests_per_sec?: number;
}
interface MetricsSummaryResponse {
  available: boolean;
  reason?: string;
  slowest: RouteMetric[];
  most_used: RouteMetric[];
}

const PAGE_SIZE = 10;

function StatusBadge({ status }: { status: ServiceHealthEntry["status"] }) {
  const map = {
    up: { icon: CheckCircle2, cls: "text-success-600 bg-success-50 dark:bg-success-900/20 dark:text-success-400" },
    degraded: { icon: AlertTriangle, cls: "text-warning-600 bg-warning-50 dark:bg-warning-900/20 dark:text-warning-400" },
    down: { icon: XCircle, cls: "text-danger-600 bg-danger-50 dark:bg-danger-900/20 dark:text-danger-400" },
  }[status];
  const Icon = map.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${map.cls}`}>
      <Icon className="w-3.5 h-3.5" /> {status}
    </span>
  );
}

function PaginatedTable<T>({
  rows, columns,
}: {
  rows: T[];
  columns: { header: string; render: (row: T) => React.ReactNode; align?: "left" | "right" }[];
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No data yet.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">
              {columns.map((c) => (
                <th key={c.header} className={`pb-2 font-semibold ${c.align === "right" ? "text-right" : ""}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {pageRows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.header} className={`py-2.5 ${c.align === "right" ? "text-right" : ""}`}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        summary={`${page * PAGE_SIZE + 1}–${Math.min(rows.length, (page + 1) * PAGE_SIZE)} of ${rows.length}`}
      />
    </div>
  );
}

export default function PlatformHealthPage() {
  const { data: health, isLoading: healthLoading, dataUpdatedAt } = useQuery({
    queryKey: ["platform-health"],
    queryFn: () => analyticsApi.serviceHealth().then((r) => r.data as ServiceHealthResponse),
    refetchInterval: 15_000,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["platform-metrics-summary"],
    queryFn: () => analyticsApi.metricsSummary().then((r) => r.data as MetricsSummaryResponse),
    refetchInterval: 30_000,
  });

  const services = Object.entries(health?.services ?? {});
  const upCount = services.filter(([, s]) => s.status === "up").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary-600" /> Platform Health
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Live status of every backend service, refreshed automatically.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {healthLoading ? (
        <SkeletonCardGrid count={3} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {health?.overall === "healthy" ? (
                <span className="text-success-600">Healthy</span>
              ) : (
                <span className="text-warning-600">Degraded</span>
              )}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Overall platform status</p>
          </Card>
          <Card>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{upCount} / {services.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Services up</p>
          </Card>
          <Card>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {metrics?.available ? `${metrics.slowest.length + metrics.most_used.length}` : "—"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Routes tracked (Prometheus)</p>
          </Card>
        </div>
      )}

      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Service Status</h3>
        {healthLoading ? (
          <SkeletonCardGrid count={4} />
        ) : (
          <PaginatedTable
            rows={services}
            columns={[
              { header: "Service", render: ([name]) => <span className="font-medium text-gray-900 dark:text-gray-100">{name}</span> },
              { header: "Status", render: ([, s]) => <StatusBadge status={s.status} /> },
              { header: "URL", render: ([, s]) => <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{s.url}</span> },
              {
                header: "Detail", render: ([, s]) => (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {s.error ? s.error : s.http_status ? `HTTP ${s.http_status}` : "—"}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" /> Slowest Routes (avg, last 10m)
          </h3>
          {metricsLoading ? (
            <SkeletonCardGrid count={3} />
          ) : !metrics?.available ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">{metrics?.reason ?? "Metrics unavailable."}</p>
          ) : (
            <PaginatedTable
              rows={metrics.slowest}
              columns={[
                { header: "Route", render: (r) => <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{r.route}</span> },
                { header: "Service", render: (r) => <span className="text-xs text-gray-500 dark:text-gray-400">{r.service}</span> },
                { header: "Avg", render: (r) => <span className="font-semibold text-gray-900 dark:text-gray-100">{r.avg_ms}ms</span>, align: "right" },
              ]}
            />
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-gray-400" /> Most-Used Routes (req/s, last 10m)
          </h3>
          {metricsLoading ? (
            <SkeletonCardGrid count={3} />
          ) : !metrics?.available ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">{metrics?.reason ?? "Metrics unavailable."}</p>
          ) : (
            <PaginatedTable
              rows={metrics.most_used}
              columns={[
                { header: "Route", render: (r) => <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{r.route}</span> },
                { header: "Service", render: (r) => <span className="text-xs text-gray-500 dark:text-gray-400">{r.service}</span> },
                { header: "Rate", render: (r) => <span className="font-semibold text-gray-900 dark:text-gray-100">{r.requests_per_sec}/s</span>, align: "right" },
              ]}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
