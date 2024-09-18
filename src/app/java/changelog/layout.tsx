import { ScrollArea } from "~/components/ui/scroll-area";
import {
  getVersionManifest,
  type VersionManifest,
} from "~/server/java/versions";
import VersionLink from "~/components/java/version-link";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import {
  ActivityLogIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import { fromError } from "zod-validation-error";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { Button } from "~/components/ui/button";

export default async function ChangelogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const maybeVersions = await getVersionManifest();
  if (!maybeVersions.success) {
    return (
      <div className="p-2">
        <Alert variant="destructive">
          <ExclamationTriangleIcon className="h-4 w-4" />
          <AlertTitle>Error loading version manifest</AlertTitle>
          <AlertDescription>
            {fromError(maybeVersions.error).toString()}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const versions = maybeVersions.data.entries;

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className="fixed right-0 z-10 m-1 gap-2 md:hidden"
          >
            <ActivityLogIcon />
            <span>Versions</span>
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Versions</SheetTitle>
            <SheetDescription>
              Select a version to view the changelogs for
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-full">
            <ul>
              <VersionLinks
                versions={versions}
                className="rounded-lg px-3 py-2"
              />
            </ul>
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <div className="grid grid-cols-[1fr] items-start gap-3 md:grid-cols-[minmax(10vw,max-content)_1fr]">
        <div className="sticky top-[calc(theme(height.header)+theme(padding.2))] ml-2 hidden md:block">
          <ScrollArea className="h-page rounded-md border">
            <ul>
              <li key="header" className="p-2">
                <h2 className="font-semibold">Versions:</h2>
              </li>
              <VersionLinks versions={versions} className="py-1 pl-3 pr-4" />
            </ul>
          </ScrollArea>
        </div>
        <div>{children}</div>
      </div>
    </>
  );
}

function VersionLinks({
  versions,
  className = "",
}: {
  versions: VersionManifest["entries"];
  className?: string;
}) {
  return (
    <>
      <li key="latest">
        <VersionLink
          versionName="Latest"
          versionLink=""
          data={versions[0]}
          className={className}
        />
      </li>
      {versions.map((v) => {
        return (
          <li key={v.version}>
            <VersionLink
              versionName={v.version}
              data={v}
              className={className}
            />
          </li>
        );
      })}
    </>
  );
}
