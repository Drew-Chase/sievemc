import {Icon} from "@iconify-icon/react";
import {useNavigate} from "react-router-dom";

const STEPS: {label: string; route: string}[] = [
    {label: "Select", route: "/"},
    {label: "Review", route: "/review"},
    {label: "Export", route: "/export"},
    {label: "Done", route: "/done"}
];

/**
 * The "1 Select · 2 Review · 3 Export · 4 Done" progress header shown on the
 * Review and Export screens (mockups 1d / 1f).
 *
 * Steps at or before the active one are clickable and navigate back to that
 * step; later steps are inert until reached.
 *
 * @param active zero-based index of the current step.
 * @param trailing optional right-aligned content (e.g. the source path + jar count).
 */
export function WizardStepper({active, trailing}: {active: number; trailing?: React.ReactNode})
{
    const navigate = useNavigate();

    return (
        <div className={"flex items-center gap-4 px-8 py-3.5 border-b border-border text-[12.5px] font-medium"}>
            {STEPS.map((step, i) =>
            {
                const done = i < active;
                const current = i === active;
                const clickable = i <= active;
                return (
                    <div key={step.label} className={"flex items-center gap-4"}>
                        <button
                            type={"button"}
                            disabled={!clickable}
                            onClick={() => clickable && navigate(step.route)}
                            className={`flex items-center gap-2 ${clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                            style={{color: current || done ? "var(--accent)" : "color-mix(in srgb, var(--foreground) 40%, transparent)"}}
                        >
                            <span
                                className={"w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold"}
                                style={
                                    current
                                        ? {background: "var(--accent)", color: "var(--accent-foreground)"}
                                        : done
                                            ? {background: "color-mix(in srgb, var(--accent) 20%, transparent)", color: "var(--accent)"}
                                            : {border: "1px solid var(--border-strong)"}
                                }
                            >
                                {done ? <Icon icon={"lucide:check"}/> : i + 1}
                            </span>
                            {step.label}
                        </button>
                        {i < STEPS.length - 1 && <span className={"w-6 h-px bg-border-strong"}/>}
                    </div>
                );
            })}
            {trailing && <div className={"ml-auto text-path"}>{trailing}</div>}
        </div>
    );
}
