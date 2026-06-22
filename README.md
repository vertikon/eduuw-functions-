# @vertikon/eduuw-functions

Runtime helpers for [eduuw](https://dashboard.eduuw.com.br) serverless **Functions** — TypeScript that reacts to WhatsApp events. Functions run isolated on the eduuw runtime (Cloudflare Workers for Platforms); this package gives you `defineFunction` and the `ctx` types/builder.

## Write a function

```ts
import { defineFunction } from "@vertikon/eduuw-functions";

export default defineFunction(async (event, ctx) => {
  if (event.type === "message.received") {
    // reply with an AI answer
    const reply = await ctx.ai.chat({ system: "Você é o atendente.", user: event.message!.text });
    await ctx.wa.sendText(event.message!.from, reply);
  }
});
```

- **Triggers:** `message.received`, `message.status`, `conversation.started`, `broadcast.sent`.
- **`ctx.wa`** — `sendText`, `sendTemplate`, `sendMedia`, `sendInteractive` (call back into the eduuw edge with a tenant-scoped key).
- **`ctx.ai.chat`** — one-shot LLM completion.
- **`ctx.secrets`** — per-function secrets configured in the dashboard.
- **`ctx.fetch`** — fetch with restricted egress.

You don't build `ctx` yourself — the eduuw runtime injects it via `createContext` when your function is triggered.

## License

MIT © Vertikon / eduuw
