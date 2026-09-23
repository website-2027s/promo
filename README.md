# Coffee Shop — One-Page Menu + Admin

One public page (no login for visitors) + a private admin panel.
Same look as your VIP Channels project. Zero dependencies — just Node 18+.

## Pages
| URL | What |
|---|---|
| `/` | Public page: **moving-words header**, **your QR** with a button under it, then **one dotted menu list** with its title, and a footer. Anyone can open it — no login. |
| `/admin` | Admin login → edit everything. |

## Admin panel
- **Details** – moving header words (comma separated), shop name, tagline, footer.
- **Menu** – one menu: edit the title; add / edit / reorder / delete items (name, price, description).
- **QR code** – upload a new QR (tap or drag & drop), change the title and text around it, set the button under the QR (text + link), or restore the original `public/qr.png`.
- **My account** – change your admin password.

## Deploy on Railway (same as before)
1. Upload all files in this folder to a new GitHub repo.
2. Railway → **New Project → Deploy from GitHub repo**.
3. **Add a Volume** mounted at `/data` (keeps your edits and uploaded QR).
4. **Variables**: `DATA_DIR=/data`, `ADMIN_USERNAME=yourname`, `ADMIN_PASSWORD=a-strong-password`
5. **Settings → Networking → Generate Domain**. Go to `yourdomain/admin` to log in.

> If you skip `ADMIN_PASSWORD`, login is `admin` / `changeme123` — change it right away in **Admin → My account**.

## Run locally
`npm start` → http://localhost:3000 (admin at http://localhost:3000/admin)
