/**
 * @vertikon/eduuw-functions — runtime for eduuw serverless Functions.
 *
 * Your function imports `defineFunction` and exports the handler. The eduuw runtime
 * (Cloudflare Workers for Platforms) injects a `ctx` built with `createContext`, so your
 * code never touches raw credentials — `ctx.wa.*` calls back into the eduuw edge with a
 * tenant-scoped key.
 *
 * ```ts
 * import { defineFunction } from "@vertikon/eduuw-functions";
 *
 * export default defineFunction(async (event, ctx) => {
 *   if (event.type === "message.received") {
 *     await ctx.wa.sendText(event.message.from, `Você disse: ${event.message.text}`);
 *   }
 * });
 * ```
 */

export type TriggerType =
  | "message.received"
  | "message.status"
  | "conversation.started"
  | "broadcast.sent";

export interface InboundMessage {
  from: string;
  text: string;
  id?: string;
  type?: string;
}

export interface EduuwEvent {
  type: TriggerType;
  tenantId: string;
  /** present on message.received / conversation.started */
  message?: InboundMessage;
  /** raw provider payload, when you need fields not surfaced above */
  raw?: unknown;
}

export interface WAClient {
  sendText(to: string, content: string): Promise<any>;
  sendTemplate(to: string, templateName: string, language?: string, parameters?: Record<string, string>): Promise<any>;
  sendMedia(to: string, type: string, mediaId: string, caption?: string): Promise<any>;
  sendInteractive(to: string, interactive: Record<string, unknown>): Promise<any>;
}

export interface AIClient {
  /** One-shot chat completion via the eduuw AI (GLM). Returns the assistant text. */
  chat(opts: { system?: string; user: string }): Promise<string>;
}

export interface Ctx {
  tenantId: string;
  wa: WAClient;
  ai: AIClient;
  /** Per-function secrets configured in the dashboard. */
  secrets: Record<string, string>;
  /** Plain fetch (egress is restricted by the runtime). */
  fetch: typeof fetch;
  log: (...args: unknown[]) => void;
}

export type Handler = (event: EduuwEvent, ctx: Ctx) => Promise<void> | void;

/** Identity wrapper that types your handler. */
export function defineFunction(handler: Handler): Handler {
  return handler;
}

export interface ContextOptions {
  apiKey: string;
  tenantId: string;
  baseUrl?: string;
  secrets?: Record<string, string>;
  fetch?: typeof fetch;
  log?: (...args: unknown[]) => void;
}

const DEFAULT_BASE = "https://api.eduue.com.br/ext/v1/whatsapp";

/**
 * Build the `ctx` injected into a function. Called by the eduuw runtime wrapper — not
 * usually by your function code.
 */
export function createContext(opts: ContextOptions): Ctx {
  const f = opts.fetch || globalThis.fetch;
  const base = (opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  const tenantId = opts.tenantId;

  async function call(method: string, path: string, body?: unknown): Promise<any> {
    const headers: Record<string, string> = {
      "X-API-Key": opts.apiKey,
      Accept: "application/json",
      "X-Client": "eduuw-functions",
    };
    if (tenantId) headers["X-Tenant-ID"] = tenantId;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await f(`${base}/${path.replace(/^\/+/, "")}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
    return data;
  }

  const wa: WAClient = {
    sendText: (to, content) => call("POST", "messages/text", { to, content }),
    sendTemplate: (to, templateName, language = "pt_BR", parameters = {}) =>
      call("POST", "messages/template", { to, template_name: templateName, language, parameters }),
    sendMedia: (to, type, mediaId, caption) => call("POST", "messages/media", { to, type, media_id: mediaId, caption }),
    sendInteractive: (to, interactive) => call("POST", "messages/interactive", { to, interactive }),
  };

  const ai: AIClient = {
    chat: async ({ system, user }) => {
      // routed through the AI bot conversation endpoint of the edge
      const r = await call("POST", "ai/chat", { system, user });
      return (r && (r.reply || r.text || r.content)) || "";
    },
  };

  return {
    tenantId,
    wa,
    ai,
    secrets: opts.secrets || {},
    fetch: f,
    log: opts.log || ((...a: unknown[]) => console.log("[eduuw-fn]", ...a)),
  };
}

function safeJson(t: string): any {
  try { return JSON.parse(t); } catch { return { raw: t }; }
}
