# ZAP (inside Trust AI)

**ZAP** shares the same account system as Trust AI.

- Sign up once on Trust AI → log into ZAP with the same credentials.
- Or sign up via the ZAP pages here — one account for both.
- Wallet connect (Trust Wallet / MetaMask) on the signup flow.
- After login: sidebar with **Account** at the top (upgrade plan, change email, reconnect wallet).

## Pages in this folder

| File | Purpose |
|------|--------|
| `index.html` | Sign up / Log in + plan picker (Free / Pro / Team) |
| `dashboard.html` | App shell with account sidebar |
| `css/styles.css` | Shared styles |
| `js/app.js` | Auth, wallet, plans, dashboard logic |

## How to run

From the TrustAI repo root (or open the HTML files directly):

```bash
npx serve ZAP
# or open ZAP/index.html in a browser
```

## Auth note

This starter uses a client-side session demo so you can walk through the UI.
Trust AI production auth is Supabase (`login.html` / `account.html` at repo root).
Next step: point ZAP signup/login at the same Supabase project so one real account works for both products.
