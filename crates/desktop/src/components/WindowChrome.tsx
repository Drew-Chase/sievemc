import {getCurrentWindow} from "@tauri-apps/api/window";
import {Button, ButtonGroup} from "@heroui/react";
import {Icon} from "@iconify-icon/react";
import {useEffect, useState} from "react";

export function WindowChrome()
{
    const appWindow = getCurrentWindow();
    const [darkMode, setDarkMode] = useState(true);
    useEffect(() =>
    {
        appWindow.setDecorations(false).then();
        setDarkMode(_ =>
        {
            let storage = window.localStorage.getItem("sievemc-dark-mode");
            let darkMode = storage ? storage === "true" : window.matchMedia("(prefers-color-scheme: dark)").matches;
            document.getElementsByTagName("html")[0]!.dataset["theme"] = darkMode ? "dark" : "light";
            return darkMode;
        });
    }, []);

    const toggleDarkMode = () =>
    {
        setDarkMode(prev =>
        {
            const value = !prev;
            document.getElementsByTagName("html")[0]!.dataset["theme"] = value ? "dark" : "light";
            window.localStorage.setItem("sievemc-dark-mode", `${value}`);
            return value;
        });
    };

    return (
        <div className={"flex flex-row h-7.5 backdrop-blur-sm sticky top-0 w-full z-51 backdrop-saturate-150 select-none bg-topbar text-ink-0 border-b"}>
            <span className={"absolute h-full w-full"} data-tauri-drag-region=""/>
            <div className={"flex flex-row my-auto ml-4 items-center gap-2"}>
                <p className={"text-titlebar select-none"}>sievemc</p>
            </div>
            <div className={"flex flex-row ml-auto h-full gap-2"}>
                <ButtonGroup className={"h-full"} variant={"tertiary"}>
                    <Button
                        variant={"ghost"}
                        className={"min-w-0 h-full rounded-none text-[1rem] hover:bg-surface-1"}
                        onPress={toggleDarkMode}
                    >
                        <Icon icon={darkMode ? "lucide:sun-medium" : "lucide:moon"}/>
                    </Button>
                    <Button variant={"ghost"} className={"min-w-0 h-full rounded-none text-[1rem] hover:bg-surface-1"} onPress={() => appWindow.minimize()}>
                        <Icon icon="material-symbols:minimize-rounded"/>
                    </Button>
                    <Button variant={"ghost"} className={"min-w-0 h-full rounded-none text-[0.75rem] hover:bg-surface-1"} onPress={() => appWindow.toggleMaximize()}>
                        <Icon icon="material-symbols:square-outline-rounded"/>
                    </Button>
                    <Button variant={"ghost"} className={"min-w-0 h-full rounded-none text-[1rem] hover:bg-danger hover:text-danger-foreground"} onPress={() => appWindow.close()}>
                        <Icon icon="material-symbols:close-rounded"/>
                    </Button>
                </ButtonGroup>
            </div>
        </div>
    );
}