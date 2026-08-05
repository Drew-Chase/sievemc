import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {motion} from "framer-motion";
import {Button} from "@heroui/react";
import {useWizard} from "../state/WizardContext.tsx";
import {onScanProgress, scan, sideLabel, type ScanProgress} from "../ts/sieve.ts";
import {sideColorVar} from "../components/SideBadge.tsx";
import {toast} from "@heroui/react";

type Tally = {client: number; server: number; both: number; unsure: number};
const EMPTY: Tally = {client: 0, server: 0, both: 0, unsure: 0};

const TALLY_META: {key: keyof Tally; label: string; side: Parameters<typeof sideColorVar>[0]}[] = [
    {key: "client", label: "client", side: "client-only"},
    {key: "server", label: "server", side: "server-only"},
    {key: "both", label: "both", side: "client-and-server"},
    {key: "unsure", label: "unsure", side: null}
];

export default function ScanProgressPage()
{
    const {state, setMods} = useWizard();
    const navigate = useNavigate();

    const [progress, setProgress] = useState<ScanProgress | null>(null);
    const [tally, setTally] = useState<Tally>(EMPTY);
    const [log, setLog] = useState<ScanProgress[]>([]);
    const started = useRef(false);
    // Only set true by an explicit Cancel — NOT by effect cleanup, so that
    // StrictMode's mount→cleanup→mount cycle doesn't discard the scan result.
    const cancelledRef = useRef(false);

    useEffect(() =>
    {
        if (!state.directory)
        {
            navigate("/", {replace: true});
            return;
        }
        // Guard against React StrictMode's double-invoke of effects: the scan is
        // a one-shot we want to run to completion, so we start it exactly once.
        if (started.current) return;
        started.current = true;

        let unlisten: (() => void) | undefined;

        (async () =>
        {
            unlisten = await onScanProgress(p =>
            {
                if (cancelledRef.current) return;
                setProgress(p);
                setTally({client: p.client, server: p.server, both: p.both, unsure: p.unsure});
                setLog(prev => [p, ...prev].slice(0, 6));
            });

            try
            {
                const mods = await scan(state.directory);
                if (cancelledRef.current) return;
                setMods(mods);
                navigate("/review", {replace: true});
            } catch (e)
            {
                if (cancelledRef.current) return;
                toast.danger(`Scan failed: ${e}`);
                navigate("/", {replace: true});
            } finally
            {
                unlisten?.();
            }
        })();

        return () =>
        {
            // Deliberately do not cancel here — see cancelledRef above.
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pct = progress && progress.total > 0 ? Math.round((progress.index / progress.total) * 100) : 0;

    return (
        <motion.div
            className={"flex flex-col items-center justify-center w-full px-[12%]"}
            initial={{opacity: 0}}
            animate={{opacity: 1}}
        >
            <h1 className={"text-page-title mb-1.5"}>Scanning mods…</h1>
            <p className={"text-path mb-7 h-4"}>
                {progress
                    ? `reading jar ${progress.index} of ${progress.total} — ${progress.filename}`
                    : "opening directory…"}
            </p>

            <div className={"w-full h-2 bg-surface-2 rounded-full overflow-hidden mb-6"}>
                <motion.div
                    className={"h-full rounded-full"}
                    style={{background: "var(--accent)"}}
                    animate={{width: `${pct}%`}}
                    transition={{ease: "easeOut", duration: 0.2}}
                />
            </div>

            <div className={"flex gap-3 mb-8"}>
                {TALLY_META.map(m => (
                    <div
                        key={m.label}
                        className={"flex items-center gap-2 bg-surface px-4.5 py-2.5 rounded-lg border"}
                        style={{borderColor: `color-mix(in srgb, ${sideColorVar(m.side)} 25%, transparent)`}}
                    >
                        <span className={"w-2 h-2 rounded-sm"} style={{background: sideColorVar(m.side)}}/>
                        <span className={"text-[16px] font-bold"}>{tally[m.key]}</span>
                        <span className={"text-description"}>{m.label}</span>
                    </div>
                ))}
            </div>

            <div className={"w-full bg-surface-2 border border-border rounded-xl px-4.5 py-3.5 min-h-[132px]"}>
                {log.length === 0 && <div className={"text-log"}>waiting for first result…</div>}
                {log.map((entry, i) => (
                    <div key={`${entry.index}-${i}`} className={"text-log flex gap-3"}>
                        <span className={"w-14 shrink-0"} style={{color: sideColorVar(entry.side)}}>
                            {sideLabel(entry.side).toLowerCase()}
                        </span>
                        <span className={"truncate"}>{entry.filename} · {entry.evidence}</span>
                    </div>
                ))}
            </div>

            <Button
                variant={"tertiary"}
                className={"mt-6"}
                onPress={() =>
                {
                    cancelledRef.current = true;
                    navigate("/", {replace: true});
                }}
            >
                Cancel
            </Button>
        </motion.div>
    );
}
