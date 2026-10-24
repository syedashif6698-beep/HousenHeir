# 4. Running the shop day to day

## Open the inventory page
Go to `housenheir.com` followed by your secret `ADMIN_PATH` (for example `/hh-stock-7k2q`). Enter `ADMIN_PASSWORD`. It locks itself after 2 hours, and five wrong tries lock it for 15 minutes. Customers never see a link to it. Change the password and path in Vercel (Settings, Environment Variables, then Redeploy) whenever someone who knew them leaves.

## What you see
- **Totals:** pieces, sold, held (waiting for an online payment), available, and users.
- **Stock table:** each design by size, shown as available / allocated. Sizes with 5 or fewer left show in red.
- **Latest orders:** buyer, city, items, total, payment type, payment status, and controls.
- **Fitting bookings** and **Enquiries.**
- **Downloads:** Inventory, Orders, Users, Bookings and Enquiries as Excel files, created fresh each time you click.

## Handling an order
1. A new order arrives as **confirmed** (cash on delivery, or online payment received). Orders waiting for an online payment show **awaiting payment** and give the stock back after 15 minutes if unpaid.
2. Pack it, then set the status to **packed**.
3. When you hand it to the courier, choose **shipped**, type the courier name and tracking number, and click Update. The customer sees it on their order page and gets an email (if email is set up).
4. When it arrives, choose **delivered**. For cash on delivery this also marks the cash as collected.
5. **Cancelled** puts the pieces back in stock. If the customer had paid online, the page shows a note: refund them from the Razorpay or Cashfree dashboard (Payments, pick the payment, Refund). The site does not move money itself.

## Stock numbers
- Stock per size is in `data/products.json` under `stock`. To change the batch size, edit those numbers on GitHub and commit. Example for 50 pieces per design: 13, 13, 12, 12.
- Sold and held counts are kept separately in the database, so changing the stock numbers changes what is available without losing sales history.

## The "Few left" label
The site shows "Few left" only when stock is really low (a design with 15 or fewer pieces in total, or a size with 5 or fewer). You can change those limits with `LOW_STOCK_DESIGN` and `LOW_STOCK_SIZE`. It is never turned on by hand. Customers and the chatbot never see stock numbers.

## Discount codes
`data/coupons.json` has two sample codes, both switched off. To use one, change `"active": false` to `true` and commit. Types: `percent` or `flat`, with a minimum order and an optional first-order-only rule. Only add a code you can afford.

## Cash on delivery and shipping
Set in Vercel environment variables: `COD_ENABLED`, `COD_FEE`, `COD_MAX_ORDER`, `SHIPPING_FEE`. Redeploy after changing.

## Chatbot answers
Edit `data/faq.json`. Each topic has keywords and an answer. The bot says a design is available or sold out, and lists sizes, but never numbers.

## Fitting calls
Slots are Monday to Saturday, 10:00 to 17:00 India time (hourly, no 13:00). Change times at the top of `lib/store.js`. When someone books, you get an email (if set up) and see it on the inventory page. Customers can cancel from their own Book a fitting page.

## Backups
Download all five Excel files once a week. The database keeps everything, but a copy in your own drive is good practice.
