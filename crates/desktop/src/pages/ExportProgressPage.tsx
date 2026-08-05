import {useEffect, useRef} from "react";
import {useNavigate} from "react-router-dom";
import {motion} from "framer-motion";
import {toast} from "@heroui/react";
import {useWizard} from "../state/WizardContext.tsx";
import {exportMods, type ExportItem, type ExportRequest, type Side} from "../ts/sieve.ts";

function withSep(base: string, name: string): string
{
    const sep = base.includes("\\") ? "\\" : "/";
    return `${base.replace(/[\\/]+$/, "")}${sep}${name}`;
}

export default function ExportProgressPage()
{
    const {state, effectiveSide, setReceipt} = useWizard();
    const navigate = useNavigate();
    const started = useRef(false);

    useEffect(() =>
    {
        if (state.mods.length === 0)
        {
            navigate("/", {replace: true});
            return;
        }
        if (started.current) return;
        started.current = true;

        const {side, outputType, destClient, destServer} = state.exportConfig;

        // Effective side per mod; un-reviewed "unsure" mods are treated as both (safe).
        const items: ExportItem[] = state.mods.map(mod => ({
            path: mod.path,
            side: (effectiveSide(mod) ?? "client-and-server") as Side
        }));

        // For archives, the destination is a .zip file; for folders it's the folder itself.
        const archive = outputType === "archive";
        const request: ExportRequest = {
            items,
            side,
            outputType,
            destClient: outputType === "list" ? null : archive ? withSep(destClient, "client.zip") : destClient,
            destServer: outputType === "list" ? null : archive ? withSep(destServer, "server.zip") : destServer
        };

        (async () =>
        {
            try
            {
                const receipt = await exportMods(request);
                setReceipt(receipt);
                navigate("/done", {replace: true});
            } catch (e)
            {
                toast.danger(`Export failed: ${e}`);
                navigate("/export", {replace: true});
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={"flex flex-col items-center justify-center w-full px-[12%]"}>
            <h1 className={"text-page-title mb-1.5"}>Exporting…</h1>
            <p className={"text-path mb-7"}>copying your sorted mod sets</p>
            <div className={"w-full h-2 bg-surface-2 rounded-full overflow-hidden"}>
                <motion.div
                    className={"h-full w-1/3 rounded-full"}
                    style={{background: "var(--accent)"}}
                    animate={{x: ["-100%", "300%"]}}
                    transition={{repeat: Infinity, duration: 1.1, ease: "easeInOut"}}
                />
            </div>
        </div>
    );
}
