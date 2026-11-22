# Deploying stockwatch.cloud

The app runs on the Hostinger VPS (Ubuntu 24.04, `148.230.122.94`) next to
martindann.com:

```
Internet ──443──▶ nginx ──┬─ /api/*  ──▶ Express on 127.0.0.1:3001 (PM2 "stockwatch")
                          └─ else    ──▶ current/client/dist (static Vue build)
                                         Express ──▶ Postgres 16 on localhost
```

| What | Where |
|---|---|
| App user | `stockwatch` (own nvm Node 24.22.3, pnpm, PM2; PM2 starts on boot via `pm2-stockwatch.service`) |
| Releases | `/var/www/stockwatch.cloud/releases/<sha>`, with `current` → the live one |
| Secrets | `/home/stockwatch/config/.env` (mode 600, never in git) |
| nginx site | `/etc/nginx/sites-available/stockwatch.cloud`, from `deploy/nginx-stockwatch.conf` plus certbot's TLS lines |
| TLS | Let's Encrypt for `stockwatch.cloud` and `www`, renewed by `certbot.timer` |
| Database | Postgres 16, database and role `stockwatch`, listening on localhost only |
| Backups | `/home/stockwatch/backups`, nightly at 03:17 UTC via the `stockwatch` crontab, kept 14 days |
| Firewall | ufw: only SSH, 80 and 443 in |

## How a deploy works

On every push to `main`, `.github/workflows/deploy.yml` runs the server and
client tests (against a Postgres service) and both builds. If they pass, it
SSHes in as `stockwatch` and pipes `deploy/deploy.sh <sha>` to the server,
which:

1. fetches that commit into `releases/<sha>`, installs and builds it;
2. runs the database migrations;
3. points `current` at the new release and reloads PM2;
4. waits for `/api/auth-providers` to answer. If it doesn't within 30s,
   `current` goes back to the previous release and the job fails.

The last 5 releases are kept. To roll back by hand:

```bash
ssh root@148.230.122.94
sudo -iu stockwatch
ls -t /var/www/stockwatch.cloud/releases/
ln -sfn /var/www/stockwatch.cloud/releases/<sha> /var/www/stockwatch.cloud/current
pm2 reload stockwatch
```

Migrations aren't rolled back. Keep them additive so the previous release
still runs against the newer schema.

## GitHub secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `VPS_HOST` | `148.230.122.94` |
| `VPS_SSH_KEY` | private half of the deploy key (`/root/stockwatch_deploy` on the server); its public half is in `stockwatch`'s `authorized_keys` with `restrict` |
| `VPS_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 148.230.122.94`, which pins the server's host key |

## Server `.env`

```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgres://stockwatch:...@127.0.0.1:5432/stockwatch
BETTER_AUTH_SECRET=...           # openssl rand -base64 32; changing it signs everyone out
APP_URL=https://stockwatch.cloud
ALLOWED_EMAILS=...               # comma-separated
RESEND_API_KEY=...               # needed for verification and reset emails
EMAIL_FROM=StockWatch <noreply@stockwatch.cloud>   # once the domain is verified in Resend
GOOGLE_CLIENT_ID=... / GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=... / GITHUB_CLIENT_SECRET=...
```

After editing it, run `sudo -iu stockwatch pm2 reload stockwatch --update-env`.

## Useful commands

```bash
sudo -iu stockwatch
pm2 status
pm2 logs stockwatch
psql "$(grep ^DATABASE_URL= ~/config/.env | cut -d= -f2-)"
~/backup.sh                                  # take a backup now
```

## Setting up a server from scratch

What was done once on this VPS, as root:

```bash
apt install postgresql
ufw allow OpenSSH && ufw allow "Nginx Full" && ufw enable

useradd --system --create-home --shell /bin/bash stockwatch
sudo -u postgres psql -c "CREATE ROLE stockwatch LOGIN PASSWORD '<random>'"
sudo -u postgres createdb -O stockwatch stockwatch
mkdir -p /var/www/stockwatch.cloud/releases && chown -R stockwatch: /var/www/stockwatch.cloud
# As stockwatch: install nvm, `nvm install 24.22.3`, corepack pnpm, `npm i -g pm2`
pm2 startup systemd -u stockwatch --hp /home/stockwatch   # run as root, with stockwatch's node on PATH

cp deploy/nginx-stockwatch.conf /etc/nginx/sites-available/stockwatch.cloud
ln -s /etc/nginx/sites-available/stockwatch.cloud /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d stockwatch.cloud -d www.stockwatch.cloud --redirect

# Deploy key, as root: ssh-keygen -t ed25519 -f /root/stockwatch_deploy,
# then add "restrict <public key>" to /home/stockwatch/.ssh/authorized_keys.
# Backups: copy deploy/backup.sh to /home/stockwatch/ and add to stockwatch's crontab:
#   17 3 * * * /home/stockwatch/backup.sh >> /home/stockwatch/backup.log 2>&1
```
