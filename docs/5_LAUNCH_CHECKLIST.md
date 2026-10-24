# 5. Launch checklist

## Paperwork and pages
- [ ] Every `[[ ]]` in `data/policies/` is filled in (`npm run check` shows none left)
- [ ] A lawyer or CA has read the four policy pages
- [ ] Business details match across Terms, Privacy and Shipping: legal name, address, GST number if registered
- [ ] Grievance officer named in Terms and Privacy
- [ ] Ask your CA or a lawyer which product-label details Indian rules require on a clothing listing (price including taxes, size, country of origin, manufacturer details) and add them to the product text in `data/products.json`
- [ ] Prices and stock in `data/products.json` are final

## Accounts and keys
- [ ] Domain housenheir.com shows a green tick in Vercel
- [ ] JWT_SECRET, ADMIN_PASSWORD and ADMIN_PATH set to private values
- [ ] OTP provider set up, `OTP_TEST_MODE` is `false`
- [ ] Live payment keys added (Razorpay and/or Cashfree), `CASHFREE_ENV=production` if used
- [ ] Both webhooks point to `https://housenheir.com/api/webhooks/...`
- [ ] Email service set up and mailboxes founder@, admin@, sale@ can receive mail

## Test as a new customer on a phone (and once on a laptop)
- [ ] Sign in with a new number: OTP arrives, you land on the home page
- [ ] Sign out and in again with the same number: it skips the name and email boxes
- [ ] Without signing in, `/home` sends you back to the sign-in page
- [ ] Policy pages open without signing in
- [ ] Logo, slider stack and every product photo show; dragging the shirt turns it
- [ ] Add two designs to the bag, change quantity, remove one
- [ ] Place a cash on delivery order. Order page shows confirmed, stock drops, your email arrives
- [ ] Place a UPI order, pay with a real small amount, order shows confirmed (do this with live keys, then refund yourself)
- [ ] Close the payment window halfway: the order page shows Pay now and the 15 minute timer
- [ ] Chatbot: ask "is Kolam Ivory available", "payment options", "cash on delivery". No stock numbers appear anywhere
- [ ] Book a fitting, cancel it, send an enquiry
- [ ] Inventory page: password works, wrong password is refused, orders can be moved to packed and shipped, Excel downloads open
- [ ] Customer pages never show stock numbers (open the page source on a product page and search for "stock")

## After launch
- [ ] Watch Vercel, Logs for errors for the first two days
- [ ] Check the Razorpay/Cashfree dashboard matches the orders in your Orders sheet
- [ ] Keep the old dummy project for two weeks, then delete it
