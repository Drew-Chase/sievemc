import React from "react";
import {BrowserRouter, Route, Routes} from "react-router-dom";
import ReactDOM from "react-dom/client";

import "./css/sievemc-theme.css";
import Home from "./pages/Home.tsx";
import {Toast} from "@heroui/react";
import {attachConsoleToTracing} from "./util/logger.ts";
import {WindowChrome} from "./components/WindowChrome.tsx";
import {ErrorBoundary} from "./ErrorBoundry.tsx";

// Route all console output and uncaught errors through the Rust tracing
// pipeline so frontend logs land in the same rolling log files as native logs.
attachConsoleToTracing();

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <BrowserRouter>
            <MainContentRenderer/>
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
                        <Routes>
                            <Route>
                                <Route path="/" element={<Home/>}/>
                            </Route>
                        </Routes>
                    </div>
                </ErrorBoundary>

            </main>
        </>
    );
}
