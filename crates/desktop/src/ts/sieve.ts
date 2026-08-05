import {invoke} from "@tauri-apps/api/core";
import {listen, type UnlistenFn} from "@tauri-apps/api/event";

// --- Types mirroring the Rust core (`crates/lib`) serde output ---------------

/** Serialized `sievemc::Side` (kebab-case). */
export type Side = "client-only" | "server-only" | "client-and-server";

/** Which side(s) an export targets. `sievemc::ExportSide`. */
export type ExportSide = "client" | "server" | "both";

/** How an export is written. `sievemc::OutputType`. */
export type OutputType = "directory" | "archive" | "list";

/** A single classified mod jar (`sievemc::ModDetection`). `side: null` == unsure. */
export type ModDetection = {
    path: string;
    filename: string;
    side: Side | null;
    evidence: string;
    loader: string | null;
};

/** Live per-jar update streamed on `sieve://scan-progress`. */
export type ScanProgress = {
    index: number;
    total: number;
    filename: string;
    side: Side | null;
    evidence: string;
    client: number;
    server: number;
    both: number;
    unsure: number;
};

export type ExportItem = { path: string; side: Side };

export type ExportRequest = {
    items: ExportItem[];
    side: ExportSide;
    outputType: OutputType;
    destClient?: string | null;
    destServer?: string | null;
};

export type ExportReceipt = {
    client: string[];
    server: string[];
    outputs: string[];
    duration_ms: number;
};

// --- Command wrappers --------------------------------------------------------

/** Scan a mods directory. Progress streams via {@link onScanProgress}. */
export async function scan(directory: string): Promise<ModDetection[]>
{
    return invoke<ModDetection[]>("scan", {directory});
}

/** Export the reviewed set to disk and return the receipt. */
export async function exportMods(request: ExportRequest): Promise<ExportReceipt>
{
    return invoke<ExportReceipt>("export", {request});
}

/** Reveal a path in the OS file manager. */
export async function openPath(path: string): Promise<void>
{
    return invoke("open_path", {path});
}

// --- Event helpers -----------------------------------------------------------

export function onScanProgress(handler: (p: ScanProgress) => void): Promise<UnlistenFn>
{
    return listen<ScanProgress>("sieve://scan-progress", e => handler(e.payload));
}

// --- Small shared helpers ----------------------------------------------------

/** True when a mod belongs in a client export (client-only or both). */
export function isClientSide(side: Side | null): boolean
{
    return side === "client-only" || side === "client-and-server";
}

/** True when a mod belongs in a server export (server-only or both). */
export function isServerSide(side: Side | null): boolean
{
    return side === "server-only" || side === "client-and-server";
}

/** Short uppercase badge label for a side. */
export function sideLabel(side: Side | null): "CLIENT" | "SERVER" | "BOTH" | "UNSURE"
{
    switch (side)
    {
        case "client-only":
            return "CLIENT";
        case "server-only":
            return "SERVER";
        case "client-and-server":
            return "BOTH";
        default:
            return "UNSURE";
    }
}
