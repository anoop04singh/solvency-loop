# Netlify deployment and sign-in

Use Netlify's current OpenNext adapter for this Next.js 15 application. The runtime must be Node.js 22 or later, consistent with package.json. Keep npm lifecycle scripts enabled: npm ci applies the pinned MemWal client-injection patch. Do not deploy the app as a static export or add a catch-all SPA rewrite over its API routes.

## Environment

Set the variables listed in .env.example through Netlify's environment settings. Server-only secrets must be available to Functions; NEXT_PUBLIC_* configuration must also be available during the build. Set APP_ORIGIN to the exact public HTTPS origin, for example https://solvencyloop.netlify.app, without /app. Rebuild after configuration changes. Never copy owner verification-wallet private keys into host configuration.

/api/config reports missing configuration and key/address mismatches without returning secret values. A successful configuration check does not prove that relayer requests will complete or that a wallet has granted memory access.

## Sign-in uses a live response stream

The browser requests NDJSON for recall_all and recall_learning. The server authenticates the wallet request first, then immediately sends a keepalive and emits another every five seconds while the actual account, Walrus recall and chain-evidence checks run. Progress events describe real stages; keepalives are transport traffic and do not claim progress or success.

Only the final validated result completes sign-in. Disconnects, missing result frames, failed evidence checks and incomplete responses remain failures. There is no successful empty-memory fallback, no automatic financial retry, no new memory write and no change to account-wide consent or the one-hour Quiet Memory grant.

An observed pre-fix recall on 10 November 2026 returned HTTP 504 with an HTML **Inactivity Timeout** after about 33 seconds. Separate signed requests succeeded in approximately 28–31 seconds, making the failure intermittent. The buffered JSON response sent no data until all work completed. The streaming path prevents this idle gap on adapters/proxies that forward streaming responses.

The client also recognizes hosting timeout JSON and HTML, displays the HTTP status and an available Netlify request reference, and avoids exposing platform stacks. An interrupted autonomous command still requires checking its original on-chain receipt.

A genuine Quiet Memory verification against the patched handler and live Tatum/Walrus data returned its first frame in 96 ms and completed in 31.6 seconds with all 35 recalled memories for the affected verification wallet. No memory or financial write was requested. This verifies handler behavior; the deployed Netlify adapter must also forward the stream after the release is rebuilt.

## Total execution time is a separate limit

Netlify documents a 60-second synchronous function limit, including streamed responses. The application's Next.js maxDuration = 300 declarations retain Vercel compatibility; they do not raise Netlify's limit. Keepalives address inactivity, not an invocation that exceeds its total budget.

If logs show the full function reaching that limit, investigate the named provider/stage and workload. Sustained operations beyond 60 seconds need a separately designed background/chunked workflow or a compatible host. Do not increase an unsupported configuration value, remove authentication, skip evidence verification, or retry a submitted financial action to hide a timeout.

## Check a release

1. Confirm that the new commit is deployed, then reload the workspace so it uses the new browser bundle.
2. Connect the actual wallet, authorize Quiet Memory and wait for personal insights.
3. In browser Network tools, /api/memory for sign-in should request Accept: application/x-ndjson; the successful response should use the same media type.
4. Confirm that the response receives early frames and eventually a final result. A keepalive alone is not successful sign-in.
5. For a failure, use the displayed hosting request reference to find the invocation in Netlify's function logs. Keep signatures, grants, keys, memory contents and .env.local out of shared screenshots.

The route still rejects unsigned, tampered, expired and wrong-origin requests before starting a response stream.

References: [Netlify Next.js adapter](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [function limits](https://docs.netlify.com/build/functions/configuration/).
