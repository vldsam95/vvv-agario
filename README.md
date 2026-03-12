# AgarVVV Arena

Custom Agar.io stack for `agarvvv.greener-business.com`.

## Main components

- `server/MultiOgarII`
  - patched game server
  - runtime-driven config
  - custom bot AI
- `client/Cigar2`
  - patched client
  - public skin uploads
  - admin UI + admin API
- `runtime/`
  - live JSON configuration and server state
- `deploy/nginx/`
  - nginx mapping for the site and `/ws`

## Live processes

- `agarvvv-game`
  - WebSocket game server on `127.0.0.1:3400`
- `agarvvv-web`
  - web/admin server on `127.0.0.1:3100`

Start both with:

```bash
pm2 start /root/agario-server/ecosystem.config.cjs
```

## Documentation

Detailed project, deployment, bot, security, upload-quota, backup and restore documentation:

- `docs/PROJECT-DOCUMENTATION.md`

## Security note

The public Git backup intentionally excludes:

- `runtime/admin.json`
- `runtime/control.json`
- `runtime/server-state.json`
- `runtime/public-skin-quota.json`

Use `runtime/admin.example.json` as the structure reference when restoring the project on a new machine.
