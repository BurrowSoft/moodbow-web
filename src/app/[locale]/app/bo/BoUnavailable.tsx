import { JournalUnavailable } from "@/components/JournalUnavailable";
import { GetHelpNow } from "@/components/SafetyCard";

// Bo's page couldn't read what it needs: Try again, and help, as on every other stop
// (bo.md). It says nothing about the conversation, which may be perfectly fine.
export function BoUnavailable({ country }: { country: string | null | undefined }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <JournalUnavailable />
      <GetHelpNow country={country} testId="bo-get-help" neutral />
    </div>
  );
}
