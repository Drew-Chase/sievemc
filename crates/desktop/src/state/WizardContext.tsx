import {createContext, type ReactNode, useContext, useEffect, useMemo, useReducer} from "react";
import type {ExportReceipt, ExportSide, ModDetection, OutputType, Side} from "../ts/sieve.ts";
import {forgetOverride, initOverrideStore, rememberOverride, rememberedSide} from "../ts/overrideStore.ts";

/**
 * Per-mod side override chosen on the Review screen.
 *
 * Keyed by {@link overrideKey}: a mod's stable manifest id when available, else
 * its jar path. Mod-id keys let an override (e.g. "this is a client-only mod")
 * be remembered across scans and app restarts, independent of the jar filename.
 */
export type Overrides = Record<string, Side>;

/** Stable key for an override: prefer the manifest id, fall back to the jar path. */
export function overrideKey(mod: ModDetection): string
{
    return mod.mod_id ?? mod.path;
}

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
    | {type: "setOverride"; keys: string[]; side: Side}
    | {type: "clearOverride"; keys: string[]}
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
        {
            // Path-keyed overrides referenced old jar paths and are dropped, but
            // mod-id overrides remembered from prior sessions (SQLite, mirrored
            // in memory) are re-applied to any matching mod in the new scan.
            const overrides: Overrides = {};
            for (const mod of action.mods)
            {
                if (!mod.mod_id) continue;
                const side = rememberedSide(mod.mod_id);
                if (side) overrides[mod.mod_id] = side;
            }
            return {...state, mods: action.mods, overrides};
        }
        case "setOverride":
        {
            const overrides = {...state.overrides};
            for (const key of action.keys) overrides[key] = action.side;
            return {...state, overrides};
        }
        case "clearOverride":
        {
            const overrides = {...state.overrides};
            for (const key of action.keys) delete overrides[key];
            return {...state, overrides};
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
    /** Override one or more mods to `side`; mod-id-keyed choices are remembered. */
    setOverride: (mods: ModDetection | ModDetection[], side: Side) => void;
    /** Clear the override for one or more mods, forgetting any remembered choice. */
    clearOverride: (mods: ModDetection | ModDetection[]) => void;
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

    // Hydrate the remembered-overrides cache from SQLite before the first scan.
    useEffect(() => void initOverrideStore(), []);

    const value = useMemo<WizardContextValue>(() => ({
        state,
        setDirectory: directory => dispatch({type: "setDirectory", directory}),
        setMods: mods => dispatch({type: "setMods", mods}),
        setOverride: (mods, side) =>
        {
            const list = Array.isArray(mods) ? mods : [mods];
            for (const mod of list) if (mod.mod_id) rememberOverride(mod.mod_id, side);
            dispatch({type: "setOverride", keys: list.map(overrideKey), side});
        },
        clearOverride: mods =>
        {
            const list = Array.isArray(mods) ? mods : [mods];
            for (const mod of list) if (mod.mod_id) forgetOverride(mod.mod_id);
            dispatch({type: "clearOverride", keys: list.map(overrideKey)});
        },
        setExportConfig: config => dispatch({type: "setExportConfig", config}),
        setReceipt: receipt => dispatch({type: "setReceipt", receipt}),
        reset: () => dispatch({type: "reset"}),
        effectiveSide: mod => state.overrides[overrideKey(mod)] ?? mod.side
    }), [state]);

    return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard(): WizardContextValue
{
    const ctx = useContext(WizardContext);
    if (!ctx) throw new Error("useWizard must be used within a WizardProvider");
    return ctx;
}
