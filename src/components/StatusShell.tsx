import { getTranslations } from "next-intl/server";
import { Logo } from "./Logo";

export { STATUS_BUTTON } from "./statusButton";

// The auth / status page layout, the same as /email-confirmed (UX, from
// Vitor's /auth/confirm at 1900 px: the page sat off-centre above the
// centred footer). A centred column: the stacked logo, then the heading,
// the body and the action(s), all centred. A form goes in `children` and
// keeps its own left-aligned fields inside the column.
export async function StatusShell({ title, body, children, testId }: { title: string; body?: React.ReactNode; children?: React.ReactNode; testId?: string }) {
  const tc = await getTranslations("common");
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-[560px] flex-col items-center">
        <div className="mb-10 w-[120px]">
          <Logo variant="stacked" width={120} alt={tc("logoAlt")} />
        </div>
        <div data-testid={testId} className="flex w-full flex-col items-center text-center">
          <h1 className="text-balance text-[28px] font-medium leading-tight tracking-tight sm:text-4xl">{title}</h1>
          {body !== undefined && <div className="mt-4 text-base leading-relaxed text-muted sm:text-[17px]">{body}</div>}
          {children !== undefined && <div className="mt-9 flex w-full flex-col items-center gap-4">{children}</div>}
        </div>
      </div>
    </main>
  );
}

