# AgarVVV Project Documentation

## 1. Purpose

`AgarVVV Arena` is a customized Agar.io stack for `agarvvv.greener-business.com`.

The project combines:

- a patched `MultiOgarII` game server
- a patched `Cigar2` browser client
- a public skin upload flow
- an admin control panel
- runtime-editable JSON configuration
- custom bot behavior, including `NEW HUNTER`, `NEW SURVIVOR`, and `TEAM-BOTS`

This document is intended to serve as:

- architecture documentation
- deployment/operations documentation
- backup/restore documentation
- security notes for what should and should not be stored in a public Git backup

## 2. Live Topology

### Public URLs

- Main site: `https://agarvvv.greener-business.com/`
- Admin panel: `https://agarvvv.greener-business.com/adminvs/`
- Legacy admin path: `/admin/` is intentionally blocked with `404`

### Runtime network flow

1. Browser loads the public site from nginx.
2. nginx proxies HTTP traffic to the web process on `127.0.0.1:3100`.
3. Browser connects to WebSocket `/ws`.
4. nginx proxies `/ws` to the game process on `127.0.0.1:3400`.

### PM2 processes

- `agarvvv-web`
  - cwd: `/root/agario-server/client/Cigar2`
  - serves the client, admin UI, admin API, upload endpoints
- `agarvvv-game`
  - cwd: `/root/agario-server/server/MultiOgarII`
  - runs the WebSocket game server and writes live server state

PM2 ecosystem file:

- `/root/agario-server/ecosystem.config.cjs`

## 3. Directory Layout

### Core project folders

- `client/Cigar2/`
  - web UI
  - admin UI
  - public uploads
  - express server
- `server/MultiOgarII/`
  - actual game server
  - AI/bots
  - physics
  - runtime application logic
- `runtime/`
  - live JSON configuration and status files
- `deploy/nginx/`
  - nginx vhost configuration

### Reference folders

These exist as reference/source material and are not the live production code path:

- `ui-modules/`
- `physics-reference/`
- `frontend-ideas/`

## 4. Important Files

### Web/client entry

- `client/Cigar2/web/index.html`
- `client/Cigar2/web/assets/css/agarvvv.css`
- `client/Cigar2/web/assets/js/main_out.js`
- `client/Cigar2/web/assets/js/agarvvv-ui.js`

### Admin

- `client/Cigar2/web/admin/index.html`
- `client/Cigar2/web/assets/css/admin.css`
- `client/Cigar2/web/assets/js/admin.js`
- `client/Cigar2/webserver.js`

### Game server

- `server/MultiOgarII/src/Server.js`
- `server/MultiOgarII/src/Player.js`
- `server/MultiOgarII/src/Client.js`
- `server/MultiOgarII/src/ai/BotPlayer.js`
- `server/MultiOgarII/src/ai/BotLoader.js`
- `server/MultiOgarII/src/modules/runtime.js`

### Runtime storage helper

- `client/Cigar2/app/runtime-store.js`

## 5. Runtime JSON Files

### Files committed to the backup

- `runtime/server-settings.json`
  - live game/client settings
  - upload enablement
  - public title/subtitle
  - bot and physics-related live values
- `runtime/mode-presets.json`
  - named preset definitions
- `runtime/bots.json`
  - live bot profile mix and behavior assignment

### Files intentionally excluded from the public Git backup

- `runtime/admin.json`
  - contains live admin username and password hash/salt
  - excluded for security
- `runtime/control.json`
  - ephemeral command channel file
- `runtime/server-state.json`
  - ephemeral live server state
- `runtime/public-skin-quota.json`
  - ephemeral per-IP daily upload counters

### Example admin file

A safe template is included:

- `runtime/admin.example.json`

## 6. Public Skin Upload Flow

### Request path

- `POST /api/public/skins`

### Validation and processing

Uploads are handled by `client/Cigar2/webserver.js` and:

- accept `PNG`, `JPG`, `JPEG`
- reject oversized files
- decode with `sharp`
- resize to fit within `512x512`
- convert output to PNG
- save to `client/Cigar2/web/skins/`
- update `client/Cigar2/web/skinList.txt`

### Naming

Saved skin filenames use:

- sanitized base name
- random hex suffix

Example:

- `kraken-jpg-03f345.png`

### Public abuse controls

There are two separate public controls:

1. burst limiter
   - `5` requests per `10` minutes per IP
   - protects against short-term spam
2. successful upload quota
   - `3` successful uploads per day per IP
   - stored in `runtime/public-skin-quota.json`
   - resets automatically when the UTC day changes

### Client message behavior

When the daily quota is reached, the UI shows a clear error message including when uploads become available again.

## 7. Admin Panel

### Public path

- `/adminvs/`

### Legacy path

- `/admin/` is intentionally blocked

### Admin API

The UI path changed, but API routes remain under:

- `/api/admin/login`
- `/api/admin/logout`
- `/api/admin/session`
- `/api/admin/settings`
- `/api/admin/power`
- `/api/admin/command/reset-world`
- `/api/admin/command/broadcast`
- `/api/admin/skins`

### Notes

- UI path obscurity is not a security boundary by itself.
- Real access control still depends on the admin session cookie and password verification.

## 8. Bot Logic Summary

### Built-in logic labels in this project

- `balanced`
- `hunter`
- `new-hunter`
- `collector`
- `survivor`
- `new-survivor`
- `team-bots`

### `new-hunter`

Behavior goals:

- aggressive pursuit
- more disciplined split behavior
- avoids over-splitting itself into easy prey

Key traits:

- staged split capacity by total mass
- higher split advantage requirement
- nearby-threat check before splitting
- virus bypass while escaping as one cell

### `new-survivor`

Behavior goals:

- keep the conservative survivor behavior
- add a controlled virus-shot defensive mechanic

Key traits:

- only when single-cell
- only above `1500` mass
- only against a threatening larger enemy
- only when a virus is aligned between self and threat
- shot burst uses only the feeds needed up to a max of `9`
- cooldown roughly `250` ticks

### `team-bots`

Behavior goals:

- preserve the strong split discipline of `new-hunter`
- inherit virus-shot capability
- cooperate with same-logic allies without treating them as regular enemies

Key traits:

- other `team-bots` are neutral for chase/threat logic
- can feed a smaller ally toward roughly `500` mass when the donor is strong enough
- can coordinate split-part integration between two allies
- use pair locks so other team bots do not interrupt an active team action
- team actions do not override a high-value kill or urgent survival response

## 9. Frontend Notes

### Main lobby

The main page includes:

- nickname input
- dedicated visual selectors for:
  - `Main Skin`
  - `Multi Skin`
- preview panels for both skin slots
- server selector
- gallery
- upload panel

### Spawn reliability fix

The client now queues a `Play` request if the user clicks before the WebSocket becomes fully open.

This avoids the previous race condition where:

- user clicked `Play`
- socket was still connecting
- spawn packets were silently dropped
- player saw the map but never received their own cell

## 10. Deployment and Operations

### Start / restart with PM2

```bash
pm2 start /root/agario-server/ecosystem.config.cjs
pm2 restart agarvvv-web
pm2 restart agarvvv-game
pm2 show agarvvv-web
pm2 show agarvvv-game
```

### nginx

Primary nginx mapping file:

- `deploy/nginx/agarvvv.greener-business.com.conf`

Expected behavior:

- public HTTP/HTTPS -> `127.0.0.1:3100`
- `/ws` -> `127.0.0.1:3400`

### Syntax checks used during changes

```bash
node --check /root/agario-server/client/Cigar2/webserver.js
node --check /root/agario-server/client/Cigar2/web/assets/js/agarvvv-ui.js
node --check /root/agario-server/client/Cigar2/web/assets/js/main_out.js
node --check /root/agario-server/server/MultiOgarII/src/ai/BotPlayer.js
```

## 11. Backup and Restore Strategy

### What this Git backup is for

This backup is intended to preserve:

- all live application code
- deployment files
- runtime configuration that is safe to publish
- documentation
- uploaded skins and static assets, if present in the tree

### What is intentionally not public

Sensitive and ephemeral files are excluded:

- live admin credentials
- transient control commands
- transient server-state snapshots
- transient per-IP upload quota counters

### Restore steps on a new machine

1. Clone the backup repository.
2. Restore it to the desired path, for example:

```bash
git clone <repo> /root/agario-server
```

3. Recreate the real admin credentials file from secure storage:

```bash
cp runtime/admin.example.json runtime/admin.json
```

4. Install dependencies in the relevant packages if needed.
5. Recreate PM2 processes:

```bash
pm2 start /root/agario-server/ecosystem.config.cjs
```

6. Restore nginx configuration.
7. Verify:

```bash
curl -sk https://agarvvv.greener-business.com/health
```

### Files that may need secure/private backup outside Git

- `runtime/admin.json`
- any SSH keys
- any environment-specific nginx/private certificates
- any private uploaded assets that should not be public

## 12. Git Backup Notes

This backup repository was prepared as a production snapshot of the live project directory.

Recommended workflow after the first push:

```bash
git status
git add -A
git commit -m "Describe the change"
git push origin main
```

If the server remains the source of truth, keep this rule:

- make the live fix first
- verify on the live service
- then commit and push the same changes to Git

## 13. Security Notes

- The admin UI path was moved to `/adminvs/`, but the real protection is still authentication.
- Never commit `runtime/admin.json` to a public repository.
- Never rely on hidden routes as the only protection layer.
- Public upload limits reduce abuse but do not replace moderation or malware review of assets.

## 14. Maintenance Checklist

When changing the project, verify at least:

- client page loads
- WebSocket `/ws` connects
- clicking `Play` creates a cell
- admin panel loads on `/adminvs/`
- old admin path `/admin/` returns `404`
- public upload still works
- per-IP daily skin quota still blocks on the 4th successful upload of the day
- PM2 processes are online
