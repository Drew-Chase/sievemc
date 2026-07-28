import {invoke} from "@tauri-apps/api/core";

type AppInfo = {
    build: string,
    version: string,
}

export async function getAppInfo(): Promise<AppInfo>
{
    return JSON.parse(await invoke("get_versions")) as AppInfo;
}