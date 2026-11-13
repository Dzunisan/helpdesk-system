import { createContext, useContext, useEffect } from "react";

/**
 * Lets a detail page tell the shell which nav item it belongs to. A ticket opened from
 * "Unassigned" should light up Unassigned, not My open; the URL alone can't say that.
 */
export interface NavHighlight {
  /** The nav href to highlight instead of the URL match, or null for the URL match */
  href: string | null;
  setHref: (href: string | null) => void;
}

export const NavHighlightContext = createContext<NavHighlight>({ href: null, setHref: () => {} });

/** Highlight the nav item for `href` while this page is shown (null: leave it to the URL) */
export function useNavHighlight(href: string | null | undefined) {
  const { setHref } = useContext(NavHighlightContext);
  useEffect(() => {
    setHref(href ?? null);
    return () => setHref(null);
  }, [href, setHref]);
}

/** The current override, for the shell */
export const useNavHighlightHref = () => useContext(NavHighlightContext).href;
