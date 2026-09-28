# SOAP MCP relay

Lets AI apps (Claude, ChatGPT, Gemini, …) reach SOAP when SOAP runs as a hosted web app. It's a small Cloudflare Worker: AI apps connect to `https://<relay>/mcp/<secret>`, the open SOAP tab connects to `wss://<relay>/bridge/<secret>`, and a Durable Object per secret passes calls between them. SOAP's own tab does the work and applies your AI switches; the relay stores only MCP session ids.

## Deploy (once, about 5 minutes)

You need a free Cloudflare account and Node.js.

```bash
cd relay
npm install
npx wrangler login      # opens the browser to sign in to Cloudflare
npx wrangler deploy
```

Wrangler prints the address, e.g. `https://soap-relay.<your-account>.workers.dev`.

Optional but recommended: only let your SOAP site open tab links. In `wrangler.toml` set

```toml
[vars]
ALLOWED_ORIGINS = "https://your-soap.vercel.app,http://localhost:3000"
```

and run `npx wrangler deploy` again.

## Point SOAP at it

In your Vercel (or Netlify) project settings, add the environment variable

```
VITE_SOAP_RELAY_URL=https://soap-relay.<your-account>.workers.dev
```

and redeploy SOAP. Users can also paste the address into **AI Bridges → Relay address** in SOAP.

## Use it

In SOAP, click the plug icon, turn on **AI access**, copy **Your AI link** and add it to your AI app (the panel shows the steps for Claude, ChatGPT and Gemini). The link is a secret: anyone who has it can use your open SOAP while AI access is on. **Reset** makes a new one.

## Develop

```bash
npm run dev             # relay on http://localhost:8787
```

Then in SOAP (AI Bridges → Online relay) set the relay address to `http://localhost:8787`.

Costs: Workers and SQLite-backed Durable Objects are on Cloudflare's free plan. The tab's connection uses the WebSocket Hibernation API, so an idle SOAP tab costs nothing between AI calls.
