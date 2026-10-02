import Link from "next/link";
import { fontVariables } from "@/lib/fonts";

// Fallback for requests that never reach a locale (the proxy routes almost
// everything to [locale], so this is rare). English only, by necessity.
export default function RootNotFound() {
  return (
    <html lang="en" className={fontVariables}>
      <body className="flex min-h-dvh flex-col items-center justify-center px-6 text-center font-sans">
        <h1 className="text-3xl font-medium">Page not found</h1>
        <p className="mt-4 text-muted">
          <Link href="/" className="font-medium text-accent underline underline-offset-4">
            Go to the home page
          </Link>
        </p>
      </body>
    </html>
  );
}
