/** Conversation on the left, a fixed-width properties column on the right from lg up (briefing p.32: properties 300px) */
export const TICKET_GRID = "grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem]";

/** The side column; sticky so the properties stay in view while the thread scrolls */
export const TICKET_ASIDE = "flex min-w-0 flex-col gap-6 lg:sticky";

/** Sticky offset: below the 64px portal top bar for employees; the staff shell has no top bar on desktop */
export const asideTop = (staff: boolean) => (staff ? "lg:top-10" : "lg:top-24");
