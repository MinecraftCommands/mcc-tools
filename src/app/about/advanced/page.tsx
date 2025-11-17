import { env } from "~/env";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

export const dynamic = "force-dynamic";

export default function AdvancedSiteInfo() {
  // WARNING: Be **very** careful about what you expose here,
  // since this is a server component it is able to expose server side only environment variables,
  // which includes things like API tokens and other secrets
  // **DO NOT** expose things that must be secret

  return (
    <main className="container prose pt-8 lg:prose-xl dark:prose-invert">
      <h1>Advanced information about MCC Gadgets</h1>
      <p>
        Warning! Here be dragons! This page presents various pieces of advanced
        information about the website, you probably don&apos;t need to know
        about this stuff, maybe think again about what brought you to this page
      </p>
      <p>
        Eventually this page will be locked behind specific permissions, but
        currently that isn&apos;t implemented
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Key</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <EnvVarRow envVar="NODE_ENV" />
        </TableBody>
      </Table>
    </main>
  );
}

function EnvVarRow({
  envVar,
  children,
}: {
  envVar: keyof typeof env;
  children?: React.ReactNode;
}) {
  const value = env[envVar];
  return (
    <TableRow>
      <TableCell>{envVar}</TableCell>
      <TableCell>
        {typeof value === "undefined" ? "undefined" : value}
      </TableCell>
      <TableCell>{children}</TableCell>
    </TableRow>
  );
}
