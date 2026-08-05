import {load, type Store} from "@tauri-apps/plugin-store";
import type {ExportSide, OutputType} from "./sieve.ts";

/** How to treat mods whose side couldn't be detected when not reviewed. */
export type UnsureHandling = "both" | "client" | "server" | "skip";

export type Settings = {
    /** Pre-selected side on the export step. */
    defaultSide: ExportSide;
    /** Pre-selected output type on the export step. */
    defaultOutputType: OutputType;
    /** What an un-reviewed "unsure" mod becomes. */
    unsureAs: UnsureHandling;
    /** Show recently-used mods folders on the start screen. */
    rememberRecent: boolean;
    /** Check for updates when the app launches. */
    checkUpdates: boolean;
    /** Recently scanned folders, most-recent first. */
    recentFolders: string[];
};

export const DEFAULT_SETTINGS: Settings = {
    defaultSide: "both",
    defaultOutputType: "directory",
    unsureAs: "both",
    rememberRecent: true,
    checkUpdates: true,
    recentFolders: []
};

const STORE_FILE = "settings.json";
const KEY = "settings";
const MAX_RECENT = 6;

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store>
{
    if (!storePromise)
    {
        storePromise = load(STORE_FILE, {autoSave: true});
    }
    return storePromise;
}

/** Load persisted settings, falling back to defaults for any missing keys. */
export async function loadSettings(): Promise<Settings>
{
    try
    {
        const store = await getStore();
        const stored = await store.get<Partial<Settings>>(KEY);
        return {...DEFAULT_SETTINGS, ...(stored ?? {})};
    } catch
    {
        return {...DEFAULT_SETTINGS};
    }
}

/** Persist a full settings object. */
export async function saveSettings(settings: Settings): Promise<void>
{
    const store = await getStore();
    await store.set(KEY, settings);
    await store.save();
}

/** Record a folder as recently used (deduped, capped), if enabled. */
export async function pushRecentFolder(folder: string): Promise<void>
{
    const settings = await loadSettings();
    if (!settings.rememberRecent) return;
    const recentFolders = [folder, ...settings.recentFolders.filter(f => f !== folder)].slice(0, MAX_RECENT);
    await saveSettings({...settings, recentFolders});
}
