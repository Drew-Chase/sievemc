import {useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {motion} from "framer-motion";
import {Button} from "@heroui/react";
import {Icon} from "@iconify-icon/react";
import {useWizard} from "../state/WizardContext.tsx";
import {type ModDetection, type Side} from "../ts/sieve.ts";
import {SideBadge, SideDot, sideColorVar} from "../components/SideBadge.tsx";
import {WizardStepper} from "../components/WizardStepper.tsx";
import {Dropdown, type DropdownOption} from "../components/Dropdown.tsx";

type Filter = "all" | "client" | "server" | "both" | "unsure";
type Sort = "side" | "name";

/** Best-effort friendly name from a jar filename ("sodium-fabric-0.6.13.jar" → "Sodium Fabric"). */
function prettyName(filename: string): string
{
    const base = filename.replace(/\.jar$/i, "");
    const cut = base.split(/[-_ ]\d/)[0];
    return cut
        .replace(/[-_]+/g, " ")
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase()) || base;
}

const OVERRIDE_OPTIONS: DropdownOption<"auto" | Side>[] = [
    {value: "auto", label: "Auto"},
    {value: "client-only", label: "Client"},
    {value: "server-only", label: "Server"},
    {value: "client-and-server", label: "Both"}
];

const RAIL: {key: Filter; label: string; side: Side | null}[] = [
    {key: "client", label: "Client only", side: "client-only"},
    {key: "server", label: "Server only", side: "server-only"},
    {key: "both", label: "Both sides", side: "client-and-server"},
    {key: "unsure", label: "Unsure", side: null}
];

export default function ReviewPage()
{
    const {state, effectiveSide, setOverride, clearOverride} = useWizard();
    const navigate = useNavigate();

    const [filter, setFilter] = useState<Filter>("all");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<Sort>("side");

    const counts = useMemo(() =>
    {
        const c = {all: state.mods.length, client: 0, server: 0, both: 0, unsure: 0};
        for (const mod of state.mods)
        {
            const side = effectiveSide(mod);
            if (side === "client-only") c.client++;
            else if (side === "server-only") c.server++;
            else if (side === "client-and-server") c.both++;
            else c.unsure++;
        }
        return c;
    }, [state.mods, effectiveSide]);

    const rows = useMemo(() =>
    {
        const matchesFilter = (mod: ModDetection) =>
        {
            const side = effectiveSide(mod);
            switch (filter)
            {
                case "all":
                    return true;
                case "client":
                    return side === "client-only";
                case "server":
                    return side === "server-only";
                case "both":
                    return side === "client-and-server";
                case "unsure":
                    return side === null;
            }
        };
        const q = search.trim().toLowerCase();
        const filtered = state.mods.filter(m => matchesFilter(m) && (q === "" || m.filename.toLowerCase().includes(q)));
        const sideRank: Record<string, number> = {"client-only": 0, "server-only": 1, "client-and-server": 2};
        return filtered.sort((a, b) =>
        {
            if (sort === "name") return a.filename.localeCompare(b.filename);
            const ra = a.side ? sideRank[a.side] : 3;
            const rb = b.side ? sideRank[b.side] : 3;
            return ra - rb || a.filename.localeCompare(b.filename);
        });
    }, [state.mods, effectiveSide, filter, search, sort]);

    const jarCount = state.mods.length;

    return (
        <motion.div
            className={"flex flex-col w-full h-full overflow-hidden"}
            initial={{opacity: 0}}
            animate={{opacity: 1}}
        >
            <WizardStepper active={1} trailing={<span>{state.directory} · {jarCount} jars</span>}/>

            <div className={"grid grid-cols-[210px_1fr] flex-1 min-h-0"}>
                {/* Filter rail */}
                <div className={"border-r border-border p-3.5 flex flex-col gap-1"}>
                    <RailItem
                        label={"All mods"}
                        count={counts.all}
                        active={filter === "all"}
                        onPress={() => setFilter("all")}
                    />
                    {RAIL.map(item => (
                        <RailItem
                            key={item.key}
                            label={item.label}
                            side={item.side}
                            count={counts[item.key]}
                            active={filter === item.key}
                            onPress={() => setFilter(item.key)}
                        />
                    ))}
                    {counts.unsure > 0 && (
                        <div
                            className={"mt-auto bg-surface border rounded-lg px-3 py-2.5 text-caption leading-relaxed"}
                            style={{borderColor: "color-mix(in srgb, var(--color-side-unsure) 30%, transparent)"}}
                        >
                            <span className={"font-semibold"} style={{color: "var(--color-side-unsure)"}}>
                                {counts.unsure} {counts.unsure === 1 ? "mod" : "mods"}
                            </span>{" "}
                            couldn't be detected automatically — review them before exporting.
                        </div>
                    )}
                </div>

                {/* Results */}
                <div className={"flex flex-col overflow-hidden"}>
                    <div className={"flex items-center gap-3 px-5 py-3.5 border-b border-border"}>
                        <div className={"flex-1 flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-2"}>
                            <Icon icon={"lucide:search"} className={"text-muted-foreground"}/>
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder={`Search ${jarCount} mods…`}
                                className={"bg-transparent outline-none w-full text-[12.5px]"}
                            />
                        </div>
                        <div className={"text-description flex items-center gap-1.5"}>
                            Sort:
                            <Dropdown
                                value={sort}
                                align={"right"}
                                onChange={setSort}
                                options={[{value: "side", label: "Detected side"}, {value: "name", label: "Name"}]}
                                renderTrigger={sel => (
                                    <span className={"flex items-center gap-1 text-surface-foreground"}>
                                        {sel?.label}<Icon icon={"lucide:chevron-down"} className={"opacity-50"}/>
                                    </span>
                                )}
                            />
                        </div>
                    </div>

                    {/* Column headers */}
                    <div className={"grid grid-cols-[1fr_130px_200px_120px] gap-3 px-5 py-2.5 text-section-label border-b border-border"}>
                        <span>Mod</span><span>Detected side</span><span>Evidence</span><span>Override</span>
                    </div>

                    {/* Rows */}
                    <div className={"flex-1 overflow-y-auto"}>
                        {rows.length === 0 && (
                            <div className={"text-description px-5 py-8 text-center"}>No mods match this filter.</div>
                        )}
                        {rows.map(mod =>
                        {
                            const override = state.overrides[mod.path];
                            const isUnsure = effectiveSide(mod) === null;
                            return (
                                <div
                                    key={mod.path}
                                    className={"grid grid-cols-[1fr_130px_200px_120px] gap-3 items-center px-5 py-2.5 border-b border-border/50"}
                                    style={mod.side === null && !override ? {background: "color-mix(in srgb, var(--color-side-unsure) 4%, transparent)"} : undefined}
                                >
                                    <div className={"flex items-center gap-3 min-w-0"}>
                                        <div className={"w-7 h-7 rounded-md bg-muted grid place-items-center shrink-0"}>
                                            <Icon icon={"lucide:package"} className={"text-muted-foreground text-[15px]"}/>
                                        </div>
                                        <div className={"min-w-0"}>
                                            <div className={"text-card-title truncate"}>{prettyName(mod.filename)}</div>
                                            <div className={"text-path truncate"}>{mod.filename}</div>
                                        </div>
                                    </div>
                                    <SideBadge side={effectiveSide(mod)}/>
                                    <span className={"text-evidence truncate"}>{mod.evidence}</span>
                                    <Dropdown
                                        value={(override ?? "auto") as "auto" | Side}
                                        options={OVERRIDE_OPTIONS}
                                        align={"right"}
                                        onChange={v => v === "auto" ? clearOverride(mod.path) : setOverride(mod.path, v)}
                                        renderTrigger={() => (
                                            <span
                                                className={"flex items-center gap-1 font-medium text-[12px]"}
                                                style={{color: override ? sideColorVar(override) : isUnsure ? "var(--color-side-unsure)" : "var(--muted-foreground)"}}
                                            >
                                                {override ? OVERRIDE_OPTIONS.find(o => o.value === override)?.label : isUnsure ? "Pick" : "Auto"}
                                                <Icon icon={"lucide:chevron-down"}/>
                                            </span>
                                        )}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className={"flex items-center gap-3.5 px-5 py-3.5 border-t border-border bg-surface-2"}>
                        <div className={"text-description flex items-center gap-1.5"}>
                            <SideDot side={"client-only"}/><span style={{color: "var(--color-side-client)"}} className={"font-semibold"}>{counts.client} client</span> ·
                            <SideDot side={"server-only"}/><span style={{color: "var(--color-side-server)"}} className={"font-semibold"}>{counts.server} server</span> ·
                            <span className={"font-semibold"}>{counts.both} both</span> ·
                            {counts.unsure > 0 && <span style={{color: "var(--color-side-unsure)"}} className={"font-semibold"}>{counts.unsure} unsure</span>}
                        </div>
                        <Button variant={"tertiary"} className={"ml-auto"} onPress={() => navigate("/scan")}>
                            <Icon icon={"lucide:refresh-cw"}/> Rescan
                        </Button>
                        <Button onPress={() => navigate("/export")}>
                            Continue to export <Icon icon={"lucide:arrow-right"}/>
                        </Button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function RailItem(
    {label, count, active, side, onPress}:
    {label: string; count: number; active: boolean; side?: Side | null; onPress: () => void})
{
    return (
        <button
            type={"button"}
            onClick={onPress}
            className={"flex justify-between items-center rounded-lg px-3 py-2.5 text-[12.5px] font-medium cursor-pointer transition-colors"}
            style={active
                ? {background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)"}
                : {color: "var(--muted-foreground)"}}
        >
            <span className={"flex items-center gap-2"}>
                {side !== undefined && <SideDot side={side}/>}
                {label}
            </span>
            <span className={"font-mono text-[11px]"}>{count}</span>
        </button>
    );
}
