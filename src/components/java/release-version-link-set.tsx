"use client";

import { usePathname } from "next/navigation";
import VersionLink, { type ReleaseVersionEntry } from "./version-link";

export default function ReleaseVersionLinkSet({release, type, className}: {
  release: ReleaseVersionEntry;
  type: string;
  className: string;
}) {
  const selectedVersion = useVersion();
  return (
    <div className="major-version">
      <VersionLink version={release} selected={release.name === selectedVersion} className={className} />
      {
        release.nonReleaseVersions.length > 0 && <>
          <input type="checkbox" id={`major-version-${release.name}-${type}`} defaultChecked={containsVersion(release, selectedVersion)}></input>
          <label className="major-version-button" htmlFor={`major-version-${release.name}-${type}`}></label>
          <div className="major-version-body">
            {release.nonReleaseVersions.map(nonReleaseVersion => <VersionLink key={nonReleaseVersion.name} version={nonReleaseVersion} selected={nonReleaseVersion.name === selectedVersion} className={className} />)}
          </div>
        </>
      }
    </div>
  );
}

function useVersion(): string {
  const prefix = "java/changelog/";
  const pathname = usePathname();
  if (pathname === prefix) {
    return "";
  }
  const probableVersion = pathname.substring(prefix.length);
  if (probableVersion.startsWith("/")) {
    return probableVersion.substring(1);
  }
  return probableVersion;
}

function containsVersion(release: ReleaseVersionEntry, version: string): boolean {
  if (release.isLatest && version === "") {
    return true;
  }
  if (release.name === version) {
    return true;
  }
  return release.nonReleaseVersions.some(nonRelease => nonRelease.name === version);
}
