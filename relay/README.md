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

and redeploy SOAP. Users can also paste the address into SOAP under plug icon → **More options** → Connection.

## Use it

In SOAP, click the plug icon. **Add to Claude** downloads a personal Claude Desktop extension (open it and click Install); **Copy command** copies the Codex setup command. Both contain the user's private link, which works like a password — **Reset** under More options makes a new one.

## Develop

```bash
npm run dev             # relay on http://localhost:8787
```

Then in SOAP (plug icon → More options → Online relay) set the relay address to `http://localhost:8787`.

Costs: Workers and SQLite-backed Durable Objects are on Cloudflare's free plan. The tab's connection uses the WebSocket Hibernation API, so an idle SOAP tab costs nothing between AI calls.
