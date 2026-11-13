// S7 Canned responses / macros (briefing p.16). Contract: docs/api-sprint-2.md "S7". The rules live
// in services/macroService.ts. Sending a macro reply goes through POST /api/tickets/:id/comments
// { body, macro_id, set_status } (services/extensions/commentMacro.ts).
import { Request, Response } from "express";
import * as macros from "../services/macroService";
import { HttpError, parseIntId, sendError } from "../utils/httpError";

const one = (value: unknown): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : null;
};

/** GET /api/macros?q=vpn (Agent, Lead: own department's active macros; Lead may add include_inactive=true) */
export const listMacros = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const includeInactive = ["true", "1"].includes(String(one(req.query.include_inactive) ?? "").toLowerCase());
    const list = await macros.listMacros(user, one(req.query.q), includeInactive);
    return res.status(200).json({ macros: list });
  } catch (error) {
    return sendError(res, error, "Macro list error");
  }
};

/** GET /api/macros/:id/render?ticket=1048 -> RenderedMacro with the placeholders filled */
export const renderMacro = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const macroId = parseIntId(req.params.id, "macro");
    const ticketParam = one(req.query.ticket) ?? one(req.query.ticket_id);
    if (!ticketParam) throw new HttpError(400, "Say which ticket the macro is for (?ticket=1048).");
    const ticketId = parseIntId(ticketParam.replace(/^hd-?/i, ""), "ticket");
    const rendered = await macros.renderMacro(user, macroId, ticketId);
    return res.status(200).json(rendered);
  } catch (error) {
    return sendError(res, error, "Macro render error");
  }
};

/** POST /api/macros (Department Lead of the department) */
export const createMacro = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const macro = await macros.createMacro(user, req.body ?? {});
    return res.status(201).json({ message: "Macro saved.", macro });
  } catch (error) {
    return sendError(res, error, "Macro create error");
  }
};

/** PATCH /api/macros/:id (Department Lead: edit or deactivate) */
export const updateMacro = async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  try {
    const macro = await macros.updateMacro(user, parseIntId(req.params.id, "macro"), req.body ?? {});
    return res.status(200).json({ message: "Macro saved.", macro });
  } catch (error) {
    return sendError(res, error, "Macro update error");
  }
};
