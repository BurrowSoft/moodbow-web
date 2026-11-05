import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

// For a section of settings that save on change: until the page's code has
// run, a change would show and never be saved, so the section takes no input.
// Nothing changes on screen when the code comes quickly; after a second it
// looks disabled ([data-until-loaded], globals.css). Spread it on the section.
export function useUntilLoaded(): { inert?: true; "data-until-loaded"?: "" } {
  const loaded = useSyncExternalStore(noSubscribe, () => true, () => false);
  return loaded ? {} : { inert: true, "data-until-loaded": "" };
}
