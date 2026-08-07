import {useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {motion} from "framer-motion";
import {Button, toast} from "@heroui/react";
import {Icon} from "@iconify-icon/react";
import {overrideKey, useWizard} from "../state/WizardContext.tsx";
import {openPath} from "../ts/sieve.ts";
import {SideDot} from "../components/SideBadge.tsx";

export default function DonePage()
{
    const {state, reset} = useWizard();
    const navigate = useNavigate();
    const {receipt, mods, overrides} = state;

    // Folder to reveal: for archives the output is a .zip file, so open its
    // containing directory; for folder exports open the output folder itself.
    const openTarget = (() =>
    {
        const first = receipt?.outputs[0];
        if (!first) return null;
        if (state.exportConfig.outputType !== "archive") return first;
        const idx = Math.max(first.lastIndexOf("\\"), first.lastIndexOf("/"));
        return idx > 0 ? first.slice(0, idx) : first;
    })();

    useEffect(() =>
    {
        if (!receipt) navigate("/", {replace: true});
    }, [receipt, navigate]);

    const stats = useMemo(() =>
    {
        let clientOnly = 0, serverOnly = 0, both = 0;
        for (const mod of mods)
        {
            const side = overrides[overrideKey(mod)] ?? mod.side;
            if (side === "client-only") clientOnly++;
            else if (side === "server-only") serverOnly++;
            else if (side === "client-and-server") both++;
        }
        return {clientOnly, serverOnly, both, decided: Object.keys(overrides).length};
    }, [mods, overrides]);

    if (!receipt) return null;

    const today = new Date().toISOString().slice(0, 10);

    const sieveAnother = () =>
    {
        reset();
        navigate("/", {replace: true});
    };

    // Text-only export: no files were written, so present copyable newline-
    // delimited lists of client and server mods instead of the sidebar receipt.
    if (state.exportConfig.outputType === "list")
    {
        return (
            <motion.div
                className={"flex flex-col w-full h-full overflow-hidden px-14 py-10"}
                initial={{opacity: 0}}
                animate={{opacity: 1}}
            >
                <div className={"text-accent font-mono text-[13px]"}>done in {(receipt.duration_ms / 1000).toFixed(1)}s</div>
                <h1 className={"text-[34px] font-bold leading-tight tracking-tight mt-2 mb-1"}>
                    {mods.length} mods, sorted.
                </h1>
                <p className={"text-description mb-6"}>Copy the lists below — nothing was written to disk.</p>

                <div className={"flex-1 grid grid-cols-2 gap-5 min-h-0"}>
                    {receipt.client.length > 0 && (
                        <CopyList title={"client-mods"} color={"var(--color-side-client)"} items={receipt.client}/>
                    )}
                    {receipt.server.length > 0 && (
                        <CopyList title={"server-mods"} color={"var(--color-side-server)"} items={receipt.server}/>
                    )}
                </div>

                <div className={"flex gap-3 mt-6"}>
                    <Button variant={"tertiary"} onPress={sieveAnother}>Sieve another</Button>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            className={"grid grid-cols-[1fr_400px] w-full h-full overflow-hidden"}
            initial={{opacity: 0}}
            animate={{opacity: 1}}
        >
            <div className={"px-14 flex flex-col justify-center"}>
                <div className={"text-accent font-mono text-[13px]"}>done in {(receipt.duration_ms / 1000).toFixed(1)}s</div>
                <h1 className={"text-[34px] font-bold leading-tight tracking-tight mt-2.5 mb-4"}>
                    {mods.length} mods,<br/>sorted.
                </h1>
                <div className={"flex flex-col gap-2.5 text-[14px]"}>
                    <StatLine side={"client-only"} count={stats.clientOnly} label={"client-only"} note={"— kept out of the server"}/>
                    <StatLine side={"server-only"} count={stats.serverOnly} label={"server-only"} note={"— kept out of the pack"}/>
                    <StatLine side={"client-and-server"} count={stats.both} label={"both sides"}/>
                    {stats.decided > 0 && <StatLine side={null} count={stats.decided} label={"decided by you"}/>}
                </div>
                <div className={"flex gap-3 mt-7"}>
                    {openTarget && (
                        <Button onPress={() => openPath(openTarget)}>
                            <Icon icon={"lucide:folder-open"}/> Open output folder
                        </Button>
                    )}
                    <Button variant={"tertiary"} onPress={sieveAnother}>Sieve another</Button>
                </div>
            </div>

            {/* Terminal-style receipt */}
            <div className={"border-l border-border bg-surface-2 px-7 py-8 text-log overflow-y-auto"}>
                <div className={"text-fg-faint"}># sievemc receipt · {today}</div>
                {receipt.client.length > 0 && (
                    <>
                        <div style={{color: "var(--color-side-client)"}} className={"mt-1"}>
                            client-mods\ ({receipt.client.length})
                        </div>
                        {receipt.client.slice(0, 6).map(f => <div key={`c-${f}`}>&nbsp;&nbsp;{f}</div>)}
                        {receipt.client.length > 6 && <div>&nbsp;&nbsp;…</div>}
                    </>
                )}
                {receipt.server.length > 0 && (
                    <>
                        <div style={{color: "var(--color-side-server)"}} className={"mt-2"}>
                            server-mods\ ({receipt.server.length})
                        </div>
                        {receipt.server.slice(0, 6).map(f => <div key={`s-${f}`}>&nbsp;&nbsp;{f}</div>)}
                        {receipt.server.length > 6 && <div>&nbsp;&nbsp;…</div>}
                    </>
                )}
                {stats.decided > 0 && (
                    <div className={"text-fg-faint mt-2"}># {stats.decided} manual override{stats.decided === 1 ? "" : "s"} logged</div>
                )}
            </div>
        </motion.div>
    );
}

function CopyList({title, color, items}: {title: string; color: string; items: string[]})
{
    const [copied, setCopied] = useState(false);
    const text = items.join("\n");

    const copy = async () =>
    {
        try
        {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch
        {
            toast.danger("Couldn't copy to clipboard");
        }
    };

    return (
        <div className={"flex flex-col min-h-0"}>
            <div className={"flex items-center justify-between mb-2"}>
                <span className={"text-section-label"} style={{color}}>{title} ({items.length})</span>
                <Button variant={"tertiary"} onPress={copy}>
                    <Icon icon={copied ? "lucide:check" : "lucide:copy"}/> {copied ? "Copied" : "Copy"}
                </Button>
            </div>
            <textarea
                readOnly
                value={text}
                onFocus={e => e.currentTarget.select()}
                className={"flex-1 min-h-0 resize-none bg-surface-2 border border-border rounded-lg p-3.5 font-mono text-[12.5px] text-surface-foreground focus:outline-none focus:border-border-strong"}
                spellCheck={false}
            />
        </div>
    );
}

function StatLine({side, count, label, note}: {side: Parameters<typeof SideDot>[0]["side"]; count: number; label: string; note?: string})
{
    return (
        <div className={"flex items-center gap-2.5"}>
            <SideDot side={side}/>
            {count} {label} {note && <span className={"text-muted-foreground"}>{note}</span>}
        </div>
    );
}
