import {invoke} from "@tauri-apps/api/core";
import {listen, type UnlistenFn} from "@tauri-apps/api/event";

// --- Types mirroring `crates/desktop/src-tauri/src/updater.rs` ---------------

/** A GitHub release newer than the running build. */
export type ReleaseInfo = {
    /** Tag with any leading `v` stripped, e.g. `0.2.2`. */
    version: string;
    name: string;
    /** Raw markdown release notes. */
    notes: string;
    publishedAt: string | null;
    /** Web page for the release — what portable builds open. */
    htmlUrl: string;
    /** `null` when the release published no NSIS installer asset. */
    installerUrl: string | null;
    installerSize: number | null;
};

export type UpdateStatus = {
    /** True when running from the directory the NSIS installer owns. */
    installed: boolean;
    currentVersion: string;
    /** `null` means up to date. */
    release: ReleaseInfo | null;
};

export type DownloadProgress = { downloaded: number; total: number };

// --- Command wrappers --------------------------------------------------------

/** Ask GitHub for the latest release and compare it against this build. */
export async function checkForUpdate(): Promise<UpdateStatus>
{
    return invoke<UpdateStatus>("check_for_update");
}

/** Download the installer to the temp dir; resolves with its path. */
export async function downloadUpdate(release: ReleaseInfo): Promise<string>
{
    if (!release.installerUrl) throw new Error("This release has no installer asset.");
    return invoke<string>("download_update", {
        url: release.installerUrl,
        version: release.version,
        expectedSize: release.installerSize
    });
}

/** Run the downloaded installer with `/S`. The app exits; the installer relaunches it. */
export async function installUpdate(installerPath: string): Promise<void>
{
    return invoke("install_update", {installerPath});
}

// --- Event helpers -----------------------------------------------------------

export function onDownloadProgress(handler: (p: DownloadProgress) => void): Promise<UnlistenFn>
{
    return listen<DownloadProgress>("update://download-progress", e => handler(e.payload));
}
