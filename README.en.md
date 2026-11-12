# OBS — University Student Information System

[Türkçe](README.md) · **English**

An open source, multi-tenant **University Student Information System (SIS)**, built
for Turkish universities (regulation-aware grading, GPA, graduation and board
workflows). One codebase supports two deployment modes: **on-premise** (the
university runs it on its own infrastructure) and **SaaS** (managed, shared
environment).

> Most documentation under `docs/` is currently written in Turkish. The web demo UI
> supports Turkish and English (use the **TR/EN** switch in the top bar).

## Architecture at a glance

- **Backend:** TypeScript + NestJS, a **modular monolith** (not microservices).
  Web (REST API) and worker (BullMQ background jobs) run from the same image.
  See [ADR-0001](docs/ADR/0001-stack-moduler-monolit.md).
- **Database:** PostgreSQL 16, with **Drizzle** ORM
  ([ADR-0002](docs/ADR/0002-orm-drizzle.md)).
- **Multi-tenancy:** shared database, `tenant_id` on every table and PostgreSQL
  **Row-Level Security (RLS)**; the `app` role cannot bypass RLS
  ([ADR-0003](docs/ADR/0003-multitenancy-rls.md)).
- **Deployment:** `DEPLOYMENT_MODE=single-tenant|multi-tenant`
  ([ADR-0004](docs/ADR/0004-deployment-modes.md)).
- **Stack:** PostgreSQL 16, Redis + BullMQ, React / React Native, REST + OpenAPI 3,
  S3-compatible storage (MinIO), Argon2id password hashing, TOTP 2FA.

**Key principle:** academic rules (letter-grade thresholds, GPA rounding, attendance,
ECTS limits, retake policy, honor thresholds, …) are **not hard-coded**. They are
database parameters per tenant, program and regulation year. See
[ASSUMPTIONS.md](docs/ASSUMPTIONS.md) (Turkish).

## Quick start

Requirements: Node.js (LTS), Docker.

```bash
corepack enable          # enable pnpm
pnpm install             # dependencies
pnpm infra:up            # PostgreSQL + Redis + MinIO (docker compose)
pnpm db:migrate          # schema + RLS policies
pnpm db:seed             # demo tenant, parameters and sample data
pnpm dev                 # web + worker (development)
```

The demo web app lives in `apps/demo-web` (Next.js). Demo accounts are listed on its
login page; they only exist after seeding the demo data.

## Internationalization (demo web)

`apps/demo-web/lib/i18n.tsx` provides a tiny dictionary-based translation layer: the
Turkish source string is the key and `apps/demo-web/lib/en.ts` holds the English text.
Untranslated strings simply stay in Turkish, so pages can be translated incrementally.
To translate a string, wrap it with `t()` from `useI18n()` and add a line to `en.ts`.

## License

[GNU AGPL-3.0](LICENSE). If you modify the software and offer it as a network service,
you must make your modified source available under the same license.
