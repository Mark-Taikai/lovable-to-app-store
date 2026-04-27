# Security Policy

## Reporting a vulnerability

If you discover a security issue with this plugin — for example, a workflow that exposes credentials, a template that defaults to insecure configuration, or a memory file that stores something it shouldn't — **please do not open a public issue.**

Instead:

1. Open a [private security advisory](https://github.com/Mark-Taikai/lovable-to-app-store/security/advisories/new) on this repository, **or**
2. Open a regular GitHub issue with the title `[Security] Please contact me privately` and no further details — a maintainer will reach out.

We aim to acknowledge security reports within 48 hours and ship a fix within 14 days for critical issues.

## What counts as a security issue

- Workflows that cause `.p8`, `.keystore`, or other signing material to be committed to a public repo by default
- Memory schemas that store passwords or other credentials in plain text
- Edge function templates that expose service-role keys to client code
- Default configurations that send user data to a third party without disclosure
- Documentation that recommends an unsafe practice (e.g. reusing account passwords for CERT_PASS)

## What's NOT a security issue

- "The plugin asked me for my password" — yes, the plugin needs you to authenticate to your own Apple/Google accounts. It does not store these passwords.
- "GitHub Actions has my ASC_KEY_CONTENT secret" — that's by design; it's how the CI signs your build. As long as the secret is in GitHub Actions secrets (encrypted at rest, only decrypted in CI runners), it's safe.
- "My Lovable URL is in `capacitor.config.ts`" — by design; that's how the WebView knows where to load from. Lovable URLs are not secrets.

## Supported versions

| Version | Supported |
|---|---|
| 1.1.x | ✅ |
| < 1.1 | ⚠️ Please upgrade |

We backport security fixes to the most recent minor version only. If you're on an older version, the upgrade path is usually a `git pull` (or `/plugin update`).
