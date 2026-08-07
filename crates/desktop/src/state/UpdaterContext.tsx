import {createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {openUrl} from "@tauri-apps/plugin-opener";
import {
    checkForUpdate,
    downloadUpdate,
    installUpdate,
    onDownloadProgress,
    type ReleaseInfo,
    type UpdateStatus
} from "../ts/updater.ts";
import {loadSettings} from "../ts/settings.ts";

/**
 * Where the update flow currently is.
 *
 * - `idle`        — nothing found, or checking is disabled/unsupported.
 * - `checking`    — the GitHub call is in flight.
 * - `available`   — a newer release exists but isn't downloaded yet. Portable
 *                   builds stay here permanently: they never download.
 * - `downloading` — fetching the installer (installed builds only, automatic).
 * - `ready`       — installer on disk, waiting for the user to press install.
 * - `installing`  — installer launched; the app is about to be killed.
 * - `error`       — the check or download failed; `error` holds the message.
 */
export type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "ready" | "installing" | "error";

type UpdaterValue = {
    phase: UpdatePhase;
    /** The newer release, or null when up to date. */
    release: ReleaseInfo | null;
    /** False for the portable zip — it can't self-update. */
    installed: boolean;
    currentVersion: string;
    /** 0–1 while downloading, else null. */
    progress: number | null;
    error: string | null;
    /**
     * Primary action for the title-bar button: silently install on an installed
     * build, or open the release page in a browser on a portable one.
     */
    applyUpdate: () => Promise<void>;
    /** Re-run the check by hand (ignores the launch-check setting). */
    recheck: () => Promise<void>;
};

const UpdaterContext = createContext<UpdaterValue | null>(null);

export function UpdaterProvider({children}: {children: ReactNode})
{
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [phase, setPhase] = useState<UpdatePhase>("idle");
    const [progress, setProgress] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    /** Temp path of the downloaded installer, once `phase` reaches `ready`. */
    const installerPath = useRef<string | null>(null);

    // Download progress is streamed from Rust rather than polled.
    useEffect(() =>
    {
        let unlisten: (() => void) | undefined;
        onDownloadProgress(p => setProgress(p.total > 0 ? p.downloaded / p.total : null))
            .then(fn => unlisten = fn)
            .catch(e => console.error("Failed to subscribe to download progress", e));
        return () => unlisten?.();
    }, []);

    const run = useCallback(async () =>
    {
        setPhase("checking");
        setError(null);
        try
        {
            const result = await checkForUpdate();
            setStatus(result);

            if (!result.release)
            {
                setPhase("idle");
                return;
            }

            // Portable builds stop at "available": the only thing they offer is
            // the release page. Installed builds pre-fetch the installer so the
            // install button is instant — downloading is automatic, applying it
            // is not.
            if (!result.installed || !result.release.installerUrl)
            {
                setPhase("available");
                return;
            }

            setPhase("downloading");
            setProgress(0);
            installerPath.current = await downloadUpdate(result.release);
            setPhase("ready");
        } catch (e)
        {
            console.error("Update check failed", e);
            setError(`${e}`);
            setPhase("error");
        } finally
        {
            setProgress(null);
        }
    }, []);

    // A failed or skipped check must never block the app, so nothing here
    // rethrows — the title bar simply shows no update button.
    useEffect(() =>
    {
        loadSettings()
            .then(settings => settings.checkUpdates ? run() : undefined)
            .catch(e => console.error("Could not read update settings", e));
    }, [run]);

    const applyUpdate = useCallback(async () =>
    {
        const release = status?.release;
        if (!release) return;

        // No installed target to overwrite (or no asset to overwrite it with):
        // hand the user off to the release page instead.
        if (!status?.installed || !installerPath.current)
        {
            await openUrl(release.htmlUrl);
            return;
        }

        setPhase("installing");
        try
        {
            // Never returns on success — the installer kills this process.
            await installUpdate(installerPath.current);
        } catch (e)
        {
            console.error("Update install failed", e);
            setError(`${e}`);
            setPhase("error");
        }
    }, [status]);

    const value = useMemo<UpdaterValue>(() => ({
        phase,
        release: status?.release ?? null,
        installed: status?.installed ?? false,
        currentVersion: status?.currentVersion ?? "",
        progress,
        error,
        applyUpdate,
        recheck: run
    }), [phase, status, progress, error, applyUpdate, run]);

    return <UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>;
}

export function useUpdater(): UpdaterValue
{
    const context = useContext(UpdaterContext);
    if (!context) throw new Error("useUpdater must be used within an UpdaterProvider");
    return context;
}
