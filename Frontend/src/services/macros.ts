/**
 * S7 macros / canned responses (docs/api-sprint-2.md "S7"). Agents and Leads see their own
 * department's macros; only the lead creates and edits. Sending a macro reply is
 * tickets.addComment(id, { body, macro_id, set_status }).
 */
import { api, call } from "./apiClient";
import type {
  CreateMacroRequest,
  Macro,
  MacroListParams,
  MacroListResponse,
  MacroResponse,
  RenderedMacro,
  UpdateMacroRequest,
} from "@/types/api";

/** GET /api/macros?q=vpn: own department's active macros (leads may include_inactive) */
export const listMacros = async (params: MacroListParams = {}): Promise<Macro[]> =>
  (await call(() => api.get<MacroListResponse>("/macros", { params }), "Couldn't load macros.")).macros;

/** GET /api/macros/:id/render?ticket=1048: the body with placeholders filled for that ticket */
export const renderMacro = (macroId: number, ticketId: number) =>
  call(() => api.get<RenderedMacro>(`/macros/${macroId}/render`, { params: { ticket: ticketId } }), "Couldn't insert the macro.");

/** POST /api/macros (lead) */
export const createMacro = async (body: CreateMacroRequest): Promise<Macro> =>
  (await call(() => api.post<MacroResponse>("/macros", body), "Couldn't save the macro.")).macro;

/** PATCH /api/macros/:id (lead): edit, or { active: false } to deactivate */
export const updateMacro = async (macroId: number, body: UpdateMacroRequest): Promise<Macro> =>
  (await call(() => api.patch<MacroResponse>(`/macros/${macroId}`, body), "Couldn't save the macro.")).macro;
