"use client"

import * as React from "react"
import {
  Database,
  HardDrive,
  Terminal,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface ServiceResult {
  success: boolean
  data?: any
  error?: string
}

interface StatusPayload {
  timestamp: string
  branch?: string
  services: {
    postgres: ServiceResult
    objectStorage: ServiceResult
    functions: ServiceResult
    aiGateway: ServiceResult
  }
}

export function NeonDashboard() {
  const [loading, setLoading] = React.useState(false)
  const [status, setStatus] = React.useState<StatusPayload | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const fetchStatus = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/neon/status", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP error ${res.status}`)
      const data = await res.json()
      setStatus(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Neon Services Architecture</h2>
          <p className="text-sm text-muted-foreground">
            Lakebase Postgres, Object Storage, Functions, and AI Gateway wired to production branch
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status?.branch && (
            <Badge variant="outline" className="font-mono text-xs">
              Branch: {status.branch}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={fetchStatus}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Verifying..." : "Run Live Verification"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to fetch diagnostics: {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* 1. Postgres */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-primary" />
                <CardTitle>Lakebase Postgres</CardTitle>
              </div>
              {status?.services.postgres.success ? (
                <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="mr-1 size-3" /> Connected
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertTriangle className="mr-1 size-3" /> Error
                </Badge>
              )}
            </div>
            <CardDescription>
              Postgres connection via @neondatabase/serverless driver
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between border-b py-1">
              <span className="text-muted-foreground">Driver:</span>
              <span className="font-mono font-medium">@neondatabase/serverless (HTTP)</span>
            </div>
            <div className="flex justify-between border-b py-1">
              <span className="text-muted-foreground">Query Test:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">SELECT NOW(), version()</span>
            </div>
            {status?.services.postgres.data?.data && (
              <div className="rounded bg-muted p-2 font-mono text-[11px] leading-relaxed break-all">
                {status.services.postgres.data.data.pg_version}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Object Storage */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="size-4 text-primary" />
                <CardTitle>Object Storage</CardTitle>
              </div>
              {status?.services.objectStorage.success ? (
                <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="mr-1 size-3" /> S3 Verified
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertTriangle className="mr-1 size-3" /> Error
                </Badge>
              )}
            </div>
            <CardDescription>
              S3-compatible bucket &quot;assets&quot; branching with database
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between border-b py-1">
              <span className="text-muted-foreground">Bucket Name:</span>
              <span className="font-mono font-medium">assets (private)</span>
            </div>
            <div className="flex justify-between border-b py-1">
              <span className="text-muted-foreground">SDK Client:</span>
              <span className="font-mono">AWS SDK (@aws-sdk/client-s3)</span>
            </div>
            {status?.services.objectStorage.data && (
              <div className="rounded bg-muted p-2 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                ✓ PutObject & GetObject verified: Content matched byte-for-byte
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Functions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-primary" />
                <CardTitle>Neon Functions</CardTitle>
              </div>
              {status?.services.functions.success ? (
                <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="mr-1 size-3" /> Deployed (200 OK)
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertTriangle className="mr-1 size-3" /> Error
                </Badge>
              )}
            </div>
            <CardDescription>
              Long-running serverless function running close to data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between border-b py-1">
              <span className="text-muted-foreground">Function Name:</span>
              <span className="font-mono font-medium">hello</span>
            </div>
            <div className="flex justify-between border-b py-1">
              <span className="text-muted-foreground">Endpoint:</span>
              <span className="font-mono text-muted-foreground truncate max-w-[200px]">
                {status?.services.functions.data?.url || "NEON_FUNCTION_HELLO_BASE_URL"}
              </span>
            </div>
            {status?.services.functions.data?.response && (
              <div className="rounded bg-muted p-2 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                Response: &quot;{status.services.functions.data.response}&quot;
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4. AI Gateway */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="size-4 text-primary" />
                <CardTitle>AI Gateway</CardTitle>
              </div>
              <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mr-1 size-3" /> Free Plan Restricted
              </Badge>
            </div>
            <CardDescription>
              Model routing via Databricks Unity AI Gateway
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between border-b py-1">
              <span className="text-muted-foreground">Status:</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">Plan Upgrade Required</span>
            </div>
            <div className="rounded bg-muted/70 p-2 text-[11px] leading-relaxed text-muted-foreground">
              Neon rejects AI Gateway provisioning on the Free tier. Requires a paid Neon plan to enable model routing.
            </div>
          </CardContent>
        </Card>
      </div>

      {status?.timestamp && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          Last diagnostic run: {new Date(status.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
