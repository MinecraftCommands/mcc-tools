import { ScrollArea } from "~/components/ui/scroll-area";
import { getVersionManifest } from "~/server/java/versions";
import VersionLink from "~/components/java/version-link";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { fromError } from "zod-validation-error";

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
    <div className="grid grid-cols-[max-content_1fr] items-start gap-3 p-2">
      <div className="sticky top-[calc(theme(height.header)+theme(padding.2))]">
        <ScrollArea className="h-[calc(100vh-theme(height.header)-theme(padding.2)*2)] rounded-md border px-2 py-1">
          <ul>
            <li key="latest">
              <VersionLink
                versionName="Latest"
                versionLink=""
                shortText={versions[0].shortText}
                title={versions[0].title}
              />
            </li>
            {versions.map((v) => {
              return (
                <li key={v.version}>
                  <VersionLink
                    versionName={v.version}
                    shortText={v.shortText}
                    title={v.title}
                  />
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </div>
      <div>{children}</div>
    </div>
  );
}
