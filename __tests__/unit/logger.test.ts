import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  logAudit,
  addLogSink,
  clearLogSinks,
  startTimer,
  type AuditEntry,
} from "../../src/logger.js";

describe("logger", () => {
  beforeEach(() => {
    clearLogSinks();
  });

  it("calls all registered sinks", () => {
    const sink1 = vi.fn();
    const sink2 = vi.fn();
    addLogSink(sink1);
    addLogSink(sink2);

    const entry: AuditEntry = {
      timestamp: "2025-01-01T00:00:00.000Z",
      tool: "run_query",
      database: "test-db",
      query: "SELECT 1",
      durationMs: 42,
      rowCount: 1,
    };

    logAudit(entry);
    expect(sink1).toHaveBeenCalledWith(entry);
    expect(sink2).toHaveBeenCalledWith(entry);
  });

  it("does not throw if a sink throws", () => {
    addLogSink(() => { throw new Error("broken sink"); });
    const good = vi.fn();
    addLogSink(good);

    const entry: AuditEntry = {
      timestamp: "2025-01-01T00:00:00.000Z",
      tool: "test",
      database: "test",
      durationMs: 0,
    };

    expect(() => logAudit(entry)).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it("logs blocked queries with reason", () => {
    const sink = vi.fn();
    addLogSink(sink);

    logAudit({
      timestamp: "2025-01-01T00:00:00.000Z",
      tool: "run_query",
      database: "test",
      durationMs: 1,
      blocked: true,
      blockedReason: "Blocked keyword: DELETE",
    });

    expect(sink.mock.calls[0][0].blocked).toBe(true);
    expect(sink.mock.calls[0][0].blockedReason).toContain("DELETE");
  });

  it("clearLogSinks removes all sinks", () => {
    const sink = vi.fn();
    addLogSink(sink);
    clearLogSinks();

    logAudit({
      timestamp: "2025-01-01T00:00:00.000Z",
      tool: "test",
      database: "test",
      durationMs: 0,
    });

    expect(sink).not.toHaveBeenCalled();
  });

  it("startTimer returns elapsed milliseconds", async () => {
    const elapsed = startTimer();
    await new Promise((r) => setTimeout(r, 10));
    expect(elapsed()).toBeGreaterThanOrEqual(0);
  });
});
