import {motion} from "framer-motion";

/** The pill switch from the Settings / start-script mockups (32×18, sliding thumb). */
export function Toggle({checked, onChange}: {checked: boolean; onChange: (value: boolean) => void})
{
    return (
        <button
            type={"button"}
            role={"switch"}
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={"relative w-8 h-[18px] rounded-full cursor-pointer shrink-0 transition-colors"}
            style={{background: checked ? "var(--accent)" : "var(--border-strong)"}}
        >
            <motion.span
                className={"absolute top-[2px] w-3.5 h-3.5 rounded-full"}
                style={{background: checked ? "var(--accent-foreground)" : "var(--foreground)"}}
                animate={{left: checked ? 16 : 2}}
                transition={{type: "spring", stiffness: 500, damping: 30}}
            />
        </button>
    );
}
