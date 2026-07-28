import {invoke} from "@tauri-apps/api/core";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Forward a single log record to the Rust backend, where it is re-emitted as a
 * `tracing` event under the `frontend` target and written to the same rolling
 * log files as the native logs (see `src-tauri/src/util/logging.rs`).
 *
 * Failures to reach the backend are swallowed so logging can never break the
 * app — the original `console` output (see {@link attachConsoleToTracing}) is
 * always preserved as a fallback.
 */
function send(level: LogLevel, args: unknown[]): void
{
    const message = args
        .map(arg => (typeof arg === "string" ? arg : safeStringify(arg)))
        .join(" ");

    void invoke("log", {level, message, location: window.location.pathname}).catch(() =>
    {
        /* backend unreachable — nothing else we can do here */
    });
}

function safeStringify(value: unknown): string
{
    try
    {
        return JSON.stringify(value);
    } catch
    {
        return String(value);
    }
}

/**
 * Explicit logger for frontend code that wants to write straight to the
 * backend tracing pipeline without going through `console`.
 */
export const log = {
    trace: (...args: unknown[]) => send("trace", args),
    debug: (...args: unknown[]) => send("debug", args),
    info: (...args: unknown[]) => send("info", args),
    warn: (...args: unknown[]) => send("warn", args),
    error: (...args: unknown[]) => send("error", args)
};

const CONSOLE_LEVELS: Record<string, LogLevel> = {
    debug: "debug",
    log: "info",
    info: "info",
    warn: "warn",
    error: "error"
};

let attached = false;

/**
 * Patch the global `console` so every `console.debug/log/info/warn/error` call
 * is mirrored to the backend tracing pipeline in addition to its normal devtools
 * output. Idempotent — safe to call once at startup.
 */
export function attachConsoleToTracing(): void
{
    if (attached) return;
    attached = true;

    for (const [method, level] of Object.entries(CONSOLE_LEVELS))
    {
        const original = (console as unknown as Record<string, (...args: unknown[]) => void>)[method].bind(console);
        (console as unknown as Record<string, (...args: unknown[]) => void>)[method] = (...args: unknown[]) =>
        {
            send(level, args);
            original(...args);
        };
    }

    window.addEventListener("error", e => send("error", [e.message, e.filename + ":" + e.lineno]));
    window.addEventListener("unhandledrejection", e => send("error", ["Unhandled promise rejection:", e.reason]));
}
