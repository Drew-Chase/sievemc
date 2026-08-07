import type {ReactNode} from "react";
import {useNavigate} from "react-router-dom";
import {motion} from "framer-motion";
import {Icon} from "@iconify-icon/react";
import {openUrl} from "@tauri-apps/plugin-opener";
import {useUpdater} from "../state/UpdaterContext.tsx";

/** Release notes for the pending update, with the action that applies it. */
export default function ChangelogPage()
{
    const navigate = useNavigate();
    const {release, installed, currentVersion, phase, progress, error, applyUpdate} = useUpdater();

    return (
        <motion.div
            className={"flex flex-col gap-6 w-full h-full overflow-y-auto px-[15%] py-8"}
            initial={{opacity: 0, y: 8}}
            animate={{opacity: 1, y: 0}}
        >
            <div className={"flex items-center gap-3"}>
                <button
                    type={"button"}
                    onClick={() => navigate(-1)}
                    className={"text-link flex items-center gap-1 cursor-pointer"}
                    style={{color: "var(--muted-foreground)"}}
                >
                    <Icon icon={"lucide:arrow-left"}/> Back
                </button>
                <h1 className={"text-page-title"}>What's new</h1>
            </div>

            {!release && (
                <div className={"bg-surface border border-border rounded-xl px-4.5 py-3.5"}>
                    <div className={"text-body"}>You're up to date.</div>
                    <div className={"text-caption"}>SieveMC v{currentVersion} is the latest release.</div>
                </div>
            )}

            {release && (
                <>
                    <div className={"bg-surface border border-border rounded-xl px-4.5 py-3.5 flex items-center gap-4"}>
                        <div>
                            <div className={"text-card-title"}>{release.name}</div>
                            <div className={"text-caption"}>
                                v{currentVersion} → v{release.version}
                                {release.publishedAt && ` · ${new Date(release.publishedAt).toLocaleDateString()}`}
                            </div>
                        </div>
                        <div className={"ml-auto"}>
                            <UpdateAction
                                installed={installed}
                                phase={phase}
                                progress={progress}
                                onPress={applyUpdate}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className={"text-caption"} style={{color: "var(--danger)"}}>{error}</div>
                    )}

                    <div className={"bg-surface border border-border rounded-xl px-4.5 py-3.5"}>
                        <Markdown source={release.notes || "_This release has no notes._"}/>
                    </div>

                    <button
                        type={"button"}
                        onClick={() => void openUrl(release.htmlUrl)}
                        className={"text-link flex items-center gap-1 cursor-pointer self-start"}
                        style={{color: "var(--muted-foreground)"}}
                    >
                        <Icon icon={"lucide:external-link"}/> View on GitHub
                    </button>
                </>
            )}
        </motion.div>
    );
}

/**
 * The apply button. Portable builds can only be sent to the release page, so
 * they get a link-shaped action rather than an install one.
 */
function UpdateAction(
    {installed, phase, progress, onPress}:
    {installed: boolean; phase: string; progress: number | null; onPress: () => void})
{
    const base = "flex items-center gap-2 rounded-lg px-3.5 py-2 text-button cursor-pointer bg-surface-2 border border-border hover:bg-surface-1";

    if (!installed)
    {
        return (
            <button type={"button"} onClick={onPress} className={base}>
                <Icon icon={"lucide:external-link"}/> Download update
            </button>
        );
    }

    if (phase === "downloading")
    {
        const percent = progress === null ? "" : ` ${Math.round(progress * 100)}%`;
        return (
            <span className={`${base} opacity-60 cursor-default`}>
                <Icon icon={"lucide:loader-circle"} className={"animate-spin"}/> Downloading{percent}
            </span>
        );
    }

    if (phase === "installing")
    {
        return (
            <span className={`${base} opacity-60 cursor-default`}>
                <Icon icon={"lucide:loader-circle"} className={"animate-spin"}/> Installing…
            </span>
        );
    }

    return (
        <button type={"button"} onClick={onPress} className={base} disabled={phase !== "ready"}>
            <Icon icon={"lucide:download"}/> Install update
        </button>
    );
}

/**
 * Very small markdown renderer for GitHub release bodies.
 *
 * Release notes only ever use a narrow slice of markdown (headings, lists,
 * links, inline code), so this covers that rather than pulling in a full
 * parser. Everything is rendered as text nodes — no `dangerouslySetInnerHTML` —
 * so untrusted release bodies can't inject markup.
 */
function Markdown({source}: {source: string})
{
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    const blocks: ReactNode[] = [];
    let list: string[] = [];

    const flushList = () =>
    {
        if (list.length === 0) return;
        blocks.push(
            <ul key={`ul-${blocks.length}`} className={"list-disc pl-5 my-2 flex flex-col gap-1"}>
                {list.map((item, i) => <li key={i} className={"text-body"}>{inline(item)}</li>)}
            </ul>
        );
        list = [];
    };

    for (const line of lines)
    {
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        const quote = /^>\s?(.*)$/.exec(line);

        if (quote)
        {
            flushList();
            // GitHub alert syntax (`> [!NOTE]`) becomes the callout's label.
            const alert = /^\[!(\w+)]$/.exec(quote[1]!.trim());
            blocks.push(
                <blockquote key={blocks.length} className={"border-l-2 border-border pl-3 my-1"}>
                    {alert
                        ? <span className={"text-section-label"}>{alert[1]}</span>
                        : <span className={"text-description"}>{inline(quote[1]!)}</span>}
                </blockquote>
            );
        } else if (heading)
        {
            flushList();
            const text = heading[2]!;
            blocks.push(
                heading[1]!.length <= 2
                    ? <h2 key={blocks.length} className={"text-card-title mt-4 first:mt-0"}>{inline(text)}</h2>
                    : <h3 key={blocks.length} className={"text-section-label mt-3"}>{inline(text)}</h3>
            );
        } else if (bullet)
        {
            list.push(bullet[1]!);
        } else if (line.trim() === "")
        {
            flushList();
        } else
        {
            flushList();
            blocks.push(<p key={blocks.length} className={"text-body my-1"}>{inline(line)}</p>);
        }
    }
    flushList();

    return <div className={"flex flex-col"}>{blocks}</div>;
}

/** Inline markdown: `code`, **bold**, and [links](url). */
function inline(text: string): ReactNode[]
{
    const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+]\((https?:\/\/[^)]+)\))/g;
    const nodes: ReactNode[] = [];
    let cursor = 0;

    for (const match of text.matchAll(pattern))
    {
        const start = match.index;
        if (start > cursor) nodes.push(text.slice(cursor, start));
        cursor = start + match[0].length;

        if (match[1])
        {
            nodes.push(<code key={start} className={"text-log bg-surface-2 rounded px-1 py-0.5"}>{match[1].slice(1, -1)}</code>);
        } else if (match[2])
        {
            nodes.push(<strong key={start}>{match[2].slice(2, -2)}</strong>);
        } else if (match[3])
        {
            const label = /\[([^\]]+)]/.exec(match[3])![1]!;
            const href = match[4]!;
            // The opener capability is scoped to github.com, so anything else
            // would fail silently on click — show it as plain text instead.
            nodes.push(
                href.startsWith("https://github.com/")
                    ? (
                        <button
                            key={start}
                            type={"button"}
                            onClick={() => void openUrl(href)}
                            className={"text-link cursor-pointer underline"}
                        >
                            {label}
                        </button>
                    )
                    : `${label} (${href})`
            );
        }
    }

    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
}
