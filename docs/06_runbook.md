# Loan Ledger — Runbook

**Version:** 1.0  
**Date:** July 2026

A runbook is a reference for operating the live application: routine tasks, how to check the system is healthy, and what to do when something goes wrong. It is written for someone who built the system and needs a quick reference, not for first-time setup (see the README for that).

---

## 1. Key URLs and Dashboards

| Resource | URL |
|---|---|
| **Live app** | https://loan-ledger-liard.vercel.app |
| **Vercel dashboard** | https://vercel.com/shitijbagga/loan-ledger |
| **Supabase dashboard** | https://supabase.com/dashboard/project/[your-project-id] |
| **GitHub repo** | https://github.com/shitijbagga/loan-ledger |

---

## 2. How to Check the App is Healthy

### Quick check (30 seconds)
1. Open the live URL in a browser.
2. The login screen should appear within 2 seconds.
3. Log in with your account.
4. Confirm your saved loan data loads correctly.
5. Make a small change and click Save — confirm no error appears.

### If the first load is slow (5–15 seconds)
This is normal after a period of inactivity. The Supabase free tier **pauses a project after 7 days without any database activity**. The first request after a pause wakes the project up, which takes several seconds. Subsequent requests are fast. No action required — it resumes automatically.

If the pause is happening frequently and the delay is bothersome, log into Supabase and check **Project Settings → General** for pause status. The only fix on the free tier is to keep the project active (i.e. use it regularly).

### Check Vercel build status
Go to: Vercel dashboard → Deployments tab.
- The most recent deployment should show **Ready** in green.
- If it shows **Error** in red, click it to see the build log — usually a dependency or environment variable issue.

### Check Supabase status
Go to: Supabase dashboard → home page of your project.
- If the project is paused, a banner will say so with a "Resume" button — click it.
- Under **Database → Tables**, confirm `loan_scenarios` and `loan_events` tables exist.
- Under **Authentication → Users**, you can see registered accounts.

---

## 3. Routine Tasks

### 3.1 Deploy a code change

Code changes are deployed automatically on every push to `main`. The full workflow:

```bash
# From inside WSL, in ~/loan-ledger
cd ~/loan-ledger
npm run dev           # start local server to verify the change works

# ... make and test your changes ...

git add .
git status            # verify only intended files are staged, .env.local NOT listed
git commit -m "Short description of what changed"
git push              # triggers automatic Vercel build and deploy
```

After pushing, check Vercel dashboard → Deployments. The new deploy takes about 1–2 minutes to go live.

### 3.2 Roll back a bad deploy

If a deploy introduces a problem:

1. Go to Vercel dashboard → Deployments tab.
2. Find the last known-good deployment (look for the commit message you trust).
3. Click the ⋯ menu next to it → **Promote to Production**.

This instantly makes the old deployment the live version, with no new build needed.

### 3.3 Change environment variables

If your Supabase project URL or key changes (e.g. you create a new Supabase project):

1. Update `.env.local` locally with the new values.
2. Go to Vercel dashboard → Settings → Environment Variables.
3. Update the same variables there.
4. Trigger a redeploy (Vercel doesn't auto-redeploy on env var changes):
   - Deployments tab → latest deployment → ⋯ → Redeploy
5. Verify the live app still works after the redeploy.

### 3.4 Add a new user account

Users self-register via the Sign Up screen. No admin action is required. To see all registered users: Supabase dashboard → Authentication → Users.

### 3.5 Delete a user account

1. Go to Supabase dashboard → Authentication → Users.
2. Find the user → click the ⋯ menu → Delete user.
3. Because `loan_scenarios` has `on delete cascade` from `auth.users`, their loan data is automatically deleted too. No manual database cleanup needed.

### 3.6 View or edit data directly in Supabase

For debugging or one-off data corrections:

1. Supabase dashboard → Table Editor.
2. Select `loan_scenarios` or `loan_events`.
3. You can view, edit, or delete rows here directly.

⚠️ **Caution:** The Table Editor bypasses Row Level Security by default (you are authenticated as the service role, not a regular user). Be careful not to accidentally edit or delete the wrong user's data.

---

## 4. Troubleshooting

### 4.1 Blank page on the live URL

**Symptoms:** The URL loads but shows a white blank page. No content visible.

**Steps:**
1. Open browser dev tools (F12) → Console tab. Look for red error messages.
2. The most common cause is Supabase credentials being wrong or missing in Vercel.
   - Go to Vercel → Settings → Environment Variables.
   - Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are both present and correct.
   - If you had to add or fix them, redeploy (Deployments → latest → ⋯ → Redeploy).
3. If the console shows `TypeError: Cannot read properties of null` related to Supabase, the client failed to initialise — same root cause as step 2.

### 4.2 Login fails with "Invalid login credentials"

**Symptoms:** User enters correct email/password but gets an error.

**Possible causes:**
- Wrong password — user should try resetting it (currently requires manual Supabase intervention — see 4.3).
- Wrong email — check Supabase → Authentication → Users for the exact registered email.
- Account doesn't exist — user may need to sign up instead.

### 4.3 User locked out / needs password reset

Currently there is no "Forgot password" flow in the app UI. As a workaround:

1. Go to Supabase dashboard → Authentication → Users.
2. Find the user's email.
3. Click ⋯ → Send password recovery — this sends a reset email to the user.

Note: this requires that the user's email address is valid and accessible. If they registered with a dummy email, you would need to manually update their password using the Supabase service role — contact Supabase documentation for that procedure.

### 4.4 Saved data not loading after login

**Symptoms:** User logs in but sees default placeholder values instead of their saved data.

**Steps:**
1. Open browser dev tools → Console. Look for any Supabase errors (often a permissions/RLS issue).
2. Go to Supabase → Table Editor → `loan_scenarios`. Check whether a row for this user exists.
3. Check that the Row Level Security policies exist:
   - Supabase → Authentication → Policies.
   - Confirm all four policies exist for `loan_scenarios` and all four for `loan_events`.
4. If policies are missing, re-run the SQL from the README's database setup section.

### 4.5 Save button gives an error

**Symptoms:** Clicking Save shows an error message below the button.

**Steps:**
1. Note the exact error text — it comes directly from Supabase and is usually descriptive.
2. Common causes:
   - **"JWT expired"** — the user's session has timed out. Ask them to sign out and sign back in.
   - **"new row violates row-level security policy"** — the user's `user_id` doesn't match the scenario's `user_id`. Shouldn't happen in normal use; check if the scenario was manually edited in Supabase.
   - **"violates check constraint event_type"** — an event type other than `INTEREST`, `PRINCIPAL`, or `EXTRA_PRINCIPAL` was somehow submitted. Shouldn't happen through the UI; indicates a bug.

### 4.6 `npm run dev` fails locally

**Symptoms:** Error when starting the local development server.

**Steps:**
1. Confirm you are running from inside WSL (not Windows PowerShell):
   ```bash
   uname -a   # Should show Linux
   pwd        # Should show /home/shitij/loan-ledger
   ```
2. Confirm `.env.local` exists and contains both variables:
   ```bash
   cat .env.local
   ```
3. If you recently ran `npm install` in the wrong directory (accidentally in `~` instead of `~/loan-ledger`), clean up:
   ```bash
   rm -rf ~/node_modules ~/package.json ~/package-lock.json
   cd ~/loan-ledger
   npm install
   npm run dev
   ```
4. If the error mentions "Application Control policy" or native bindings — you are running in Windows, not WSL. Open an Ubuntu terminal and try again.

### 4.7 Vercel build fails

**Symptoms:** Deployment shows "Error" in Vercel dashboard.

**Steps:**
1. Click the failed deployment → View Build Logs.
2. Scroll to the first red error. Common causes:
   - **Missing dependency** — a package was used in code but not added to `package.json`. Fix: `npm install <package-name>` locally, commit the updated `package.json` and `package-lock.json`.
   - **Syntax error** — a code change introduced invalid JS/JSX. Fix: run `npm run build` locally (it uses the same Vite build) to see the error before pushing.
   - **Environment variable missing** — Vercel doesn't have `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`. Fix: add them in Vercel → Settings → Environment Variables, then redeploy.

To test the production build locally before pushing:
```bash
npm run build    # builds to dist/
npm run preview  # serves dist/ locally at http://localhost:4173
```

---

## 5. Known Limitations (v1.0)

| Limitation | Impact | Workaround |
|---|---|---|
| Supabase free tier pauses after 7 days inactivity | Slow first load after idle periods | None needed; wakes automatically |
| No password reset flow in the app | Locked-out users need manual admin action | Use Supabase dashboard to send reset email |
| One scenario per user | Cannot save multiple loan scenarios | Re-enter inputs for a different scenario |
| No "unsaved changes" warning | Changes lost if browser closed before Save | Remember to click Save |
| No automated tests | Regressions may not be caught immediately | Manual testing after each change |

---

## 6. WSL2 Quick Reference

Since all development happens inside WSL2:

| Task | Command |
|---|---|
| Start WSL | Open "Ubuntu" from Windows Start menu, or type `wsl` in PowerShell |
| Stop WSL completely | `wsl --shutdown` (in Windows PowerShell) |
| Go to project folder | `cd ~/loan-ledger` |
| Start dev server | `npm run dev` |
| Stop dev server | `Ctrl+C` in the terminal running it |
| Check WSL is running Linux | `uname -a` |
| Check Node version | `node -v` |
| Check available RAM for WSL | Open Task Manager → Performance → Memory; `Vmmem` process = WSL usage |
