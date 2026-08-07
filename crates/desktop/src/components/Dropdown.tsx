import type {Key, ReactNode} from "react";
import {Dropdown as HeroDropdown} from "@heroui/react";
import {Icon} from "@iconify-icon/react";

export type DropdownOption<T extends string> = {
    value: T;
    label: ReactNode;
};

/**
 * Thin wrapper around HeroUI's (React Aria–backed) `Dropdown` that keeps the
 * small `value`/`options`/`onChange` API used across the app. Delegating to
 * HeroUI gives us robust edge-case handling for free: portalled popover,
 * collision-aware placement, keyboard navigation, and focus management.
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
    const selected = options.find(o => o.value === value);

    return (
        <HeroDropdown>
            <HeroDropdown.Trigger className={`cursor-pointer outline-none ${className}`}>
                {renderTrigger
                    ? renderTrigger(selected)
                    : <span className={"flex items-center gap-1.5"}>
                        <span className={"truncate"}>{selected?.label ?? value}</span>
                        <Icon icon={"lucide:chevron-down"} className={"opacity-50 shrink-0"}/>
                    </span>}
            </HeroDropdown.Trigger>
            <HeroDropdown.Popover placement={align === "right" ? "bottom end" : "bottom start"}>
                <HeroDropdown.Menu
                    selectionMode={"single"}
                    selectedKeys={[value]}
                    onAction={(key: Key) => onChange(key as T)}
                >
                    {options.map(opt => (
                        <HeroDropdown.Item key={opt.value} id={opt.value} textValue={String(opt.value)}>
                            {opt.label}
                        </HeroDropdown.Item>
                    ))}
                </HeroDropdown.Menu>
            </HeroDropdown.Popover>
        </HeroDropdown>
    );
}
