import { ZodError } from "zod";
import { type PatchNotesQuery, getPatchNotes } from "~/server/java/versions";
import { fromError } from "zod-validation-error";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import sanitizeHtml from "sanitize-html";
import parseHtml, {
  domToReact,
  type HTMLReactParserOptions,
} from "html-react-parser";
import { ElementType } from "domelementtype";
import { Suspense, type JSX } from "react";
import type { DOMNode } from "html-dom-parser";
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

  const cleanPatchNotesHTML = sanitizeHtml(patchNotes.body, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  });

  const options: HTMLReactParserOptions = {
    replace(
      domNode: DOMNode,
    ): JSX.Element | string | null | boolean | object | void {
      if (domNode.type !== ElementType.Tag) return;

      // TODO: Determine the proper type here
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const HElem: any = HEADING_REDUCTION.get(domNode.name);

      if (!HElem) return;

      return (
        <HElem {...domNode.attribs}>
          {domToReact(domNode.children as DOMNode[], options)}
        </HElem>
      );
    },
  };

  const dom = parseHtml(cleanPatchNotesHTML, options);

  return (
    <div className="prose mx-auto dark:prose-invert lg:prose-xl">
      <h1>{patchNotes.title}</h1>
      {dom}
    </div>
  );
}

const HEADING_REDUCTION = new Map([
  ["h1", "h2"],
  ["h2", "h3"],
  ["h3", "h4"],
  ["h4", "h5"],
  ["h5", "h6"],
  ["h6", "p"],
]);
