# Free website: GitHub Actions + Cloudflare Pages

A normal web link, behind an email login, updated every night at no cost.

```
GitHub Actions (daily, private repo)                     Cloudflare
  Smartlead sync ─▶ history on `dashboard-data` branch
                 └▶ build site/index.html ──────────▶  Pages: bosco-cold-email.pages.dev
                                                       Access: email one-time-code login
```

- **Private repo:** holds the code, `dashboard.settings.json` and the day-by-day history (on the `dashboard-data` branch). Leads are stored as a hash of the email only, with no names or addresses.
- **Workflow:** `.github/workflows/dashboard.yml` runs daily at 22:55 UTC, when you press **Run workflow** in the Actions tab, and whenever the settings file changes.
- **Cloudflare Pages:** hosts the page. **Cloudflare Access** puts an email login in front of it: you type your email and get a one-time code.
- **Safety check:** the workflow refuses to publish live data until you've told it Access is set up.

## One-time setup (about 15 minutes)

### 1. Cloudflare account and API token
1. Sign up free at https://dash.cloudflare.com/sign-up.
2. Copy your **Account ID**. It's on the right-hand side of the dashboard home page, or under **Workers & Pages**.
3. Create a token: **My Profile → API Tokens → Create Token → Create Custom Token**
   - Permissions: **Account → Cloudflare Pages → Edit**
   - Account resources: your account
   - Copy the token; it's only shown once.

### 2. Add the secrets to GitHub
In this repo: **Settings → Secrets and variables → Actions**
- **Secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- (later) **Secret:** `SMARTLEAD_API_KEY`
- **Optional variable:** `CF_PAGES_PROJECT`, if you want a name other than `bosco-cold-email`. The name becomes the web address, `<name>.pages.dev`.

### 3. First publish (sample data)
**Actions → Dashboard → Run workflow.** When it goes green, the site is at `https://bosco-cold-email.pages.dev`, showing sample data.

### 4. Put the login in front of it (Cloudflare Access)
1. In Cloudflare: **Zero Trust** (left sidebar). The first time, pick a team name and the **Free** plan. It may ask for a card to verify the account; the free plan isn't charged.
2. **Access → Applications → Add an application → Self-hosted**
   - Application domain: `bosco-cold-email.pages.dev`
   - Add a second domain: `*.bosco-cold-email.pages.dev`. Every publish also gets its own preview address, and this covers those.
   - Policy: **Allow**, Include → **Emails** → your email and the CEO's.
   - Login method: **One-time PIN**, the default.
3. Also in **Workers & Pages → bosco-cold-email → Settings → General**: turn on **Access policy** for preview deployments.
4. Open the site in a private window. It should ask for your email before showing anything.
5. In GitHub add the **variable** `ACCESS_PROTECTED` = `true`.

### 5. Go live (once campaigns are about to start)
1. Add the `SMARTLEAD_API_KEY` secret.
2. In `dashboard.settings.json`, change `"dataMode": "sample"` to `"live"` and commit. This triggers a rebuild.
3. **Actions → Dashboard → Run workflow** to take the first snapshot now.

Do this before the first campaign sends. Period figures are differences between daily snapshots.

## Everyday use

| You want to… | Do this |
|---|---|
| See the numbers | Open the site and log in with your email |
| Update now | Actions → Dashboard → **Run workflow** |
| Change costs, FX, cost start date, positive categories | Edit `dashboard.settings.json` on GitHub, e.g. `{"dataMode": "live", "settings": {"usdToGbp": 0.78}}`. Any field in `config/defaults.ts` can be set. The site rebuilds automatically. |
| Give someone access | Cloudflare Zero Trust → Access → Applications → your app → add their email |
| Check a run | Actions tab. A failed Smartlead sync shows on the site's Settings tab ("Last sync"), and history is kept either way |

## Differences from the paid hosted version
- No Smartlead webhook, so download and reply dates are accurate to the day. They come from Smartlead's reply times, the `download_date` field, or the first daily sync that sees the change.
- "Refresh now" is the **Run workflow** button, and a run takes a couple of minutes.
- Settings are edited in a file on GitHub, not on a page.

## Costs and limits
- **GitHub Actions:** private repos get 2,000 free minutes a month. A daily run takes about 2–4 minutes, so roughly 60–120 minutes a month.
- **Cloudflare Pages:** free. **Cloudflare Access:** free tier for small teams; check the user limit on the Zero Trust plans page when you sign up.
