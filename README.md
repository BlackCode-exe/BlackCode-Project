# BLACKCODE Shortener

Personal URL shortener built on Cloudflare Workers + KV.

---

## Setup

### 1. Create KV Namespace

```bash
npx wrangler kv:namespace create LINKS_KV
```

Copy the `id` from output → paste into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "LINKS_KV"
id = "PASTE_YOUR_ID_HERE"
```

### 2. Add Assets

Place your files at:

```
assets/
├── fonts/
│   ├── Montserrat-Bold.woff
│   └── Montserrat-Regular.woff
├── favicon.ico
└── logo.png
```

### 3. GitHub Secrets

In your private repo → Settings → Secrets → Actions, add:

| Secret | Value |
|--------|-------|
| `CF_API_TOKEN` | Cloudflare API token (Workers permission) |
| `CF_ACCOUNT_ID` | Your Cloudflare Account ID |
| `CF_ADMIN_PASSWORD` | Your chosen admin password |

### 4. Deploy

Push to `main` branch → GitHub Actions auto-deploys.

---

## Usage

- Admin panel: `https://your-worker.workers.dev/admin`
- Short links: `https://your-worker.workers.dev/your-slug`

---

## Routes

| Route | Description |
|-------|-------------|
| `/:slug` | Redirect to target URL |
| `/admin` | Links list tab |
| `/admin/add` | Add new link |
| `/admin/stats` | Stats summary |
| `/admin/logout` | Log out |
