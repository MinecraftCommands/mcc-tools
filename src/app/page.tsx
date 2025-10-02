import Link from "next/link";

import { DiscordInvite } from "~/components/discord-invite";
import { SubredditLink } from "~/components/subreddit-link";
import { Badge } from "~/components/ui/badge";

const SOCIALS = [
  { Element: DiscordInvite, name: "Discord" },
  { Element: SubredditLink, name: "Reddit" },
];

export default async function Home() {
  return (
    <main className="container prose pt-8 lg:prose-xl dark:prose-invert">
      <h1>Welcome to MCC Gadgets!</h1>
      <h2>Tools for the Minecraft Commands community</h2>
      <p>
        Here you will find various tools, some to help with data/resource pack
        development, and some to improve the experience of the community
      </p>

      <h2>Where to find us</h2>
      <ul className="not-prose flex list-none flex-wrap gap-2">
        {SOCIALS.map(({ Element, name }) => (
          <li key={name}>
            <Badge variant="outline" className="py-2">
              <Element className="h-8 w-auto" />
              <span className="sr-only">{name}</span>
            </Badge>
          </li>
        ))}
      </ul>

      <h2>Want to contribute?</h2>
      <p>
        Report any{" "}
        <Link
          href="https://github.com/MinecraftCommands/mcc-tools/issues"
          target="_blank"
        >
          issues
        </Link>{" "}
        or submit{" "}
        <Link
          href="https://github.com/MinecraftCommands/mcc-tools/pulls"
          target="_blank"
        >
          pull requests
        </Link>{" "}
        at the{" "}
        <Link
          href="https://github.com/MinecraftCommands/mcc-tools"
          target="_blank"
        >
          GitHub repository
        </Link>
        {/* TODO: Link to the channel and describe how to obtain the self-role */}
        , or join the discussion in the mcc-tools channel in Discord.
      </p>
    </main>
  );
}