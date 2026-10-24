# 1. Setup and go live

Do these in order. Keep a notes file for the keys you collect. Never paste keys into chats or emails.

## A. Accounts you need
| Account | Used for | Cost |
|---|---|---|
| GitHub | stores your code | free |
| Vercel | runs the website (you already have it) | free plan is enough to start |
| Upstash (through Vercel) | database | free plan |
| MSG91 (or Twilio) | OTP SMS | pay per SMS |
| Razorpay and/or Cashfree | online payments | per transaction |
| Resend (optional) | order emails | free plan |
| Zoho Mail or Google Workspace | founder@, admin@, sale@ mailboxes | free or paid |

## B. Put the code on GitHub
1. github.com, sign in, New repository, name `house-and-heir`, Private, Create.
2. Click "uploading an existing file". Unzip this project, open the folder, select everything inside it, and drag it into the page. If GitHub says too many files, upload in two batches.
3. Do not upload a `.env` file or `node_modules`. Click Commit changes.

## C. Create the Vercel project
Follow `2_MOVE_FROM_YOUR_DUMMY_SITE.md` for how to connect this to housenheir.com without breaking the current site. For the settings:
- Framework Preset: **Other**
- Build Command, Output Directory, Install Command: leave as they are (the project's `vercel.json` handles it)

## D. Database
1. In the Vercel project, open **Storage**, then Create Database, choose **Upstash** (Redis), Free plan, region Mumbai if offered, Create.
2. Click Connect Project and pick this project. Vercel adds the database keys itself (KV_REST_API_URL and KV_REST_API_TOKEN).

## E. Settings (environment variables)
Vercel project, Settings, Environment Variables. Add each name from `.env.example` that applies. Tick Production and Preview. After adding or changing anything, go to Deployments, open the newest one, click the three dots, then **Redeploy**.

Required now: `JWT_SECRET`, `ADMIN_PASSWORD`, `ADMIN_PATH`.
Make JWT_SECRET with this command on any computer with Node: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Pick an `ADMIN_PATH` like `/hh-stock-7k2q`. Your private inventory page will be at housenheir.com/hh-stock-7k2q. Do not link to it anywhere.

## F. OTP by SMS (MSG91, recommended in India)
Indian SMS needs DLT registration, which can take a few days. Start this first.
1. Sign up at msg91.com and complete business verification.
2. Register on a DLT portal (Jio, Airtel, Vodafone Idea or BSNL). Register your business as an entity, a sender ID (for example HSEHER) and an OTP template. MSG91's support team helps with this.
3. In MSG91: OTP section, create an OTP template using their OTP variable (the one that shows the code). Copy the **Template ID**.
4. Copy your **Auth Key** (Authkey in the dashboard).
5. In the Authkey settings, turn **IP security off** (or the Vercel server will be blocked, because Vercel IP addresses change).
6. In Vercel add: `OTP_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`. Redeploy.
Waiting for DLT? Set `OTP_TEST_MODE=true`. Codes are written to Vercel's logs (Project, Logs) instead of sent. Use it only for your own testing and set it back to `false` before launch.
Prefer Twilio? Create a Verify service, set `OTP_PROVIDER=twilio` and the three TWILIO values. A trial account only texts numbers you have verified.

## G. Payments
You pay only at the end of checkout. Cash on delivery needs no account. For online payments (UPI, cards, netbanking, wallets) set up at least one gateway.

### Razorpay
1. razorpay.com, sign up. Use **Test Mode** until your business verification is approved.
2. Settings, API Keys, Generate Test Key. Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. Settings, Webhooks, Add new webhook. URL: `https://housenheir.com/api/webhooks/razorpay`. Tick `payment.captured`. Choose a secret and add it as `RAZORPAY_WEBHOOK_SECRET`.
4. UPI on a phone: GPay, PhonePe, Paytm and BHIM show up automatically when installed. The checkout shows them as a "UPI" option.
5. Going live: Razorpay will want your policy pages online (they are: `/policy/terms`, `/policy/privacy`, `/policy/shipping`, `/policy/returns`) and may ask how a reviewer can see the shop. The shop needs an OTP sign-in, so give them screenshots or a short screen recording.

### Cashfree (second option)
1. cashfree.com, sign up. In the dashboard open Developers, Payment Gateway, API Keys. Add `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY`. Keep `CASHFREE_ENV=sandbox` while testing.
2. Developers, Webhooks, add `https://housenheir.com/api/webhooks/cashfree`.
3. If you set both gateways, `PRIMARY_GATEWAY` picks the one customers see first. If it fails, the order page offers the other.
Going live: replace test keys with live keys, set `CASHFREE_ENV=production`, redeploy, then do one real small order.

## H. Optional extras
- **Google Sheet copy:** create a Google Sheet with tabs named exactly Users, Orders, Bookings, Enquiries, Inventory. In console.cloud.google.com create a project, enable the Google Sheets API, create a Service Account, make a JSON key. Share the Sheet with the service account email (Editor). Add `GOOGLE_SHEET_ID` (the long text in the sheet address), `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` (the `private_key` text from the JSON, keep the `\n` marks). Redeploy, open your inventory page, click "Write headers and inventory to the sheet".
- **Order emails:** resend.com, add and verify housenheir.com, make an API key. Add `RESEND_API_KEY` and `NOTIFY_FROM`. You get an alert for each order, booking and enquiry, and customers get confirmation and shipping emails.
- **Business mailboxes:** founder@, admin@ and sale@housenheir.com need a mail service. Zoho Mail has a free plan. Add the MX records it gives you in your domain's DNS. Do not change existing MX records unless you are replacing the mail service.

## I. Fill in the policy pages
Run `npm run check` (or search the folder `data/policies` for `[[`). Replace each `[[ ]]` with your real details: legal business name, address, GST number, delivery days, return window, grievance officer, and so on. Edit on GitHub: open the file, click the pencil, change, Commit. Have a lawyer or CA read the four pages once. These are drafts and not legal advice.

## J. Your designs, prices and stock
Open `data/products.json` on GitHub. Each design has `name`, `price`, `collection` ("pongal" or "new"), `colour`, text and `stock` per size. Names and prices there are placeholders. Change them.

## K. Photos
See `3_ADDING_IMAGES.md`.

## L. Launch
Do `5_LAUNCH_CHECKLIST.md` from top to bottom.
