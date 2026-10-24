# 3. Adding your logo and photos (plain words)

## The one idea to understand
Every picture lives inside one folder of the project called **public/images**. When the website asks for `/images/logo.png`, it looks for the file `public/images/logo.png`. If a file is there with exactly that name, it shows. If it is not, the page shows a coloured block with the design's name, so nothing looks broken while you add photos one by one.

So adding a picture is only two things: **save it with the right name**, and **put it in the right folder**.

## Names and folders
| Picture | Exact file name | Folder | Size to aim for |
|---|---|---|---|
| Logo | `logo.png` | `public/images` | about 400 px wide, transparent background, dark or brown logo |
| Front of the shirt | `kolam-ivory-1.jpg` | `public/images/products` | 800 x 1000 px, upright |
| Back of the shirt | `kolam-ivory-2.jpg` | `public/images/products` | 800 x 1000 px, upright |
| Extra close-ups (optional) | `kolam-ivory-3.jpg`, `-4`... | `public/images/products` | 800 x 1000 px |

The other designs use `sakkarai-rust`, `midnight-navy`, `vayal-olive` and `kaapi-black` in place of `kolam-ivory`.
Rules: all lowercase, no spaces, `.jpg` as written (the names are in `data/products.json`).

## What each photo does on the site
- Photo **1** is the front face of the 3D shirt on the product page, the picture on every card, and the picture in the home page 3D stack.
- Photo **2** is the back face. Customers drag the shirt to turn it, so a clear back photo matters.
- Photos **3 and up** appear as a swipe strip of details under the shirt.
- The logo appears in the header and on the sign-in page. On the sign-in page it is shown on a dark panel, so use a dark or brown logo (it is lightened automatically).

## Get the pictures ready (5 minutes each)
1. Take photos in good light against a plain wall. Keep the same distance and angle for every design.
2. Open **squoosh.app** in your browser, drop the photo in, choose JPG or MozJPEG, quality 75, resize to 800 px wide. Aim for under 200 KB per photo. Small files make the site load fast, which makes customers stay.
3. Download, then rename to the exact name from the table.

## Upload them (GitHub, then Vercel does the rest)
1. Go to github.com, open your `house-and-heir` repository.
2. Click the folder `public`, then `images`, then `products`.
3. Click **Add file**, then **Upload files**.
4. Drag your renamed pictures in. Wait until they finish.
5. At the bottom click **Commit changes**.
6. Vercel notices and publishes the change on its own in about a minute (Deployments tab shows "Ready").
7. Open the site. Press **Ctrl + Shift + R** (on a phone: close the tab and open it again). Browsers keep old pictures for a short while, and this refreshes them.
8. Same steps for the logo: upload `logo.png` into `public/images` (one level up from products).

## Adding a fourth, fifth photo to one design
1. In the repo open `data/products.json` and click the pencil.
2. Find the design and add one more line to its `"images"` list, for example `"/images/products/kolam-ivory-4.jpg"`. Mind the comma between items.
3. Commit, then upload the new photo as above.

## If a picture does not show
- Is the name exactly the same, including `.jpg` and lowercase? (`Kolam-Ivory-1.JPG` will not work.)
- Is it inside `public/images/products`, not a different folder?
- Did you refresh with Ctrl + Shift + R?
- Wait a minute for Vercel to finish publishing, and check Deployments shows "Ready".

## Putting a picture on a new page later
In the page file write: `<img src="/images/products/name.jpg" alt="what the picture shows">`. The `alt` text describes the picture for people who cannot see it and helps search engines.
