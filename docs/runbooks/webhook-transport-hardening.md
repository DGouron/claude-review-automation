# Webhook transport hardening runbook (SPEC-201)

This runbook documents how to deploy the webhook ingress so that the only network
path to the handler is: TLS terminated by a reverse proxy on loopback, forwarded
over a single trusted hop, from an allowlisted platform IP range. It also documents
the token rotation/revocation procedure (AC9) and the root trust assumption (AC10).

## Configuration

The app reads three environment values for the transport guard:

| Variable | Meaning | Default |
|---|---|---|
| `WEBHOOK_TRUSTED_HOP` | The single hop (loopback proxy address) the app accepts connections from | `127.0.0.1` |
| `WEBHOOK_ALLOWED_CIDR_RANGES` | Comma-separated IPv4 CIDR ranges of the platform | empty (rejects all until set) |
| `GITLAB_WEBHOOK_TOKEN` | The shared webhook token, re-read on every verification | (required) |

The app binds to loopback only; TLS is terminated at the proxy. `trust proxy`
is scoped to `WEBHOOK_TRUSTED_HOP` (never `true`, never a broad subnet). The
accept/reject decision is taken solely by the transport guard from the raw socket
address and explicit `X-Forwarded-Proto` / `X-Forwarded-For` headers — never from
framework-derived `req.protocol` / `req.ip`.

## Reverse proxy: bind app to loopback

Run the app with the listener reachable only from the proxy (loopback). The proxy
must set `X-Forwarded-Proto` itself and must NOT pass a client-supplied value
through.

### nginx

```nginx
server {
  listen 443 ssl;
  server_name reviewflow.example.com;

  ssl_certificate     /etc/letsencrypt/live/reviewflow.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/reviewflow.example.com/privkey.pem;

  location /webhooks/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    # Set by the proxy; never trust a client-supplied value.
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For   $remote_addr;
  }
}
```

### Caddy

```caddy
reviewflow.example.com {
  reverse_proxy /webhooks/* 127.0.0.1:3000 {
    header_up X-Forwarded-Proto https
    header_up X-Forwarded-For {remote_host}
  }
}
```

### Traefik (dynamic config)

```yaml
http:
  routers:
    reviewflow-webhooks:
      rule: "Host(`reviewflow.example.com`) && PathPrefix(`/webhooks/`)"
      entryPoints: [websecure]
      tls: {}
      service: reviewflow
  services:
    reviewflow:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:3000"
        # Traefik sets X-Forwarded-* from the connection; ensure the entrypoint
        # forwardedHeaders.trustedIPs is the proxy hop only, never the client.
```

## Token rotation / revocation (AC9)

`GITLAB_WEBHOOK_TOKEN` is re-read from the environment on every verification, so
the secret can be rotated **without redeploying or restarting** the process.
Comparison is uniformly constant-time (`timingSafeEqual` over fixed-length digests);
there is no length-based short circuit that could leak token length.

Rotation cadence: rotate on a fixed schedule (at least quarterly) and immediately
on any suspected leak.

Procedure to rotate (and to revoke a compromised token):

1. Generate a new high-entropy token.
2. Update `GITLAB_WEBHOOK_TOKEN` in the process environment and refresh it
   (e.g. `systemctl set-environment` + reload, or update the secret store and
   trigger an env refresh) — no redeploy required.
3. Update the GitLab webhook secret token to the new value.
4. The old token is immediately invalid: the next verification reads the new value.

## Root trust assumption (AC10)

GitLab does not sign the webhook body. Therefore **token confidentiality is the
root trust assumption** of the entire webhook surface. Identity fields in the
payload (e.g. `event.user.id`) are trusted **only transitively via token
possession** — they are not independently verified. Any field that requires
stronger assurance MUST be re-fetched from an authenticated GitLab API call
(the `threadFetchGateway.fetchThreads` trusted-source pattern, cf. SPEC-196 AC9 /
SPEC-198 AC-10), never read from the webhook body.

Transport hardening is a necessary but not sufficient condition for trust:
- The IP allowlist bounds probability, not impact, and is a secondary defense; on
  shared SaaS ranges it proves nothing about which project sent the webhook.
- Actor authenticity / confused-deputy control is SPEC-197.
- Replay protection (`X-Gitlab-Event-UUID` de-duplication) is SPEC-200; a perfect
  replay survives every transport guard.

Because SPEC-197 is inoperative if the token leaks, the rotation/revocation
procedure above (AC9) is load-bearing, not cosmetic.
