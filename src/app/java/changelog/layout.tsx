import { ScrollArea } from "~/components/ui/scroll-area";
import { getVersionManifest } from "~/server/java/versions";
import VersionLink from "~/components/java/version-link";

export default async function ChangelogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const versions = await getVersionManifest();

  return (
    <div className="grid grid-cols-[max-content_1fr] items-start gap-3 p-2">
      <div className="sticky top-[calc(theme(height.header)+theme(padding.2))]">
        <ScrollArea className="h-[calc(100vh-theme(height.header)-theme(padding.2)*2)] rounded-md border px-2 py-1">
          <ul>
            <li key="latest">
              <VersionLink
                versionName="Latest"
                versionLink=""
                shortText={versions.entries[0]?.shortText}
                title={versions.entries[0]?.title}
              />
            </li>
            {versions.entries.map((v) => {
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
