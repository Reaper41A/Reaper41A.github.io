# Deploy StockFlow's site to Vercel

This repository is a static website: the homepage, legal pages, styles and browser JavaScript are served directly. It does not need a Node.js build, npm install, framework adapter, or server function.

## Vercel project settings

1. In Vercel, choose **Add New → Project** and import `Reaper41A/Reaper41A.github.io`.
2. Set the **Root Directory** to `./`.
3. Set **Framework Preset** to **Other**.
4. Leave **Build Command** and **Install Command** empty. Set **Output Directory** to `.` (the repository root).
5. Deploy. The site entry point is `index.html`; `privacy.html`, `terms.html`, `changes.html` (the legal change log), `legal.css` and `beta.js` remain at the root and are served as static files. The Shopflow and Dropflow beta pages are `shopflow/index.html` and `dropflow/index.html` (served at `/shopflow/` and `/dropflow/`); both run the same `beta.js`, picked by the `data-app` attribute on their `#beta` section. The homepage's fonts are in `fonts/` and load from the same domain.

The checked-in `vercel.json` keeps the root output directory and explicit `.html` page paths, and adds basic response-security headers. There is no GitHub Pages base-path assumption in the site: assets and legal-page links are relative, and beta sign-in constructs its return URL from the domain currently serving the page.

## Supabase: allow the Vercel return URLs

The beta sign-in uses the existing Supabase project:

`https://fpshdyotujchfdwasqxn.supabase.co`

After Vercel gives the project its production domain, open **Supabase Dashboard → Authentication → URL Configuration**:

- Set **Site URL** to the production Vercel URL (or your custom production domain), for example `https://your-project.vercel.app`.
- Add the exact production origin with a path wildcard to **Redirect URLs**, for example `https://your-project.vercel.app/**`.
- To support Vercel preview deployments, also add the preview pattern recommended by Supabase: `https://*-YOUR-VERCEL-TEAM-SLUG.vercel.app/**`. Replace the team slug with the account/team slug that appears in your preview URLs. Prefer the exact production URL for the Site URL; use the wildcard for previews only.

The same redirect allowlist is used for Google OAuth and email sign-in links. The app sends users back to the origin that opened the sign-in flow.

## Google OAuth callback: keep it pointed at Supabase

In **Google Cloud Console → APIs & Services → Credentials → your Web OAuth client**:

- Add the Vercel production origin (for example, `https://your-project.vercel.app`) under **Authorized JavaScript origins**. Add each preview origin separately only when you need Google sign-in to work on that preview; Google origins are exact origins, not wildcard patterns.
- Keep the authorized redirect URI pointed at the Supabase callback:

  `https://fpshdyotujchfdwasqxn.supabase.co/auth/v1/callback`

Do **not** replace that Google callback with the Vercel domain. Google returns to Supabase first; Supabase then redirects the user to the Vercel URL supplied by the site. Confirm that the matching Google Client ID and Client Secret are enabled under **Supabase Dashboard → Authentication → Sign In / Providers → Google**.

The two allowlists serve different purposes: Google authorizes which site origins may start sign-in and the Supabase callback; Supabase authorizes where it may return the signed-in browser session.

## Verify before switching off GitHub Pages

1. Open the Vercel production URL in a fresh browser session.
2. Go to **Join beta → Continue with Google** and complete the consent/login step.
3. Confirm the browser returns to the same Vercel domain and the beta card shows the signed-in email.
4. Test the email sign-in link too; it uses the same return URL.
5. Open the Privacy Policy and Terms links directly to confirm the static pages load.
6. Once production sign-in works on Vercel, you can stop relying on GitHub Pages.

If the sign-in still fails, the beta card now displays the provider/redirect error returned by Supabase rather than replacing it with a generic message. The Vercel hostname still has to be added in Supabase's dashboard; that hosted project setting cannot be changed by a source-code commit.
