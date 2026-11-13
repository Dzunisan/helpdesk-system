// S7 Canned responses / macros (briefing p.16). OWNER: the macros feature. Contract:
// docs/api-sprint-2.md "S7". Sending a macro reply goes through POST /api/tickets/:id/comments
// { body, macro_id, set_status } (services/extensions/commentMacro.ts).
import { notImplemented } from "../utils/notImplemented";

/** GET /api/macros?q=vpn (Agent, Lead: own department's active macros; Lead may add include_inactive=true) */
export const listMacros = notImplemented("S7 GET /api/macros");

/** GET /api/macros/:id/render?ticket=1048 -> { body } with placeholders filled */
export const renderMacro = notImplemented("S7 GET /api/macros/:id/render");

/** POST /api/macros (Department Lead of the department) */
export const createMacro = notImplemented("S7 POST /api/macros");

/** PATCH /api/macros/:id (Department Lead: edit or deactivate) */
export const updateMacro = notImplemented("S7 PATCH /api/macros/:id");
