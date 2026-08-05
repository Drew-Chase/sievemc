import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {motion} from "framer-motion";
import {Icon} from "@iconify-icon/react";
import {getAppInfo} from "../ts/app_info.ts";
import {DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings} from "../ts/settings.ts";
import {Dropdown, type DropdownOption} from "../components/Dropdown.tsx";
import {Toggle} from "../components/Toggle.tsx";

const SIDE_OPTIONS: DropdownOption<Settings["defaultSide"]>[] = [
    {value: "client", label: "Client pack"},
    {value: "server", label: "Server pack"},
    {value: "both", label: "Both — two outputs"}
];
const OUTPUT_OPTIONS: DropdownOption<Settings["defaultOutputType"]>[] = [
    {value: "directory", label: "Folder"},
    {value: "archive", label: "Zip archive"},
    {value: "list", label: "List only"}
];
const UNSURE_OPTIONS: DropdownOption<Settings["unsureAs"]>[] = [
    {value: "both", label: "Both sides — safe"},
    {value: "client", label: "Client"},
    {value: "server", label: "Server"},
    {value: "skip", label: "Skip"}
];

export default function SettingsPage()
{
    const navigate = useNavigate();
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const [version, setVersion] = useState("");

    useEffect(() =>
    {
        loadSettings().then(setSettings);
        getAppInfo().then(info => setVersion(info.version));
    }, []);

    const update = (patch: Partial<Settings>) =>
    {
        setSettings(prev =>
        {
            const next = {...prev, ...patch};
            void saveSettings(next);
            return next;
        });
    };

    return (
        <motion.div
            className={"flex flex-col gap-6 w-full h-full overflow-y-auto px-[15%] py-8"}
            initial={{opacity: 0, y: 8}}
            animate={{opacity: 1, y: 0}}
        >
            <div className={"flex items-center gap-3"}>
                <button
                    type={"button"}
                    onClick={() => navigate("/")}
                    className={"text-link flex items-center gap-1 cursor-pointer"}
                    style={{color: "var(--muted-foreground)"}}
                >
                    <Icon icon={"lucide:arrow-left"}/> Home
                </button>
                <h1 className={"text-page-title"}>Settings</h1>
            </div>

            <section>
                <div className={"text-section-label mb-2.5"}>Sieving</div>
                <div className={"bg-surface border border-border rounded-xl"}>
                    <SelectRow
                        title={"Default side"}
                        subtitle={"Pre-selected on the export step"}
                        value={settings.defaultSide}
                        options={SIDE_OPTIONS}
                        onChange={v => update({defaultSide: v})}
                    />
                    <SelectRow
                        title={"Default output type"}
                        subtitle={"Folder, zip archive, or list only"}
                        value={settings.defaultOutputType}
                        options={OUTPUT_OPTIONS}
                        onChange={v => update({defaultOutputType: v})}
                    />
                    <SelectRow
                        title={"Treat unsure mods as"}
                        subtitle={"When you skip reviewing them"}
                        value={settings.unsureAs}
                        options={UNSURE_OPTIONS}
                        onChange={v => update({unsureAs: v})}
                        last
                    />
                </div>
            </section>

            <section>
                <div className={"text-section-label mb-2.5"}>App</div>
                <div className={"bg-surface border border-border rounded-xl"}>
                    <ToggleRow
                        title={"Remember recent folders"}
                        subtitle={"Shown on the start screen"}
                        checked={settings.rememberRecent}
                        onChange={v => update({rememberRecent: v})}
                    />
                    <ToggleRow
                        title={"Check for updates on launch"}
                        checked={settings.checkUpdates}
                        onChange={v => update({checkUpdates: v})}
                        last
                    />
                </div>
            </section>

            <div className={"text-version"}>SieveMC v{version} · sieve core · tauri 2.x</div>
        </motion.div>
    );
}

function Row({title, subtitle, control, last}: {title: string; subtitle?: string; control: React.ReactNode; last?: boolean})
{
    return (
        <div className={`flex items-center px-4.5 py-3.5 ${last ? "" : "border-b border-border"}`}>
            <div>
                <div className={"text-[13.5px] font-medium"}>{title}</div>
                {subtitle && <div className={"text-caption"}>{subtitle}</div>}
            </div>
            <div className={"ml-auto"}>{control}</div>
        </div>
    );
}

function SelectRow<T extends string>(
    {title, subtitle, value, options, onChange, last}:
    {title: string; subtitle?: string; value: T; options: DropdownOption<T>[]; onChange: (v: T) => void; last?: boolean})
{
    return (
        <Row
            title={title}
            subtitle={subtitle}
            last={last}
            control={
                <div className={"bg-surface-2 border border-border rounded-lg px-3 py-2 text-[12px] font-medium"}>
                    <Dropdown value={value} options={options} onChange={onChange} align={"right"}/>
                </div>
            }
        />
    );
}

function ToggleRow(
    {title, subtitle, checked, onChange, last}:
    {title: string; subtitle?: string; checked: boolean; onChange: (v: boolean) => void; last?: boolean})
{
    return <Row title={title} subtitle={subtitle} last={last} control={<Toggle checked={checked} onChange={onChange}/>}/>;
}
