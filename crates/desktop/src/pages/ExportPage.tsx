import {useEffect, useMemo, useRef} from "react";
import {useNavigate} from "react-router-dom";
import {motion} from "framer-motion";
import {Button} from "@heroui/react";
import {Icon} from "@iconify-icon/react";
import * as dialog from "@tauri-apps/plugin-dialog";
import {useWizard} from "../state/WizardContext.tsx";
import {type ExportSide, isClientSide, isServerSide, type OutputType} from "../ts/sieve.ts";
import {WizardStepper} from "../components/WizardStepper.tsx";

/** Join path segments using the separator implied by the base path. */
function joinPath(base: string, ...parts: string[]): string
{
    const sep = base.includes("\\") ? "\\" : "/";
    return [base.replace(/[\\/]+$/, ""), ...parts].join(sep);
}

/**
 * Default destinations for a given output type.
 * - `directory`: separate `out/client-mods` + `out/server-mods` folders.
 * - `archive`: both point at `out` — the zips (`client.zip`/`server.zip`) are
 *   written directly inside it, so no extra subfolder is created.
 */
function defaultDest(directory: string, outputType: OutputType): {client: string; server: string}
{
    if (outputType === "archive")
    {
        const out = joinPath(directory, "out");
        return {client: out, server: out};
    }
    return {
        client: joinPath(directory, "out", "client-mods"),
        server: joinPath(directory, "out", "server-mods")
    };
}

const SIDE_CARDS: {value: ExportSide; title: string; dot: string}[] = [
    {value: "client", title: "Client pack", dot: "var(--color-side-client)"},
    {value: "server", title: "Server pack", dot: "var(--color-side-server)"},
    {value: "both", title: "Both — two outputs", dot: "linear-gradient(90deg,var(--color-side-client) 50%,var(--color-side-server) 50%)"}
];

const OUTPUT_CHIPS: {value: OutputType; label: string}[] = [
    {value: "directory", label: "Folders"},
    {value: "archive", label: "Zip archives"},
    {value: "list", label: "Just a list — no files copied"}
];

export default function ExportPage()
{
    const {state, effectiveSide, setExportConfig} = useWizard();
    const navigate = useNavigate();
    const {exportConfig: cfg, directory} = state;

    // Latest config, read inside the defaults effect without making it a dep.
    const cfgRef = useRef(cfg);
    cfgRef.current = cfg;
    // The last destinations we auto-filled; used to detect whether the user has
    // since customized a field (in which case we leave it alone).
    const autoRef = useRef({client: "", server: ""});

    // Seed / refresh default destinations whenever the directory or output type
    // changes, unless the user has manually overridden a destination.
    useEffect(() =>
    {
        if (!directory) return;
        const def = defaultDest(directory, cfg.outputType);
        const cur = cfgRef.current;
        const patch: Partial<typeof cur> = {};
        if (!cur.destClient || cur.destClient === autoRef.current.client)
        {
            patch.destClient = def.client;
            autoRef.current.client = def.client;
        }
        if (!cur.destServer || cur.destServer === autoRef.current.server)
        {
            patch.destServer = def.server;
            autoRef.current.server = def.server;
        }
        if (Object.keys(patch).length) setExportConfig(patch);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [directory, cfg.outputType]);

    const {clientCount, serverCount} = useMemo(() =>
    {
        let clientCount = 0, serverCount = 0;
        for (const mod of state.mods)
        {
            // Unsure mods count toward both sets — they'll be treated as both on export.
            const side = effectiveSide(mod);
            if (side === null || isClientSide(side)) clientCount++;
            if (side === null || isServerSide(side)) serverCount++;
        }
        return {clientCount, serverCount};
    }, [state.mods, effectiveSide]);

    const cardSubtitle = (value: ExportSide) =>
    {
        if (value === "client") return `Client-only + both-sides mods · ${clientCount} jars`;
        if (value === "server") return `Server-only + both-sides mods · ${serverCount} jars`;
        return "A client set and a server set, exported together";
    };

    const pickFolder = async (which: "client" | "server") =>
    {
        const current = which === "client" ? cfg.destClient : cfg.destServer;
        const picked = await dialog.open({directory: true, defaultPath: current || directory});
        if (typeof picked === "string")
        {
            setExportConfig(which === "client" ? {destClient: picked} : {destServer: picked});
        }
    };

    const cliPreview = useMemo(() =>
    {
        const outType = cfg.outputType === "list" ? "terminal" : cfg.outputType;
        const dest = cfg.outputType === "list" ? "" : ` -o ${cfg.side === "server" ? cfg.destServer : cfg.destClient}`;
        return `≈ sievemc ${directory} --side ${cfg.side} --output-type ${outType}${dest}`;
    }, [cfg, directory]);

    const showClientDest = cfg.outputType !== "list" && cfg.side !== "server";
    const showServerDest = cfg.outputType !== "list" && cfg.side !== "client";
    const exportLabel = cfg.side === "both" ? "Export 2 sets" : "Export";

    return (
        <motion.div
            className={"flex flex-col w-full h-full overflow-hidden"}
            initial={{opacity: 0}}
            animate={{opacity: 1}}
        >
            <WizardStepper active={2} trailing={<span>{directory} · {state.mods.length} jars</span>}/>

            <div className={"flex-1 overflow-y-auto px-[8%] py-7 flex flex-col"}>
                <h1 className={"text-page-title"}>Export</h1>
                <p className={"text-description mt-1.5 mb-6"}>Choose which side you care about and how you want the output.</p>

                {/* Side */}
                <div className={"text-section-label mb-2.5"}>Side</div>
                <div className={"grid grid-cols-3 gap-3"}>
                    {SIDE_CARDS.map(card =>
                    {
                        const selected = cfg.side === card.value;
                        return (
                            <button
                                key={card.value}
                                type={"button"}
                                onClick={() => setExportConfig({side: card.value})}
                                className={"relative text-left bg-surface border rounded-xl p-4 cursor-pointer transition-colors"}
                                style={selected
                                    ? {borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 7%, transparent)"}
                                    : {borderColor: "var(--border)"}}
                            >
                                <div className={"flex items-center gap-2"}>
                                    <span className={"w-2.5 h-2.5 rounded-sm"} style={{background: card.dot}}/>
                                    <span className={"text-card-title"}>{card.title}</span>
                                </div>
                                <div className={"text-caption mt-1.5"}>{cardSubtitle(card.value)}</div>
                                {selected && (
                                    <span
                                        className={"absolute top-3.5 right-3.5 w-4 h-4 rounded-full grid place-items-center text-[10px]"}
                                        style={{background: "var(--accent)", color: "var(--accent-foreground)"}}
                                    >
                                        <Icon icon={"lucide:check"}/>
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Output type */}
                <div className={"text-section-label mt-6 mb-2.5"}>Output type</div>
                <div className={"flex gap-2.5 flex-wrap"}>
                    {OUTPUT_CHIPS.map(chip =>
                    {
                        const selected = cfg.outputType === chip.value;
                        return (
                            <button
                                key={chip.value}
                                type={"button"}
                                onClick={() => setExportConfig({outputType: chip.value})}
                                className={"flex items-center gap-2 border rounded-lg px-4 py-2.5 text-[13px] font-medium cursor-pointer transition-colors"}
                                style={selected
                                    ? {borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 7%, transparent)"}
                                    : {borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted-foreground)"}}
                            >
                                <span
                                    className={"w-3.5 h-3.5 rounded-full grid place-items-center text-[9px] shrink-0"}
                                    style={selected
                                        ? {background: "var(--accent)", color: "var(--accent-foreground)"}
                                        : {border: "1.5px solid var(--border-strong)"}}
                                >
                                    {selected && <Icon icon={"lucide:check"}/>}
                                </span>
                                {chip.label}
                            </button>
                        );
                    })}
                </div>

                {/* Destination */}
                {cfg.outputType !== "list" && (
                    <>
                        <div className={"text-section-label mt-6 mb-2.5"}>Destination</div>
                        <div className={"flex flex-col gap-2.5"}>
                            {showClientDest && (
                                <DestRow
                                    label={"client →"}
                                    color={"var(--color-side-client)"}
                                    path={cfg.destClient}
                                    onChange={() => pickFolder("client")}
                                />
                            )}
                            {showServerDest && (
                                <DestRow
                                    label={"server →"}
                                    color={"var(--color-side-server)"}
                                    path={cfg.destServer}
                                    onChange={() => pickFolder("server")}
                                />
                            )}
                        </div>
                    </>
                )}

                <div className={"flex items-center gap-3.5 mt-auto pt-8"}>
                    <div className={"text-path truncate max-w-[55%]"}>{cliPreview}</div>
                    <Button variant={"tertiary"} className={"ml-auto"} onPress={() => navigate("/review")}>Back</Button>
                    <Button onPress={() => navigate("/exporting")}>
                        {exportLabel} <Icon icon={"lucide:arrow-right"}/>
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}

function DestRow({label, color, path, onChange}: {label: string; color: string; path: string; onChange: () => void})
{
    return (
        <div className={"flex items-center gap-2.5"}>
            <span className={"w-16 text-[12px] font-medium shrink-0"} style={{color}}>{label}</span>
            <div className={"flex-1 bg-surface-2 border border-border rounded-lg px-3.5 py-2.5 text-path truncate"}>
                {path || "—"}
            </div>
            <Button variant={"tertiary"} onPress={onChange}>Change</Button>
        </div>
    );
}
