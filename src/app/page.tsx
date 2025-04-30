import Link from "next/link";

import { DiscordInvite } from "~/components/discord-invite";
import { SubredditLink } from "~/components/subreddit-link";
import { Badge } from "~/components/ui/badge";

// import { CreatePost } from "~/app/_components/create-post";
// import { auth } from "~/server/auth";
// import { api } from "~/trpc/server";

const SOCIALS = [
  { Element: DiscordInvite, name: "Discord" },
  { Element: SubredditLink, name: "Reddit" },
];

export default async function Home() {
  // const hello = await api.post.hello({ text: "from tRPC" });
  // const session = await auth();

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
      {/* <div className="flex flex-col items-center gap-2">
        <p className="text-2xl text-white">
          {hello ? hello.greeting : "Loading tRPC query..."}
        </p>

        <div className="flex flex-col items-center justify-center gap-4">
          <p className="text-center text-2xl text-white">
            {session && <span>Logged in as {session.user?.name}</span>}
          </p>
          <Link
            href={session ? "/api/auth/signout" : "/api/auth/signin"}
            className="rounded-full bg-white/10 px-10 py-3 font-semibold no-underline transition hover:bg-white/20"
          >
            {session ? "Sign out" : "Sign in"}
          </Link>
        </div>
      </div>

      <CrudShowcase /> */}
    </main>
  );
}

// async function CrudShowcase() {
//   const session = await getServerAuthSession();
//   if (!session?.user) return null;

//   const latestPost = await api.post.getLatest();

//   return (
//     <div className="w-full max-w-xs">
//       {latestPost ? (
//         <p className="truncate">Your most recent post: {latestPost.name}</p>
//       ) : (
//         <p>You have no posts yet.</p>
//       )}

//       <CreatePost />
//     </div>
//   );
// }
