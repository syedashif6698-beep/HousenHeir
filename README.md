# House & Heir online store (version 3)

Sign in with an OTP, browse five limited designs in 3D, pay only at the end (cash on delivery, any UPI app, cards, netbanking), track every order, and book a fitting. Runs on Vercel with a free Upstash Redis database.

## What is in the box
| Part | Where |
|---|---|
| Pages | `views/` and `public/js/` |
| Look and feel (beige and brown, 3D) | `public/css/style.css` |
| Shop logic (stock, orders, COD, coupons) | `lib/store.js` |
| OTP (MSG91 or Twilio) | `lib/otp.js` |
| Payments (Razorpay and Cashfree) | `server.js` |
| Chatbot answers | `data/faq.json` |
| Designs, prices, stock | `data/products.json` |
| Discount codes (all off to start) | `data/coupons.json` |
| Policy pages (fill in the [[ ]] gaps) | `data/policies/` |
| Guides | `docs/` |

## Read these in order
1. `docs/1_SETUP_AND_GO_LIVE.md` : accounts, keys and launch, step by step
2. `docs/2_MOVE_FROM_YOUR_DUMMY_SITE.md` : switching housenheir.com from the old site safely
3. `docs/3_ADDING_IMAGES.md` : logo, product photos, slider, in plain words
4. `docs/4_ADMIN_MANUAL.md` : running the shop day to day
5. `docs/5_LAUNCH_CHECKLIST.md` : tick every box before telling customers

## Try it on your computer first
1. Install Node.js (LTS) from nodejs.org.
2. In a terminal inside this folder: `npm install`
3. Copy `.env.example` to `.env`. Fill only `JWT_SECRET` and `ADMIN_PASSWORD`.
4. `npm start`, then open http://localhost:3000
In this test mode the OTP prints in your terminal, a "Test payment" option appears, and data lives in memory (it resets when you stop the server).
`npm test` runs the automatic checks. `npm run check` lists policy gaps still to fill.
