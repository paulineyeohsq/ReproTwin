"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { CsvSchema } from "@/lib/csvSchemas";
import { UploadCloud, CheckCircle2, AlertTriangle } from "lucide-react";

interface ParseSummary {
  fileName: string;
  rowCount: number;
  dateRange: { start: string; end: string } | null;
  missingByColumn: { column: string; missing: number }[];
  missingColumns: string[];
}

export function CsvUploader({ schema }: { schema: CsvSchema }) {
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const fields = results.meta.fields ?? [];
        const normalizedFields = fields.map((f) => f.trim().toLowerCase());
        const missingColumns = schema.columns.filter(
          (c) => !normalizedFields.includes(c.toLowerCase())
        );

        const rows = results.data;
        const missingByColumn = schema.columns
          .filter((c) => !missingColumns.includes(c))
          .map((c) => {
            const actualKey = fields.find((f) => f.trim().toLowerCase() === c.toLowerCase())!;
            const missing = rows.filter(
              (r) => !r[actualKey] || r[actualKey].trim() === ""
            ).length;
            return { column: c, missing };
          });

        let dateRange: ParseSummary["dateRange"] = null;
        const tsKey = fields.find(
          (f) => f.trim().toLowerCase() === schema.timestampColumn.toLowerCase()
        );
        if (tsKey) {
          const timestamps = rows
            .map((r) => r[tsKey])
            .filter(Boolean)
            .map((t) => new Date(t))
            .filter((d) => !isNaN(d.getTime()))
            .sort((a, b) => a.getTime() - b.getTime());
          if (timestamps.length > 0) {
            dateRange = {
              start: timestamps[0].toISOString(),
              end: timestamps[timestamps.length - 1].toISOString(),
            };
          }
        }

        setSummary({
          fileName: file.name,
          rowCount: rows.length,
          dateRange,
          missingByColumn,
          missingColumns,
        });
      },
      error: (err) => setError(err.message),
    });
  }

  return (
    <Card>
      <CardHeader
        title={schema.label}
        subtitle={`Expected columns: ${schema.columns.join(", ")}`}
      />
      <CardBody className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <UploadCloud className="h-3.5 w-3.5" /> Upload {schema.label} CSV
        </Button>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-rose-600">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </p>
        )}

        {summary && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs">
            <div className="mb-2 flex items-center gap-1.5 font-medium text-slate-700">
              {summary.missingColumns.length === 0 ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              )}
              {summary.fileName}
            </div>
            {summary.missingColumns.length > 0 && (
              <Badge className="mb-2 border-rose-200 bg-rose-50 text-rose-700">
                Missing columns: {summary.missingColumns.join(", ")}
              </Badge>
            )}
            <dl className="grid grid-cols-2 gap-2 text-slate-600">
              <div>
                <dt className="text-slate-400">Records</dt>
                <dd className="font-medium">{summary.rowCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Date range</dt>
                <dd className="font-medium">
                  {summary.dateRange
                    ? `${summary.dateRange.start.slice(0, 10)} → ${summary.dateRange.end.slice(0, 10)}`
                    : "—"}
                </dd>
              </div>
            </dl>
            {summary.missingByColumn.some((m) => m.missing > 0) && (
              <div className="mt-2">
                <dt className="text-slate-400">Missing values</dt>
                <ul className="mt-1 space-y-0.5">
                  {summary.missingByColumn
                    .filter((m) => m.missing > 0)
                    .map((m) => (
                      <li key={m.column} className="text-slate-600">
                        {m.column}: {m.missing}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
