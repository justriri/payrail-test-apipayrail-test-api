# payrail-test-api

A tiny, dependency-free JSON API for trying the Payrail seller-listing flow.

| Endpoint | Returns |
|---|---|
| `GET /health` | `{"status":"ok", ...}` |
| `GET /api/hello` | sample JSON with a fresh `asOf` timestamp (**this is the URL to list in Payrail**) |
| `GET /.well-known/payrail-verification.txt` | the Payrail ownership proof, once configured |

```
npm start      # PORT defaults to 3000
npm test
```

## Deploy on Render (free)

1. Render dashboard > **New > Blueprint** > choose this repository (`render.yaml` is read automatically), or **New > Web Service** with build command `npm install` and start command `npm start`.
2. You get a public HTTPS URL like `https://payrail-test-api.onrender.com`. Check `https://<your-url>/health`.

Free-plan limits (Render docs): the service spins down after 15 minutes without traffic and takes about a minute to wake. Payrail waits only 8 seconds for a seller API, so wake the service (open `/health`) right before a Payrail test or purchase, or keep it awake with a free uptime pinger every 10 minutes. 750 free instance hours per month per workspace.

## Prove domain ownership to Payrail

Payrail only lists an API after the seller proves control of its host. For a host you cannot add DNS records to (such as `*.onrender.com`) use the file proof:

1. In Payrail, submit the listing with the endpoint `https://<your-url>/api/hello` (no query string, https, port 443). Payrail shows a verification value that looks like `payrail-verify=<48 hex characters>`.
2. In Render > your service > **Environment**, set `PAYRAIL_VERIFICATION` to that token (the 48 characters, or the whole `payrail-verify=...` value) and let it redeploy.
3. Check `https://<your-url>/.well-known/payrail-verification.txt`: it must show exactly `payrail-verify=<token>`.
4. In Payrail press **Check file**, sign the wallet challenge, then continue (credential, response contract, publish).

The server never invents a proof: with no (or a malformed) `PAYRAIL_VERIFICATION` the file answers 404. One token is served at a time, so verify one listing per host.

### Easier: verify with GitHub (no token in Render)
In Payrail's listing page choose **Verify with GitHub**, connect GitHub and enter this repository. Payrail shows a prefilled GitHub link that creates `.well-known/payrail-verification.txt` containing `payrail-verify=<token>`: press Commit, let Render redeploy, and press **Check now**. The API serves the committed file by itself (`PAYRAIL_VERIFICATION` still wins if set). Payrail checks that the file is in the repository (you need write access), that your live API serves the same file, and that the endpoint answers with JSON.
