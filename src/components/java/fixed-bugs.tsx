"use client";

import {
  highlightCode,
  useCatppuccinTheme,
  useShiki,
  type CatppuccinFlavor,
  type HighlighterInstance,
} from "~/components/shiki-client";
import VersionLink, { type VersionEntry } from "~/components/java/version-link";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";

import SvgArrowDown from "~/styles/arrow_down.svg";
import SvgArrowUp from "~/styles/arrow_up.svg";

import { type VersionManifestEntry } from "~/server/java/versions";

function versionNameToUrl(name: string): string {
  // Remove "Minecraft " prefix
  const version = name.replace(/^minecraft\s+/i, "");

  // Split into parts
  const parts = version.split(/\s+/);

  // Find "Candidate" in "Release Candidate"
  const rcIdx = parts.findIndex((p) => p === "Candidate");
  // Find "Pre-release"
  const preIdx = parts.findIndex((p) => p === "Pre-release");

  let result: string[];

  if (rcIdx !== -1) {
    // Find the number after "Candidate"
    const numIdx = parts.findIndex((p, i) => i > rcIdx && /^\d+$/.test(p));
    const num = numIdx !== -1 ? parts[numIdx] : "";
    // Version parts are everything before "Release" (parts[rcIdx - 2] = "Release")
    const versionParts = parts.slice(0, rcIdx - 1);
    result = [...versionParts, `rc${num}`];
  } else if (preIdx !== -1) {
    // Format: "1.17.1 Pre-release 1" → "1.17.1-pre1"
    const numIdx = parts.findIndex((p, i) => i > preIdx && /^\d+$/.test(p));
    const num = numIdx !== -1 ? parts[numIdx] : "";
    const versionParts = parts.slice(0, preIdx);
    result = [...versionParts, `pre${num}`];
  } else {
    // Just version numbers: "26.2 Snapshot 1" → "26.2-snapshot-1"
    result = parts;
  }

  return result.join("-").toLowerCase();
}

function createVersionEntry(v: string, url: string, manifestEntry: VersionManifestEntry | undefined): VersionEntry {
  return {
    name: v,
    url,
    title: manifestEntry?.title ?? v,
    description: manifestEntry?.shortText ?? "",
    image: manifestEntry?.image ?? { title: "", url: "" },
  };
}

function VersionLinks({
  versions,
  manifestEntries,
}: {
  versions: string[];
  manifestEntries?: VersionManifestEntry[];
}) {
  const manifestUrlMap = new Map(
    manifestEntries?.map((e) => [versionNameToUrl(e.version), e]) ?? [],
  );

  if (versions.length === 0) return null;

  const first = versions[0]!;
  const last = versions[versions.length - 1]!;

  if (versions.length === 1) {
    return (
      <VersionLink
        version={createVersionEntry(first, versionNameToUrl(first), manifestUrlMap.get(versionNameToUrl(first)))}
        selected={false}
        className="!px-0 !py-0 !w-auto !text-inherit"
      />
    );
  }

  return (
    <span>
      <VersionLink
        version={createVersionEntry(first, versionNameToUrl(first), manifestUrlMap.get(versionNameToUrl(first)))}
        selected={false}
        className="!px-0 !py-0 !w-auto !text-inherit"
      />
      <span className="mx-1 opacity-50">…</span>
      <VersionLink
        version={createVersionEntry(last, versionNameToUrl(last), manifestUrlMap.get(versionNameToUrl(last)))}
        selected={false}
        className="!px-0 !py-0 !w-auto !text-inherit"
      />
    </span>
  );
}

type BugPreview = {
  id: string;
  summary: string;
};

// TODO: Add attachments support when mojira.dev API exposes them via /api/v1/issues/{key}
// The JQL API already fetches attachments but they're not exposed in the V1Issue response.
// See: https://github.com/Misode/mojira.dev/blob/main/model/issue.go#L56 (Attachment struct) and
//      https://github.com/Misode/mojira.dev/blob/main/api/public.go#L210-L225 (fetching attachments)

type BugDetail = {
  key: string;
  summary: string;
  description: string;
  reporter_name: string;
  reporter_avatar: string;
  assignee_name: string | null;
  assignee_avatar: string | null;
  labels: string[];
  created_date: string;
  updated_date: string;
  resolved_date: string | null;
  status: string;
  confirmation_status: string;
  resolution: string | null;
  affected_versions: string[];
  fix_versions: string[];
  category: string[];
  mojang_priority: string;
  area: string | null;
  components: string[];
  platform: string | null;
  os_version: string | null;
  realms_platform: string | null;
  ado: string | null;
  votes: number;
};

type AdfMark = {
  type: string;
  attrs?: { href?: string; color?: string; type?: string };
};

type AdfNode = {
  type: string;
  content?: AdfNode[];
  text?: string;
  marks?: AdfMark[];
  attrs?: Record<string, unknown>;
};

type AdfDoc = {
  type: string;
  version: number;
  content?: AdfNode[];
};

function renderAdfNode(
  node: AdfNode,
  keyPrefix = "",
  highlighter?: HighlighterInstance,
  theme?: CatppuccinFlavor,
): React.ReactNode {
  const { type, content, text, marks, attrs } = node;

  if (type === "text" && text !== undefined) {
    let result: React.ReactNode = text;
    if (marks) {
      for (const [markIdx, mark] of marks.entries()) {
        const mk = (el: React.ReactNode) => (
          <React.Fragment key={`${keyPrefix}-m${markIdx}`}>{el}</React.Fragment>
        );
        switch (mark.type) {
          case "strong":
            result = mk(<strong>{result}</strong>);
            break;
          case "em":
            result = mk(<em>{result}</em>);
            break;
          case "code":
            result = mk(<code className="rounded bg-surface0 px-1 font-mono text-xs">{result}</code>);
            break;
          case "underline":
            result = mk(<u>{result}</u>);
            break;
          case "strike":
            result = mk(<s>{result}</s>);
            break;
          case "link":
            if (mark.attrs?.href) {
              result = mk(
                <a
                  href={mark.attrs.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {result}
                </a>,
              );
            }
            break;
          case "textColor":
            if (mark.attrs?.color) {
              result = mk(<span style={{ color: mark.attrs.color }}>{result}</span>);
            }
            break;
          case "subsup":
            if (mark.attrs?.type === "sub") {
              result = mk(<sub>{result}</sub>);
            } else if (mark.attrs?.type === "sup") {
              result = mk(<sup>{result}</sup>);
            }
            break;
        }
      }
    }
    return result;
  }

  if (type === "hardBreak") {
    return <br key={keyPrefix} />;
  }

  if (type === "paragraph" && content) {
    return (
      <p key={keyPrefix} className="my-1">
        {content.map((c, i) => renderAdfNode(c, `${keyPrefix}-p${i}`, highlighter, theme))}
      </p>
    );
  }

  if (type === "heading" && content) {
    const level = ((attrs?.level as number) || 1) as 1 | 2 | 3 | 4 | 5 | 6;
    const HeadingTag = `h${level}` as const;
    // Strip strong marks from heading content since headings are already bold
    const filteredContent = content.map((c) => {
      if (c.type === "text" && c.marks) {
        return { ...c, marks: c.marks.filter((m) => m.type !== "strong") };
      }
      return c;
    });
    return (
      <HeadingTag key={keyPrefix} className="mt-2 font-semibold">
        {filteredContent.map((c, i) => renderAdfNode(c, `${keyPrefix}-h${i}`, highlighter, theme))}
      </HeadingTag>
    );
  }

  if (type === "bulletList" && content) {
    return (
      <ul key={keyPrefix} className="ml-4 list-disc">
        {content.map((c, i) => renderAdfNode(c, `${keyPrefix}-bl${i}`, highlighter, theme))}
      </ul>
    );
  }

  if (type === "orderedList" && content) {
    return (
      <ol key={keyPrefix} className="ml-4 list-decimal">
        {content.map((c, i) => renderAdfNode(c, `${keyPrefix}-ol${i}`, highlighter, theme))}
      </ol>
    );
  }

  if (type === "listItem" && content) {
    return (
      <li key={keyPrefix}>
        {content.map((c, i) => renderAdfNode(c, `${keyPrefix}-li${i}`, highlighter, theme))}
      </li>
    );
  }

  if (type === "blockquote" && content) {
    return (
      <blockquote
        key={keyPrefix}
        className="border-l-2 border-surface1 pl-3 italic text-subtext1"
      >
        {content.map((c, i) => renderAdfNode(c, `${keyPrefix}-bq${i}`, highlighter, theme))}
      </blockquote>
    );
  }

  if (type === "codeBlock" && content) {
    const lang = (attrs?.language as string) || "java";
    const code = content
      .map((c) => {
        if (c.type === "text" && c.text) return c.text;
        return "";
      })
      .join("");

    const lineCount = code.split("\n").length;
    const showLineNumbers = lineCount > 1;

    if (highlighter && lang && theme !== undefined) {
      const highlighted = highlightCode(code, lang, highlighter, theme);
      if (highlighted) {
        return (
          <div
            key={keyPrefix}
            className={`rounded border border-surface0 bg-surface0/50 ${showLineNumbers ? "code-block-with-lines" : ""}`}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        );
      }
    }

    return (
      <pre key={keyPrefix} className="overflow-x-auto rounded border border-surface0 bg-surface0/50 p-2 font-mono text-xs">
        <code data-language={lang}>{code}</code>
      </pre>
    );
  }

  if (type === "rule") {
    return <hr className="my-2 border-surface0" />;
  }

  if (content) {
    return (
      <React.Fragment key={keyPrefix}>
        {content.map((c, i) => renderAdfNode(c, `${keyPrefix}-${i}`, highlighter, theme))}
      </React.Fragment>
    );
  }

  return null;
}

function AdfRenderer({ description }: { description: string }) {
  const highlighter = useShiki();
  const theme = useCatppuccinTheme();

  let doc: AdfDoc;
  try {
    doc = JSON.parse(description) as AdfDoc;
  } catch {
    return null;
  }

  if (!doc.content) return null;

  return (
    <div className="space-y-1 text-sm text-subtext1">
      {doc.content.map((node, i) => (
        <div key={`block-${i}`}>
          {renderAdfNode(node, `block${i}`, highlighter, theme)}
        </div>
      ))}
    </div>
  );
}

function BugLinks({ id }: { id: string }) {
  const links = [
    { href: `https://mojira.dev/${id}`, label: "mojira.dev" },
    { href: `https://bugs-legacy.mojang.com/browse/${id}`, label: "bugs-legacy.mojang.com" },
    { href: `https://bugs.mojang.com/browse/${id}`, label: "bugs.mojang.com" },
    { href: `https://report.bugs.mojang.com/servicedesk/customer/portal/2/${id}`, label: "report.bugs.mojang.com" },
    { href: `https://mojira.atlassian.net/browse/${id}`, label: "mojira.atlassian.net" },
  ];

  return (
    <div className="mt-2 border-t border-surface0/50 pt-2">
      <span className="mb-1 block font-medium">Links</span>
      <div className="flex flex-col gap-1">
        {links.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}

function BugCard({
  id,
  summary,
  version,
  expandedIds,
  onExpand,
  onCollapse,
  manifestEntries,
}: {
  id: string;
  summary: string;
  version: string;
  expandedIds: Set<string>;
  onExpand: (id: string) => void;
  onCollapse: (id: string) => void;
  manifestEntries?: VersionManifestEntry[];
}) {
  const isExpanded = expandedIds.has(id);

  return (
    <div className="min-w-0 rounded-md border border-surface0 bg-surface0/30 px-4 py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <a
            href={`https://mojira.dev/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap font-semibold underline"
          >
            {id}
          </a>
          <a
            href={`https://bugs.mojang.com/browse/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs opacity-60"
          >
            (<span className="hover:underline">original</span>)
          </a>
        </div>
        <button
          onClick={() => isExpanded ? onCollapse(id) : onExpand(id)}
          className="flex items-center gap-4 text-sm text-subtext0 hover:text-subtext1"
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          <span>{isExpanded ? "Collapse" : "Expand"}</span>
          {isExpanded ? (
            <SvgArrowUp width={16} height={16} style={{ fill: "currentColor" }} />
          ) : (
            <SvgArrowDown width={16} height={16} style={{ fill: "currentColor" }} />
          )}
        </button>
      </div>
      <div className="mt-1 flex">
        <span className={isExpanded ? "text-text" : "flex-1 truncate text-text"} title={summary}>{summary}</span>
      </div>

      {isExpanded && <BugCardExpandedBody id={id} version={version} manifestEntries={manifestEntries} />}
    </div>
  );
}

function BugCardExpandedBody({
  id,
  version,
  manifestEntries,
}: {
  id: string;
  version: string;
  manifestEntries?: VersionManifestEntry[];
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["bug", id],
    queryFn: () =>
      fetch(`https://mojira.dev/api/v1/issues/${id}`).then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json() as Promise<BugDetail>;
      }),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  return (
    <div className="pt-2 text-sm">
      {isLoading && (
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse rounded-md bg-surface1" />
          <div className="h-4 w-3/4 animate-pulse rounded-md bg-surface1" />
          <div className="h-4 w-1/2 animate-pulse rounded-md bg-surface1" />
        </div>
      )}
      {isError && <BugLinks id={id} />}
      {data && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_260px]">
          <div className="min-w-0 space-y-2">
            {data.description && (
              <AdfRenderer description={data.description} />
            )}
          </div>
          <div className="flex w-full flex-col gap-2 self-start rounded border border-surface0/50 bg-surface0/20 p-2 text-subtext1">
            {data.reporter_name && (
              <div className="flex items-center gap-1">
                <span className="font-medium">Reporter:</span>
                <a
                  href={`https://mojira.dev/user/${data.reporter_name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1"
                >
                  {data.reporter_avatar && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.reporter_avatar}
                      alt=""
                      className="h-5 w-5 rounded-full"
                    />
                  )}
                  <span className="hover:underline">{data.reporter_name}</span>
                </a>
              </div>
            )}
            {data.assignee_name && (
              <div className="flex items-center gap-1">
                <span className="font-medium">Assignee:</span>
                <a
                  href={`https://mojira.dev/user/${data.assignee_name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1"
                >
                  {data.assignee_avatar && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.assignee_avatar}
                      alt=""
                      className="h-5 w-5 rounded-full"
                    />
                  )}
                  <span className="hover:underline">{data.assignee_name}</span>
                </a>
              </div>
            )}
            {data.created_date && (
              <div>
                <span className="font-medium">Created:</span>{" "}
                {new Date(data.created_date).toLocaleDateString()}
              </div>
            )}
            {data.resolved_date && (
              <div>
                <span className="font-medium">Resolved:</span>{" "}
                {new Date(data.resolved_date).toLocaleDateString()}
              </div>
            )}
            {data.mojang_priority && (
              <div>
                <span className="font-medium">Priority:</span>{" "}
                {data.mojang_priority}
              </div>
            )}
            {data.area && (
              <div>
                <span className="font-medium">Area:</span> {data.area}
              </div>
            )}
            {data.category.length > 0 && (
              <div>
                <span className="font-medium">Category:</span>{" "}
                {data.category.join(", ")}
              </div>
            )}
            {data.affected_versions.length > 0 && (
              <div>
                <span className="font-medium">Affects:</span> <VersionLinks versions={data.affected_versions} manifestEntries={manifestEntries} />
              </div>
            )}
            {data.fix_versions.length > 0 &&
              !data.fix_versions.every((v) => {
                const normalizedVersion = version
                  .toLowerCase()
                  .replace(/^minecraft /, "")
                  .replace(/[ -]+/g, "-");
                const normalizedFix = v.toLowerCase().replace(/[ -]+/g, "-");
                return normalizedVersion === normalizedFix;
              }) && (
                <div>
                  <span className="font-medium">Fix:</span> <VersionLinks versions={data.fix_versions} manifestEntries={manifestEntries} />
                </div>
              )}
            <BugLinks id={id} />
          </div>
        </div>
      )}
    </div>
  );
}

export function FixedBugs({
  bugs,
  version,
  manifestEntries,
}: {
  bugs: BugPreview[];
  version: string;
  manifestEntries?: VersionManifestEntry[];
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  return (
    <div className="not-prose space-y-2 pb-8">
      {bugs.map((bug) => (
        <BugCard
          key={bug.id}
          id={bug.id}
          summary={bug.summary}
          version={version}
          expandedIds={expandedIds}
          onExpand={(id) => setExpandedIds((prev) => new Set([...prev, id]))}
          onCollapse={(id) => setExpandedIds((prev) => { const next = new Set(prev); next.delete(id); return next; })}
          manifestEntries={manifestEntries}
        />
      ))}
    </div>
  );
}
