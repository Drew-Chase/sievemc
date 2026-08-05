import {AnimatePresence, motion} from "framer-motion";
import {type ReactNode, useEffect, useRef, useState} from "react";
import {Icon} from "@iconify-icon/react";

export type DropdownOption<T extends string> = {
    value: T;
    label: ReactNode;
};

/**
 * A lightweight custom select styled to match the mockups (the design uses
 * bespoke "▾" pills throughout, not a native/standard control). Closes on
 * outside-click or Escape.
 */
export function Dropdown<T extends string>(
    {
        value,
        options,
        onChange,
        className = "",
        align = "left",
        renderTrigger
    }: {
        value: T;
        options: DropdownOption<T>[];
        onChange: (value: T) => void;
        className?: string;
        align?: "left" | "right";
        /** Custom trigger content; defaults to the selected option's label + chevron. */
        renderTrigger?: (selected: DropdownOption<T> | undefined) => ReactNode;
    })
{
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selected = options.find(o => o.value === value);

    useEffect(() =>
    {
        if (!open) return;
        const onDoc = (e: MouseEvent) =>
        {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () =>
        {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <div ref={ref} className={`relative ${className}`}>
            <button
                type={"button"}
                onClick={() => setOpen(o => !o)}
                className={"flex items-center gap-1.5 cursor-pointer w-full"}
            >
                {renderTrigger
                    ? renderTrigger(selected)
                    : <>
                        <span className={"truncate"}>{selected?.label ?? value}</span>
                        <Icon icon={"lucide:chevron-down"} className={"opacity-50 shrink-0"}/>
                    </>}
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{opacity: 0, y: -4, scale: 0.98}}
                        animate={{opacity: 1, y: 0, scale: 1}}
                        exit={{opacity: 0, y: -4, scale: 0.98}}
                        transition={{duration: 0.12}}
                        className={`absolute z-50 mt-1.5 min-w-full w-max bg-surface border border-border-strong rounded-lg shadow-xl overflow-hidden p-1 ${align === "right" ? "right-0" : "left-0"}`}
                    >
                        {options.map(opt =>
                        {
                            const active = opt.value === value;
                            return (
                                <button
                                    key={opt.value}
                                    type={"button"}
                                    onClick={() =>
                                    {
                                        onChange(opt.value);
                                        setOpen(false);
                                    }}
                                    className={"flex items-center gap-2 w-full text-left px-3 py-2 rounded-md text-[12.5px] hover:bg-surface-3 cursor-pointer"}
                                    style={active ? {color: "var(--accent)"} : undefined}
                                >
                                    <span className={"flex-1"}>{opt.label}</span>
                                    {active && <Icon icon={"lucide:check"} className={"text-[13px]"}/>}
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
