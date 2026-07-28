import {Button} from "@heroui/react";
import {useEffect, useState} from "react";
import {getAppInfo} from "../ts/app_info.ts";

export default function Home()
{
    const [version, setVersion] = useState("");
    const [build, setBuild] = useState("");
    useEffect(() =>
    {

        getAppInfo().then(info =>
        {
            setBuild(info.build);
            setVersion(info.version);
        });
    }, []);
    return (
        <div className={"flex flex-col justify-center max-w-155 mx-30"}>
            <p className={"text-accent font-mono text-[14px] mb-3.5"}>$ sievemc ./mods --side both</p>
            <h1 className="text-hero">Stop hand-sorting your mods folder.</h1>
            <p className={"text-description mt-4 mb-10 max-w-130"}>SieveMC reads every jar and tells you which mods are client-only, server-only, or needed on both sides — then exports clean sets for your modpack and your server.</p>
            <div className={"flex flex-row items-center bg-surface-2 border border-border rounded-xl w-160 h-12 overflow-hidden"}>
                <span className={"pl-4 text-path opacity-65"}>mods/</span>
                <input
                    placeholder="drag a folder here, paste a path, or browse"
                    className={"w-full focus:outline-none px-2 font-mono text-[13px] text-surface-foreground h-full"}
                />
                <Button className={"rounded-none h-full"}>Browse</Button>
            </div>

            <div className={"absolute bottom-4 left-30 text-path opacity-65"}>
                v{version} · build {build} · by Drew Chase
            </div>
        </div>
    );
}