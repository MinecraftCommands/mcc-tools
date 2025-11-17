import "~/styles/game-versions.css";

import {
  ActivityLogIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import { fromError } from "zod-validation-error";

import {
  getVersionManifest,
  type VersionManifest,
} from "~/server/java/versions";

import ReleaseVersionLinkSet from "~/components/java/release-version-link-set";
import { type ReleaseVersionEntry } from "~/components/java/version-link";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";

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
            {typeof maybeVersions.error === "string"
              ? maybeVersions.error
              : fromError(maybeVersions.error).toString()}
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
        <SheetContent className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Versions</SheetTitle>
            <SheetDescription>
              Select a version to view the changelogs for
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-full">
            <div className="versions">
              <VersionLinks
                versions={versions}
                type="vertical"
                className="rounded-lg px-3 py-2"
              />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(10vw,max-content)_minmax(0,1fr)]">
        <div className="sticky top-[calc(theme(height.header)+theme(padding.2))] ml-2 hidden md:block">
          <ScrollArea
            className="h-page rounded-md border"
            viewportClassName="overscroll-contain"
          >
            <h2 key="header" className="p-2 font-semibold justify-self-center">
              Versions
            </h2>
            <div className="versions">
              <VersionLinks
                versions={versions}
                type="horizontal"
                className="py-1 pl-3 pr-4"
              />
            </div>
          </ScrollArea>
        </div>
        <div>{children}</div>
      </div>
    </>
  );
}

function VersionLinks({
  versions,
  type,
  className = "",
}: {
  versions: VersionManifest["entries"];
  type: string;
  className?: string;
}) {
  const orderedVersions: ReleaseVersionEntry[] = [
    {
      name: "Latest",
      url: "",
      title: versions[0].title,
      description: versions[0].shortText,
      image: versions[0].image,
      nonReleaseVersions: [],
      isLatest: true,
    },
  ];
  for (const version of versions) {
    if (version.type === "release") {
      orderedVersions.push({
        name: version.version,
        url: version.version,
        title: version.title,
        description: version.shortText,
        image: version.image,
        nonReleaseVersions: [],
        isLatest: false,
      });
      continue;
    }
    orderedVersions.at(-1)!.nonReleaseVersions.push({
      name: version.version,
      url: version.version,
      title: version.title,
      description: version.shortText,
      image: version.image,
    });
  }
  return orderedVersions.map((version) => (
    <ReleaseVersionLinkSet
      key={version.name}
      type={type}
      release={version}
      className={className}
    />
  ));
}
