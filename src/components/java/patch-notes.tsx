import { type PatchNotesQuery, getPatchNotes } from "~/server/java/versions";
import { fromError, isZodErrorLike } from "zod-validation-error";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { ExclamationTriangleIcon, ResetIcon } from "@radix-ui/react-icons";
import sanitizeHtml from "sanitize-html";
import parseHtml, {
  domToReact,
  type HTMLReactParserOptions,
} from "html-react-parser";
import { ElementType } from "domelementtype";
import { createElement, Suspense, type JSX } from "react";
import type { DOMNode } from "html-dom-parser";
import { Skeleton } from "../ui/skeleton";
import { toKebabCase } from "~/lib/utils";
import { BASE_ASSET_URL } from "~/server/java/versions";
import { type DataNode, type Element } from "domhandler";
import { PublishDate } from "~/components/java/publish-date";

export default function PatchNotes({
  version = { latest: true },
}: {
  version?: PatchNotesQuery;
}) {
  return (
    <Suspense fallback={<Skeleton className="h-page" />}>
      <PatchNotesImpl version={version} />
    </Suspense>
  );
}

type ArticleSection = {
  text?: string;
  id?: string;
  children: ArticleSubSection[];
};

type ArticleSubSection = {
  text?: string;
  id?: string;
  level: number;
};

async function PatchNotesImpl({
  version = { latest: true },
}: {
  version?: PatchNotesQuery;
}) {
  const maybePatchNotes = await getPatchNotes(version);
  if (!maybePatchNotes.success) {
    let msg: string;

    if (isZodErrorLike(maybePatchNotes.error)) {
      msg = fromError(maybePatchNotes.error).toString();
    } else if (typeof maybePatchNotes.error === "string") {
      msg = maybePatchNotes.error;
    } else {
      // TODO: fix serialized errors not being rendered nicely
      msg = JSON.stringify(maybePatchNotes.error);
    }

    return (
      <Alert variant="destructive">
        <ExclamationTriangleIcon className="h-4 w-4" />
        <AlertTitle>Error loading patch notes</AlertTitle>
        <AlertDescription>{msg}</AlertDescription>
      </Alert>
    );
  }

  const patchNotes = maybePatchNotes.data;

  const allowedAttributes = { ...sanitizeHtml.defaults.allowedAttributes };
  if (!("*" in allowedAttributes)) {
    allowedAttributes["*"] = [];
  }
  allowedAttributes["*"].push("id");
  const cleanPatchNotesHTML = sanitizeHtml(patchNotes.body, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes,
  });

  const articleSections: ArticleSection[] = [];
  const ids = new Map<string, number>();

  const options: HTMLReactParserOptions = {
    replace(
      domNode: DOMNode,
    ): JSX.Element | string | null | boolean | object | void {
      if (domNode.type !== ElementType.Tag) return;
      if (!domNode.name.startsWith("h")) return;

      const attribs = { ...domNode.attribs };
      const children = domNode.children as DOMNode[];

      const initialHeadingLevel = Number(domNode.name.at(-1));
      if (Number.isNaN(initialHeadingLevel)) return;

      let HElem = "p";

      if (
        !attribs.id &&
        children[0]?.type === ElementType.Text &&
        initialHeadingLevel < 6
      ) {
        const headingText: string = children
          .map(
            (child) =>
              (child as DataNode).data ??
              ((child as Element).children[0] as DataNode)?.data,
          )
          .join("");

        let id = toKebabCase(headingText);
        const dups = ids.get(id) ?? 0;
        if (dups > 0) {
          id += `-${dups}`;
        }
        ids.set(id, dups + 1);

        attribs.id = id;

        const section = articleSections.at(-1);
        const headingLevel = initialHeadingLevel + 1;

        HElem = "h" + headingLevel;

        if (headingLevel > 2 && section) {
          section.children.push({
            text: headingText,
            id: id,
            level: headingLevel - 2,
          });
        } else {
          articleSections.push({
            text: headingText,
            id: id,
            children: [],
          });
        }
      }

      return createElement(
        HElem,
        { ...attribs },
        <>
          {domToReact(children, options)}
          <a href="#table-of-contents" className="ml-1 text-foreground/60">
            <ResetIcon className="inline" />
          </a>
        </>,
      );
    },
  };

  const dom = parseHtml(cleanPatchNotesHTML, options);

  return (
    <div>
      <div
        className="relative h-[60vh] bg-cover bg-center"
        style={{
          backgroundImage: `url(${BASE_ASSET_URL + patchNotes.image.url})`,
        }}
      >
        <div className="absolute top-0 block h-full w-full bg-gradient-to-t from-background"></div>
      </div>
      <div className="prose prose-sm mx-auto -translate-y-[30vh] p-2 dark:prose-invert lg:prose-xl prose-code:[word-break:break-word]">
        <PublishDate date={patchNotes.date} />
        <h1>{patchNotes.title}</h1>
        <div
          className="max-w-1/2 float-right mb-2 ml-6 w-1/3 rounded-sm border p-3 text-sm leading-5 max-md:w-full"
          id="table-of-contents"
        >
          <span className="font-semibold text-foreground/80">
            Table of Contents
          </span>
          {articleSections.map((section) => (
            <DropdownItem key={section.id} section={section} />
          ))}
        </div>
        {dom}
      </div>
    </div>
  );
}

function DropdownLink({
  section,
}: {
  section: ArticleSection | ArticleSubSection;
}) {
  return (
    <a
      href={"#" + section.id}
      className="text-foreground/60 no-underline hover:text-foreground/80"
    >
      {section.text}
    </a>
  );
}

function DropdownItem({ section }: { section: ArticleSection }) {
  if (section.children.length === 0) {
    return (
      <div className="ml-6 text-pretty py-1">
        <DropdownLink section={section} />
      </div>
    );
  }

  return (
    <details open={section.children.length < 6}>
      <summary className="cursor-pointer marker:text-xl">
        <div className="ml-1 inline-flex max-w-[calc(100%-2rem)] -translate-y-0.5 text-pretty">
          <DropdownLink section={section} />
        </div>
      </summary>
      <ul className="not-prose -mt-1 mb-1 ml-2">
        {section.children.map((header) => (
          <li
            key={header.id}
            style={{ marginLeft: header.level * 15, listStyleType: "'–'" }}
            className="my-1 text-pretty pl-2"
          >
            <DropdownLink section={header} />
          </li>
        ))}
      </ul>
    </details>
  );
}
