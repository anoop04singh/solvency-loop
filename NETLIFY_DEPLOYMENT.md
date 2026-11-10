# Netlify deployment and sign-in

Use Netlify's current OpenNext adapter for this Next.js 15 application. The runtime must be Node.js 22 or later, consistent with package.json. Keep npm lifecycle scripts enabled: npm ci applies the pinned MemWal client-injection patch. Do not deploy the app as a static export or add a catch-all SPA rewrite over its API routes.

## Environment

Set the variables listed in .env.example through Netlify's environment settings. Server-only secrets must be available to Functions; NEXT_PUBLIC_* configuration must also be available during the build. Set APP_ORIGIN to the exact public HTTPS origin, for example https://solvencyloop.netlify.app, without /app. Rebuild after configuration changes. Never copy owner verification-wallet private keys into host configuration.

/api/config reports missing configuration and key/address mismatches without returning secret values. A successful configuration check does not prove that relayer requests will complete or that a wallet has granted memory access.

## Sign-in uses bounded authenticated reads

The browser divides recall_all into sequential personal-memory, social-context and settlement-evidence requests. Each phase carries a fresh signed envelope and repeats the live wallet/profile/account/delegate checks. Evidence is verified in pages of at most five candidates, retaining the original total cap of 20. A hash binds continuation pages to the same selected evidence snapshot; changes fail closed and require a fresh sign-in.

Quiet Memory's existing in-memory key signs the phases without extra wallet popups. Individual-approval mode continues to require a signature for each request. The client aggregates the parts only after every phase and evidence page succeeds for the same owned account.

The browser requests NDJSON for these reads and recall_learning. After authenticating, the server immediately sends a keepalive and emits another every five seconds while work runs. Progress events describe real stages; keepalives are transport traffic and do not claim progress or success.

Only the final validated result completes sign-in. Disconnects, missing result frames, failed evidence checks and incomplete responses remain failures. There is no successful empty-memory fallback, no automatic financial retry, no new memory write and no change to account-wide consent or the one-hour Quiet Memory grant.

The workspace displays these real stages as an expandable loading timeline: authorization, account checks, personal memory, shared context, evidence verification and final result validation. Counts come from completed reads; elapsed time measures the current wait and is not a completion estimate. A failed phase pauses the timeline and leaves the dashboard closed. The same activity display appears during account refreshes and inside step dialogs for observed wallet, confirmation and refresh work. Motion stops for reduced-motion preferences, hidden tabs and data saver.

An observed pre-fix recall on 10 November 2026 returned HTTP 504 with an HTML **Inactivity Timeout** after about 33 seconds. Separate signed requests succeeded in approximately 28–31 seconds, making the failure intermittent. The buffered JSON response sent no data until all work completed.

The client also recognizes hosting timeout JSON and HTML, displays the HTTP status and an available Netlify request reference, and avoids exposing platform stacks. An interrupted autonomous command still requires checking its original on-chain receipt.

Streaming alone was insufficient on this site: a live NDJSON response delivered keepalives but was still truncated about 30 seconds after its first frame, immediately before evidence verification could finish. A local genuine Quiet Memory check completed the same 35-memory workload in 31.6 seconds. Splitting the work addresses this observed per-invocation cutoff; keepalives separately address idle gaps. No memory or financial write was requested by these diagnostics.

The phased handler subsequently loaded all 35 memories through real authenticated reads in about 50 seconds overall: personal memory took 8.9 seconds, social context 20.7 seconds, and the two evidence pages 12.4 and 8.0 seconds. Repeated bill and receipt reads are shared only within the social request; authorization and delegate state are never reused across phases. These timings describe that verification run, not a guaranteed provider latency.

## Total execution time is a separate limit

Netlify's current documentation lists a 60-second synchronous function limit, including streamed responses; the affected site's observed cutoff was shorter. The application's Next.js maxDuration = 300 declarations retain Vercel compatibility; they do not raise the host's actual limit. Keepalives address inactivity, not an invocation that exceeds its total budget.

If logs show the full function reaching that limit, investigate the named provider/stage and workload. Sustained operations beyond 60 seconds need a separately designed background/chunked workflow or a compatible host. Do not increase an unsupported configuration value, remove authentication, skip evidence verification, or retry a submitted financial action to hide a timeout.

## Check a release

1. Confirm that the new commit is deployed, then reload the workspace so it uses the new browser bundle.
2. Connect the actual wallet, authorize Quiet Memory and wait for personal insights.
3. In browser Network tools, /api/memory should show sequential signed recall_all phases (personal, social and evidence), each requesting Accept: application/x-ndjson. Successful responses should use the same media type.
4. Confirm that the response receives early frames and eventually a final result. A keepalive alone is not successful sign-in.
5. For a failure, use the displayed hosting request reference to find the invocation in Netlify's function logs. Keep signatures, grants, keys, memory contents and .env.local out of shared screenshots.

The route still rejects unsigned, tampered, expired and wrong-origin requests before starting a response stream.

References: [Netlify Next.js adapter](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [function limits](https://docs.netlify.com/build/functions/configuration/).
