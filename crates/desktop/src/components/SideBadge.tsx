import type {Side} from "../ts/sieve.ts";
import {sideLabel} from "../ts/sieve.ts";

/** CSS custom property (from the theme) for each side's accent color. */
export function sideColorVar(side: Side | null): string
{
    switch (side)
    {
        case "client-only":
            return "var(--color-side-client)";
        case "server-only":
            return "var(--color-side-server)";
        case "client-and-server":
            return "var(--color-side-both)";
        default:
            return "var(--color-side-unsure)";
    }
}

/** A small colored dot for a side, used in rails, legends and summaries. */
export function SideDot({side, className = ""}: {side: Side | null; className?: string})
{
    return (
        <span
            className={`inline-block w-2 h-2 rounded-full ${className}`}
            style={{background: sideColorVar(side)}}
        />
    );
}

/** The CLIENT / SERVER / BOTH / UNSURE pill from the mockups. */
export function SideBadge({side}: {side: Side | null})
{
    const color = sideColorVar(side);
    return (
        <span
            className={"text-badge px-2.5 py-[3px] rounded-full border w-fit whitespace-nowrap"}
            style={{
                color,
                background: `color-mix(in srgb, ${color} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${color} 30%, transparent)`
            }}
        >
            {sideLabel(side)}
        </span>
    );
}
