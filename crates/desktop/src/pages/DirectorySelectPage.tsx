import {Button} from "@heroui/react";
import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {getAppInfo} from "../ts/app_info.ts";
import * as dialog from "@tauri-apps/plugin-dialog";
import * as fs from "@tauri-apps/plugin-fs";
import {getCurrentWebview} from "@tauri-apps/api/webview";
import {motion} from "framer-motion";
import {Icon} from "@iconify-icon/react";
import {useWizard} from "../state/WizardContext.tsx";
import {loadSettings, pushRecentFolder, removeRecentFolder} from "../ts/settings.ts";

export default function DirectorySelectPage()
{
    const navigate = useNavigate();
    const {setDirectory: commitDirectory} = useWizard();
    const [version, setVersion] = useState("");
    const [build, setBuild] = useState("");
    const [directory, setDirectory] = useState("");
    const [correctDirectory, setCorrectDirectory] = useState(false);
    const [error, setError] = useState("");
    const [recent, setRecent] = useState<string[]>([]);
    const [dragOver, setDragOver] = useState(false);

    useEffect(() =>
    {

        getAppInfo().then(info =>
        {
            setBuild(info.build);
            setVersion(info.version);
        });
        loadSettings().then(s => setRecent(s.rememberRecent ? s.recentFolders : []));
    }, []);

    // Accept a folder dropped anywhere on this window. The dropped path may be a
    // directory (use it directly) or a file (fall back to its parent folder).
    useEffect(() =>
    {
        let ignore = false;
        const unlistenPromise = getCurrentWebview().onDragDropEvent(async event =>
        {
            if (ignore) return;
            if (event.payload.type === "over" || event.payload.type === "enter")
            {
                setDragOver(true);
                return;
            }
            if (event.payload.type === "leave")
            {
                setDragOver(false);
                return;
            }
            if (event.payload.type === "drop")
            {
                setDragOver(false);
                const dropped = event.payload.paths[0];
                if (!dropped) return;
                try
                {
                    const isDir = (await fs.stat(dropped)).isDirectory;
                    if (isDir)
                    {
                        setDirectory(dropped);
                    } else
                    {
                        const idx = Math.max(dropped.lastIndexOf("\\"), dropped.lastIndexOf("/"));
                        if (idx > 0) setDirectory(dropped.slice(0, idx));
                    }
                } catch
                {
                    // Ignore unreadable drops; validation effect surfaces any error.
                }
            }
        });
        return () =>
        {
            ignore = true;
            unlistenPromise.then(unlisten => unlisten());
        };
    }, []);

    const removeRecent = async (folder: string) =>
    {
        await removeRecentFolder(folder);
        setRecent(prev => prev.filter(f => f !== folder));
    };

    const startScan = async () =>
    {
        commitDirectory(directory);
        await pushRecentFolder(directory);
        navigate("/scan");
    };

    useEffect(() =>
    {
        setCorrectDirectory(false);
        setError("");
        if (directory === "") return;
        // Guard against a stale async resolution clobbering the state for a newer
        // directory value (or after unmount). Without this, re-entering a folder
        // could leave the Continue button hidden even for a valid directory.
        let ignore = false;
        fs.exists(directory).then(async exists =>
        {
            if (!exists)
            {
                if (!ignore) setError("Error: Could not read directory");
                return;
            }
            const entries = await fs.readDir(directory);
            if (ignore) return;
            const hasJar = entries.some(entry => entry.isFile && entry.name.endsWith(".jar"));
            if (hasJar)
            {
                setCorrectDirectory(true);
            } else
            {
                setError("Error: Directory doesn't contain any mod jar files");
            }
        }).catch(() =>
        {
            if (!ignore) setError("Error: Could not read directory");
        });
        return () =>
        {
            ignore = true;
        };
    }, [directory]);

    return (

        <div className={"flex flex-col justify-center max-w-160 mx-30"}>
            <p className={"text-accent font-mono text-[14px] mb-3.5"}>$ sievemc ./mods --side both</p>
            <h1 className="text-hero">Stop hand-sorting your mods folder.</h1>
            <p className={"text-description mt-4 mb-10 max-w-130"}>SieveMC reads every jar and tells you which mods are client-only, server-only, or needed on both sides — then exports clean sets for your modpack and your server.</p>
            <div className={"flex flex-row items-center bg-surface-2 border border-border rounded-xl w-160 h-12 relative"}>
                <div
                    className={"flex flex-row items-center bg-surface-2 border rounded-xl w-160 h-12 overflow-hidden relative z-10 transition-colors"}
                    style={{borderColor: dragOver ? "var(--accent)" : "var(--border)"}}
                >
                    <span className={"pl-4 text-path opacity-65"}>mods/</span>
                    <input
                        placeholder="drag a folder here, paste a path, or browse"
                        className={"w-full focus:outline-none px-2 font-mono text-[13px] text-surface-foreground h-full"}
                        value={directory}
                        onChange={(e) => setDirectory(e.target.value)}
                    />
                    <Button
                        className={"rounded-none h-full"}
                        onPress={async () =>
                        {
                            const path = await dialog.open({
                                directory: true,
                                defaultPath: directory
                            });
                            if (path)
                            {
                                setDirectory(path);
                            }
                        }}
                    >
                        Browse
                    </Button>

                </div>

                <motion.p
                    className={"absolute overflow-hidden left-2 text-danger italic underline"}
                    initial={{
                        bottom: -10
                    }}
                    animate={{
                        bottom: error != "" ? -30 : 0
                    }}

                >
                    {error}
                </motion.p>
            </div>

            {recent.length > 0 && (
                <div className={"mt-6 flex flex-col gap-1.5"}>
                    <div className={"text-section-label"}>Recent folders</div>
                    <div className={"flex flex-wrap gap-2"}>
                        {recent.map(folder => (
                            <div
                                key={folder}
                                className={"group flex items-center gap-1.5 text-path bg-surface-2 border border-border rounded-lg pl-3 pr-1.5 py-1.5 hover:border-border-strong"}
                            >
                                <button
                                    type={"button"}
                                    onClick={() => setDirectory(folder)}
                                    className={"cursor-pointer max-w-80 truncate"}
                                >
                                    {folder}
                                </button>
                                <button
                                    type={"button"}
                                    aria-label={`Remove ${folder} from recent folders`}
                                    onClick={() => removeRecent(folder)}
                                    className={"grid place-items-center w-5 h-5 rounded text-muted-foreground hover:text-surface-foreground hover:bg-surface cursor-pointer shrink-0"}
                                >
                                    <Icon icon={"lucide:x"}/>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className={"mt-6 flex gap-6 text-[12.5px]"} style={{color: "var(--muted-foreground)"}}>
                <button type={"button"} className={"cursor-pointer hover:text-surface-foreground"} onClick={() => navigate("/settings")}>Settings</button>
                <a href={"https://github.com/drew-chase/sievemc"} target={"_blank"} rel={"noreferrer"} className={"cursor-pointer hover:text-surface-foreground"}>Docs</a>
            </div>

            <div className={"absolute bottom-4 left-30 text-path opacity-65"}>
                v{version} · build {build} · by Drew Chase
            </div>
            <motion.div
                className={"absolute bottom-4 right-16"}
                initial={{
                    bottom: -50
                }}
                animate={{
                    bottom: correctDirectory ? 16 : -50
                }}

            >
                <Button onPress={startScan}>Scan &amp; Continue <Icon icon={"lucide:arrow-right"}/></Button>
            </motion.div>
        </div>
    );
}
