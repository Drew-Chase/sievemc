import {Button} from "@heroui/react";
import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {getAppInfo} from "../ts/app_info.ts";
import * as dialog from "@tauri-apps/plugin-dialog";
import * as fs from "@tauri-apps/plugin-fs";
import {motion} from "framer-motion";
import {Icon} from "@iconify-icon/react";
import {useWizard} from "../state/WizardContext.tsx";
import {loadSettings, pushRecentFolder} from "../ts/settings.ts";

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

    useEffect(() =>
    {

        getAppInfo().then(info =>
        {
            setBuild(info.build);
            setVersion(info.version);
        });
        loadSettings().then(s => setRecent(s.rememberRecent ? s.recentFolders : []));
    }, []);

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
        fs.exists(directory).then(async exists =>
        {
            if (exists)
            {
                const entries = await fs.readDir(directory);
                let hasJar = false;
                for (const entry of entries)
                {
                    if (entry.isFile && entry.name.endsWith(".jar"))
                    {
                        setCorrectDirectory(true);
                        hasJar = true;
                        break;
                    }
                }
                if (!hasJar)
                {
                    setError("Error: Directory doesn't contain any mod jar files");
                }
            } else
            {
                setError("Error: Could not read directory");
            }
        });
    }, [directory]);

    return (

        <div className={"flex flex-col justify-center max-w-160 mx-30"}>
            <p className={"text-accent font-mono text-[14px] mb-3.5"}>$ sievemc ./mods --side both</p>
            <h1 className="text-hero">Stop hand-sorting your mods folder.</h1>
            <p className={"text-description mt-4 mb-10 max-w-130"}>SieveMC reads every jar and tells you which mods are client-only, server-only, or needed on both sides — then exports clean sets for your modpack and your server.</p>
            <div className={"flex flex-row items-center bg-surface-2 border border-border rounded-xl w-160 h-12 relative"}>
                <div className={"flex flex-row items-center bg-surface-2 border border-border rounded-xl w-160 h-12 overflow-hidden relative z-10"}>
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
                            <button
                                key={folder}
                                type={"button"}
                                onClick={() => setDirectory(folder)}
                                className={"text-path bg-surface-2 border border-border rounded-lg px-3 py-1.5 hover:border-border-strong cursor-pointer max-w-80 truncate"}
                            >
                                {folder}
                            </button>
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
