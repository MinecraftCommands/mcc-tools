import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { ElementType } from "domelementtype";
import { type Element } from "domhandler";
import type { DOMNode } from "html-dom-parser";
import parseHtml, {
  attributesToProps,
  domToReact,
  type HTMLReactParserOptions,
} from "html-react-parser";
import Image from "next/image";
import { createElement, Suspense, type JSX } from "react";
import sanitizeHtml from "sanitize-html";
import { fromError, isZodErrorLike } from "zod-validation-error";
import { PublishDate } from "~/components/java/publish-date";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { textContent } from "~/lib/element";
import { toKebabCase } from "~/lib/utils";
import {
  highlightToHtml,
  initHighlighter,
  type Language,
  type Scheme,
} from "~/server/highlighting/highlighter";
import {
  BASE_ASSET_URL,
  getPatchNotes,
  type PatchNotesQuery,
} from "~/server/java/versions";
import { Skeleton } from "../ui/skeleton";

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
  // Start getting the highlighter initialising ASAP
  const highlighterReady = initHighlighter();
  const maybePatchNotes = await getPatchNotes(version);
  if (!maybePatchNotes.success) {
    let msg: string;

    if (isZodErrorLike(maybePatchNotes.error)) {
      msg = fromError(maybePatchNotes.error).toString();
    } else {
      msg = maybePatchNotes.error;
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

      if (domNode.name.startsWith("h")) {
        return parseHeader(domNode, ids, articleSections, options);
      }

      switch (domNode.name) {
        case "pre":
          return parseCodeBlock(domNode);
        case "code":
          return parseCodeInline(domNode);
      }
    },
  };

  // Ensure the highlighter is ready to use
  await highlighterReady;
  const dom = parseHtml(cleanPatchNotesHTML, options);

  return (
    <div className="relative">
      <div
        className="absolute -z-10 h-[60vh] w-full bg-cover bg-center md:blur-[1px] lg:blur-[2px] xl:blur-[3px] 2xl:blur-[4px]"
        style={{
          backgroundImage: `url(${BASE_ASSET_URL + patchNotes.image.url})`,
        }}
      >
        <div className="absolute top-0 block h-full w-full bg-gradient-to-t from-base"></div>
      </div>
      <div className="prose-s prose mx-auto max-w-[100ch] break-words px-4 md:prose-base 2xl:prose-lg dark:prose-invert">
        <div className="not-prose float-right my-4 ml-6 w-1/3 max-md:hidden">
          <Image
            src={BASE_ASSET_URL + patchNotes.image.url}
            alt=""
            unoptimized
            width={540}
            height={540}
            className="rounded-md drop-shadow-lg-dark"
          />
        </div>
        <div className="pt-[30vh]">
          <PublishDate date={patchNotes.date} />
        </div>
        <h1 className="text-pretty">{patchNotes.title}</h1>
        <div
          className="float-right clear-right mb-2 ml-6 w-1/3 rounded-sm border p-3 text-sm leading-5 max-md:w-full"
          id="table-of-contents"
        >
          <span className="font-semibold text-subtext1">Table of Contents</span>
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
      className="text-subtext0 no-underline hover:text-subtext1"
    >
      {section.text}
    </a>
  );
}

function DropdownItem({ section }: { section: ArticleSection }) {
  if (section.children.length === 0) {
    return (
      <div className="ml-6 text-pretty py-2">
        <DropdownLink section={section} />
      </div>
    );
  }

  return (
    <details open={section.children.length < 6}>
      <summary className="mt-2 cursor-pointer marker:text-xl">
        <div className="ml-1 inline-flex max-w-[calc(100%-2rem)] -translate-y-0.5 text-pretty">
          <DropdownLink section={section} />
        </div>
      </summary>
      <ul className="not-prose -mt-1 mb-1 ml-2">
        {section.children.map((header) => (
          <li
            key={header.id}
            style={{ marginLeft: header.level * 15, listStyleType: "'–'" }}
            className="my-2 text-pretty pl-2"
          >
            <DropdownLink section={header} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function parseHeader(
  domNode: Element,
  ids: Map<string, number>,
  articleSections: ArticleSection[],
  options: HTMLReactParserOptions,
) {
  const attribs = { ...domNode.attribs };
  const children = domNode.children as DOMNode[];

  const initialHeadingLevel = Number(domNode.name.at(-1));
  if (Number.isNaN(initialHeadingLevel)) return;

  let HElem = "p";

  if (!attribs.id && initialHeadingLevel < 6) {
    const headingText = textContent(domNode);
    if (headingText) {
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
  }

  return createElement(
    HElem,
    attribs,
    <>
      {domToReact(children, options)}
      <a
        href={"#" + attribs.id}
        className="ml-2 inline-block h-full text-subtext1 opacity-0 transition-opacity hover:text-subtext0 [:hover>&]:opacity-100"
      >
        #
      </a>
    </>,
  );
}

function parseCode(
  domNode: Element,
  options: {
    lang: (code: string) => Language;
    className: string;
    elem: string;
    scheme: Scheme;
  },
) {
  const code = textContent(domNode);
  const highlighted = highlightToHtml(code, options.lang(code), {
    scheme: options.scheme,
  });
  return parseHtml(highlighted, {
    replace(
      domNode: DOMNode,
    ): JSX.Element | string | null | boolean | object | void {
      if (domNode.type !== ElementType.Tag || domNode.name !== "pre") return;

      const props = attributesToProps(domNode.attribs);
      if ("className" in props) {
        props.className += ` ${options.className}`;
      } else {
        props.className = options.className;
      }
      const children = domNode.children as DOMNode[];

      return createElement(options.elem, props, domToReact(children));
    },
  });
}

function parseCodeBlock(domNode: Element) {
  return parseCode(domNode, {
    lang() {
      return "mcfunction";
    },
    className: "rounded-md border",
    elem: "pre",
    scheme: "mantle",
  });
}

function isResourceTag(code: string) {
  return /^#[a-z0-9._-]+(:[a-z0-9._-]+)?$/.test(code);
}

function parseCodeInline(domNode: Element) {
  return parseCode(domNode, {
    lang(code: string) {
      return isResourceTag(code) ? "resource-tag" : "mcfunction";
    },
    className: "rounded-md px-1",
    elem: "span",
    scheme: "crust",
  });
}
