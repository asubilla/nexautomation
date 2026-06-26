# Nex Automation – Compliance Site

Static website for API compliance (Meta/TikTok). Deploy on Cloudflare Pages.

## Pages

| Page | URL | Purpose |
|------|-----|---------|
| Home | `/` | App overview |
| Privacy Policy | `/privacy-policy.html` | Required by Meta & TikTok |
| Terms of Service | `/terms.html` | Required |
| Data Deletion | `/data-deletion.html` | **Required by Meta** |
| Contact Us | `/contact.html` | Required by TikTok |

## Deploy to Cloudflare Pages

### Option A – Drag & Drop (Fastest)
1. Go to https://pages.cloudflare.com
2. Click "Create a project" → "Direct Upload"
3. Drag the `compliance-site/` folder
4. Your site will be at: `https://your-project.pages.dev`

### Option B – GitHub (Recommended)
1. Push this folder to a GitHub repo
2. Go to Cloudflare Pages → "Connect to Git"
3. Select the repo, set **Build output directory** to `/` (root)
4. Deploy

## Customize Before Deploying

Search and replace these placeholders in all `.html` files:

| Placeholder | Replace With |
|-------------|-------------|
| `nex-automation.pages.dev` | Your actual Cloudflare Pages URL |
| `Nex Automation` | Your app name (if different) |
| `asubilla115@gmail.com` | Your actual email |
| `asubilla115@gmail.com` | Your actual support email |
| `asubilla115@gmail.com` | Your actual legal email |
| `June 2025` | Current date |

## URLs to Submit to Meta/TikTok

After deploying, use these URLs in your API applications:

- **Privacy Policy**: `https://your-project.pages.dev/privacy-policy.html`
- **Terms of Service**: `https://your-project.pages.dev/terms.html`
- **Data Deletion Callback**: `https://your-project.pages.dev/data-deletion.html`
- **Contact/Support URL**: `https://your-project.pages.dev/contact.html`
- **App Domain**: `your-project.pages.dev`
- **Website URL**: `https://your-project.pages.dev`
