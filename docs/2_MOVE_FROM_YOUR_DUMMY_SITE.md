# 2. Moving housenheir.com from the dummy site to the real store

Your domain already points to Vercel, so no DNS change is needed. You only switch which Vercel project owns the domain. Two ways, safest first.

## Step 0. Look before you touch anything (5 minutes)
1. vercel.com, Dashboard. Find the project that has your dummy site.
2. Open it, then Settings, Domains. Note which names are listed (housenheir.com, www.housenheir.com) and any redirect between them.
3. Settings, General: note the Framework Preset and where the code comes from (a GitHub repo, or uploaded with the Vercel command line).
4. Save the old site: if it comes from GitHub, open the repo, click Code, Download ZIP. If not, ask whoever built it for the files. Keep the zip safe.
5. Take a few screenshots of the old site.

## Way A (recommended): a brand new project, then swap the domain
The old site stays online while you build and test the new one. The swap takes about a minute.
1. Follow `1_SETUP_AND_GO_LIVE.md` sections B to G, creating a **new** Vercel project from the new GitHub repo. Do not add housenheir.com to it yet.
2. Vercel gives the new project its own address, like `house-and-heir.vercel.app`. Test everything there with the checklist in `5_LAUNCH_CHECKLIST.md`. Use test payments first.
   Note: if the address asks you to log in to Vercel, open Settings, Deployment Protection and turn it off for Production.
3. When you are happy, do the swap:
   1. Old project, Settings, Domains: **Remove** `housenheir.com` and `www.housenheir.com`.
   2. New project, Settings, Domains: **Add** `housenheir.com`, then `www.housenheir.com`. Choose which one redirects to the other (keep what the old site did).
   3. Wait for the green ticks. HTTPS is automatic.
4. Switch your payment webhooks to the real domain (Razorpay and Cashfree dashboards: `https://housenheir.com/api/webhooks/razorpay` and `.../cashfree`).
5. Open housenheir.com in a private window. You should see the new sign-in page.
6. Do not delete the old project for two weeks. To go back, remove the domain from the new project and add it to the old one.

## Way B: replace the code in the existing project
Faster, with one risk: the live site changes when you merge. Use a branch.
1. In the old repo make a branch called `old-dummy` (a safe copy).
2. Make a second branch called `new-store`. On it, delete the old files and upload the new project files. Commit.
3. Vercel builds a **Preview** for the branch automatically. Open it from the Deployments tab and test. Preview needs the environment variables ticked for Preview too (section E of the setup guide).
4. In Settings, General, change the Framework Preset to **Other** and clear any Build Command and Output Directory fields. This matters if the old site used Next.js or similar.
5. Happy? Merge `new-store` into `main`. Vercel publishes it to housenheir.com.
6. Something wrong? Deployments, find the last good deployment, click the three dots, **Promote to Production** (or "Instant Rollback"). The dummy site is back in seconds.

## After the switch
- Email is not affected. Your MX records are separate from the website.
- Old page addresses from the dummy site will show "Page not found". Fine if the dummy was never shared. If it was, tell me the old addresses and I will add redirects.
- Run the full launch checklist once more on the live domain.
