import {createContext, type ReactNode, useContext, useMemo, useReducer} from "react";
import type {ExportReceipt, ExportSide, ModDetection, OutputType, Side} from "../ts/sieve.ts";

/** Per-mod side override chosen on the Review screen, keyed by jar path. */
export type Overrides = Record<string, Side>;

export type ExportConfig = {
    side: ExportSide;
    outputType: OutputType;
    /** Destination for the client set (or the single set for a client-only export). */
    destClient: string;
    /** Destination for the server set. */
    destServer: string;
};

export type WizardState = {
    /** The selected mods directory. */
    directory: string;
    /** Detections from the last scan. */
    mods: ModDetection[];
    /** User side overrides applied on the Review screen. */
    overrides: Overrides;
    /** Export configuration chosen on the Export screen. */
    exportConfig: ExportConfig;
    /** Result of the last export, shown on Done. */
    receipt: ExportReceipt | null;
};

const initialState: WizardState = {
    directory: "",
    mods: [],
    overrides: {},
    exportConfig: {side: "both", outputType: "directory", destClient: "", destServer: ""},
    receipt: null
};

type Action =
    | {type: "setDirectory"; directory: string}
    | {type: "setMods"; mods: ModDetection[]}
    | {type: "setOverride"; path: string; side: Side}
    | {type: "clearOverride"; path: string}
    | {type: "setExportConfig"; config: Partial<ExportConfig>}
    | {type: "setReceipt"; receipt: ExportReceipt}
    | {type: "reset"};

function reducer(state: WizardState, action: Action): WizardState
{
    switch (action.type)
    {
        case "setDirectory":
            return {...state, directory: action.directory};
        case "setMods":
            // A fresh scan clears prior overrides — they referenced old paths.
            return {...state, mods: action.mods, overrides: {}};
        case "setOverride":
            return {...state, overrides: {...state.overrides, [action.path]: action.side}};
        case "clearOverride":
        {
            const {[action.path]: _removed, ...rest} = state.overrides;
            return {...state, overrides: rest};
        }
        case "setExportConfig":
            return {...state, exportConfig: {...state.exportConfig, ...action.config}};
        case "setReceipt":
            return {...state, receipt: action.receipt};
        case "reset":
            return {...initialState};
        default:
            return state;
    }
}

type WizardContextValue = {
    state: WizardState;
    setDirectory: (directory: string) => void;
    setMods: (mods: ModDetection[]) => void;
    setOverride: (path: string, side: Side) => void;
    clearOverride: (path: string) => void;
    setExportConfig: (config: Partial<ExportConfig>) => void;
    setReceipt: (receipt: ExportReceipt) => void;
    reset: () => void;
    /** Effective side for a mod after applying any override (null == still unsure). */
    effectiveSide: (mod: ModDetection) => Side | null;
};

const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardProvider({children}: {children: ReactNode})
{
    const [state, dispatch] = useReducer(reducer, initialState);

    const value = useMemo<WizardContextValue>(() => ({
        state,
        setDirectory: directory => dispatch({type: "setDirectory", directory}),
        setMods: mods => dispatch({type: "setMods", mods}),
        setOverride: (path, side) => dispatch({type: "setOverride", path, side}),
        clearOverride: path => dispatch({type: "clearOverride", path}),
        setExportConfig: config => dispatch({type: "setExportConfig", config}),
        setReceipt: receipt => dispatch({type: "setReceipt", receipt}),
        reset: () => dispatch({type: "reset"}),
        effectiveSide: mod => state.overrides[mod.path] ?? mod.side
    }), [state]);

    return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard(): WizardContextValue
{
    const ctx = useContext(WizardContext);
    if (!ctx) throw new Error("useWizard must be used within a WizardProvider");
    return ctx;
}
