import React from "react";
import {BrowserRouter, Route, Routes, useLocation} from "react-router-dom";
import ReactDOM from "react-dom/client";
import {AnimatePresence} from "framer-motion";

import "./css/sievemc-theme.css";
import DirectorySelectPage from "./pages/DirectorySelectPage.tsx";
import ScanProgressPage from "./pages/ScanProgressPage.tsx";
import ReviewPage from "./pages/ReviewPage.tsx";
import ExportPage from "./pages/ExportPage.tsx";
import ExportProgressPage from "./pages/ExportProgressPage.tsx";
import DonePage from "./pages/DonePage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import ChangelogPage from "./pages/ChangelogPage.tsx";
import {Toast} from "@heroui/react";
import {attachConsoleToTracing} from "./util/logger.ts";
import {WindowChrome} from "./components/WindowChrome.tsx";
import {ErrorBoundary} from "./ErrorBoundry.tsx";
import {WizardProvider} from "./state/WizardContext.tsx";
import {UpdaterProvider} from "./state/UpdaterContext.tsx";

// Route all console output and uncaught errors through the Rust tracing
// pipeline so frontend logs land in the same rolling log files as native logs.
attachConsoleToTracing();

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <BrowserRouter>
            <WizardProvider>
                <UpdaterProvider>
                    <MainContentRenderer/>
                </UpdaterProvider>
            </WizardProvider>
        </BrowserRouter>
    </React.StrictMode>
);

export function MainContentRenderer()
{
    window.addEventListener("contextmenu", e => e.preventDefault());
    return (
        <>
            <Toast.Provider placement={"bottom end"}/>
            <main className={"flex flex-col p-0 m-0"}>
                <WindowChrome/>
                <ErrorBoundary>
                    <div className={"flex flex-row w-full max-h-[calc(100vh-2.5rem)] h-screen overflow-y-hidden p-0 m-0"} data-tauri-drag-region="">
                        <AnimatedRoutes/>
                    </div>
                </ErrorBoundary>

            </main>
        </>
    );
}

function AnimatedRoutes()
{
    const location = useLocation();
    return (
        <AnimatePresence mode={"wait"}>
            <Routes location={location} key={location.pathname}>
                <Route path="/" element={<DirectorySelectPage/>}/>
                <Route path="/scan" element={<ScanProgressPage/>}/>
                <Route path="/review" element={<ReviewPage/>}/>
                <Route path="/export" element={<ExportPage/>}/>
                <Route path="/exporting" element={<ExportProgressPage/>}/>
                <Route path="/done" element={<DonePage/>}/>
                <Route path="/settings" element={<SettingsPage/>}/>
                <Route path="/changelog" element={<ChangelogPage/>}/>
            </Routes>
        </AnimatePresence>
    );
}
