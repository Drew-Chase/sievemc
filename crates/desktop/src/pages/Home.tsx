import {Button, Tooltip} from "@heroui/react";
import {useEffect, useState} from "react";
import {getAppInfo} from "../ts/app_info.ts";
import * as dialog from "@tauri-apps/plugin-dialog";
import * as fs from "@tauri-apps/plugin-fs";
import {motion} from "framer-motion";
import {Icon} from "@iconify-icon/react";

export default function Home()
{
    const [version, setVersion] = useState("");
    const [build, setBuild] = useState("");
    const [directory, setDirectory] = useState("");
    const [correctDirectory, setCorrectDirectory] = useState(false);
    const [error, setError] = useState("");

    useEffect(() =>
    {

        getAppInfo().then(info =>
        {
            setBuild(info.build);
            setVersion(info.version);
        });
    }, []);

    useEffect(() =>
    {
        setCorrectDirectory(false);
        setError("");
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
                <motion.div
                    className={"absolute overflow-hidden"}
                    initial={{
                        right: 0
                    }}
                    animate={{
                        right: correctDirectory ? -50 : 0
                    }}

                >
                    <Tooltip delay={200}>
                        <Tooltip.Trigger>
                            <Button className={"rounded-xl"} size={"lg"} isIconOnly variant={"tertiary"}><Icon icon={"lucide:arrow-right"}/></Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>
                            Scan &amp; Continue
                        </Tooltip.Content>
                    </Tooltip>
                </motion.div>
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
                    // bottom: correctDirectory ? 16 : -50
                }}

            >
                <Button>Continue <Icon icon={"lucide:arrow-right"}/></Button>
            </motion.div>
        </div>
    );
}
