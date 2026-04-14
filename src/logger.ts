// ============================================================
// Audit Logger — structured query audit trail
// ============================================================

export interface AuditEntry {
  readonly timestamp: string;
  readonly tool: string;
  readonly database: string;
  readonly query?: string;
  readonly durationMs: number;
  readonly rowCount?: number;
  readonly blocked?: boolean;
  readonly blockedReason?: string;
  readonly error?: string;
}

type LogSink = (entry: AuditEntry) => void;

const sinks: LogSink[] = [];

export function addLogSink(sink: LogSink): void {
  sinks.push(sink);
}

export function clearLogSinks(): void {
  sinks.length = 0;
}

function stderrSink(entry: AuditEntry): void {
  console.error(JSON.stringify({ audit: true, ...entry }));
}

// Register default sink
sinks.push(stderrSink);

export function logAudit(entry: AuditEntry): void {
  for (const sink of sinks) {
    try {
      sink(entry);
    } catch {
      // Never let a sink failure break the tool
    }
  }
}

export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
