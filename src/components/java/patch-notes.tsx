import { ZodError } from "zod";
import { type PatchNotesQuery, getPatchNotes } from "~/server/java/versions";
import { fromError } from "zod-validation-error";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { ExclamationTriangleIcon, TriangleUpIcon } from "@radix-ui/react-icons";
import sanitizeHtml from "sanitize-html";
import parseHtml, {
  domToReact,
  type HTMLReactParserOptions,
} from "html-react-parser";
import { ElementType } from "domelementtype";
import { Suspense, type JSX } from "react";
import type { DOMNode } from "html-dom-parser";
import { Skeleton } from "../ui/skeleton";
import { toKebabCase } from "~/lib/utils";
import { BASE_ASSET_URL } from "~/server/java/versions";
import { type DataNode, type Element } from "domhandler";
import "~/styles/patch-notes.css";

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
  text?: string,
  id?: string,
  children: ArticleSubSection[]
}

type ArticleSubSection = {
  text?: string,
  id?: string,
  level: number
}

async function PatchNotesImpl({
  version = { latest: true },
}: {
  version?: PatchNotesQuery;
}) {
  const maybePatchNotes = await getPatchNotes(version);
  if (!maybePatchNotes.success) {
    let msg: string;

    if (maybePatchNotes.error instanceof ZodError) {
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

  const options: HTMLReactParserOptions = {
    replace(
      domNode: DOMNode,
    ): JSX.Element | string | null | boolean | object | void {
      if (domNode.type !== ElementType.Tag) return;

      // TODO: Determine the proper type here
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const HElem: any = HEADING_REDUCTION.get(domNode.name);

      if (!HElem) return;

      const attribs = { ...domNode.attribs };
      const children = domNode.children as DOMNode[];

      if (!attribs.id && children[0]?.type === ElementType.Text) {
        const headingText: string = children.map(child =>
          (child as DataNode)?.data ||
          ((child as Element).children[0] as DataNode)?.data
        ).join("");
        const id = toKebabCase(headingText);
        const headingLevel = Number((HElem as string).at(-1)) - 2;

        attribs.id = id;

        const section = articleSections.at(-1);
        if ((HElem as string).startsWith("h")) {
          if (headingLevel > 0 && section) {
            section.children.push({
              text: headingText,
              id: id,
              level: headingLevel
            })
          } else {
            articleSections.push({
              text: headingText,
              id: id,
              children: []
            })
          }
        }
      }

      return <HElem {...attribs}>
        {domToReact(children, options)}
        <a href="#table-of-contents" className="text-foreground/60 ml-6">
          <TriangleUpIcon className="inline scale-150"/>
        </a>
      </HElem>;
    },
  };

  const dom = parseHtml(cleanPatchNotesHTML, options);
  const dateFormat: Intl.DateTimeFormatOptions = {day: "numeric", weekday: "long", month: "long", year: "numeric"};
  const publicationDate = new Date(patchNotes.date).toLocaleDateString(undefined, dateFormat);

  return (
    <div>
      <div className="relative h-[60vh] bg-cover bg-center" style={{backgroundImage: `url(${BASE_ASSET_URL + patchNotes.image.url})`}}>
        <div className="bg-gradient-to-t from-background w-full h-full block absolute top-0"></div>
      </div>
      <div className="prose mx-auto dark:prose-invert lg:prose-xl prose-sm -translate-y-[30vh] p-2">
        <span className="dark:text-gray-500 text-sm font-semibold text-gray-700">{publicationDate}</span>
        <h1>{patchNotes.title}</h1>
        <div className="text-sm border rounded-sm p-3 w-1/3 leading-5 float-right ml-6 mb-2 max-md:w-full max-w-1/2" id="table-of-contents">
          <span className="font-semibold text-foreground/80 lg:list-none">Table of Contents</span>
          {articleSections.map(section => (
            <DropdownItem key={section.id} section={section}/>
          ))}
        </div>
        {dom}
      </div>
    </div>
  );
}

function DropdownLink({section}: {section: ArticleSection | ArticleSubSection}) {
  return (
    <a href={'#' + section.id} className="no-underline text-foreground/60 hover:text-foreground/80 inline-block leading-snug">
      {section.text}
    </a>
  )
}

function DropdownItem({section}: { section: ArticleSection }) {
  if (section.children.length === 0) {
    return <div className="ml-6 py-1">
      <DropdownLink section={section}/>
    </div>
  }

  return (
    <details open={section.children.length < 6}>
      <summary className="relative cursor-pointer marker:text-xl">
        <div className="inline-flex max-w-[calc(100%-2rem)] ml-1 -translate-y-0.5">
          <DropdownLink section={section}/>
        </div>
      </summary>
      <ul className="!-mt-1 !mb-1 -ml-2">
        {section.children.map(header => (
          <li key={header.id} style={{marginLeft: (header.level) * 15, listStyleType: "'–'"}} className="!my-1">
            <DropdownLink section={header}/>
          </li>
        ))}
      </ul>
    </details>
  )
}

const HEADING_REDUCTION = new Map([
  ["h1", "h2"],
  ["h2", "h3"],
  ["h3", "h4"],
  ["h4", "h5"],
  ["h5", "h6"],
  ["h6", "p"],
]);
