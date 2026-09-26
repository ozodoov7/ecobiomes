# Ecobiome Laboratory — sayt va admin panel

Ommaviy sayt (7 bo'lim) bilan unga ulangan admin panel. Saytdagi har bir matn, rasm, havola, teg va sana bazada saqlanadi va `/admin` orqali tahrirlanadi. Sahifalar serverda render qilinadi (SEO uchun), HTML tuzilishi va `css/style.css` asl statik sayt bilan bir xil.

**Texnologiya:** Node.js 20.9+ (22 yoki 24 LTS tavsiya etiladi) · Express · SQLite (better-sqlite3) · EJS · admin panel — oddiy HTML/CSS/JS, framework yo'q.

---

## 1. Lokal o'rnatish

```bash
npm install                 # bog'liqliklar (npm update EMAS)
cp .env.example .env        # sozlamalar faylini yarating
```

> **Windows / yangi npm eslatmalari**
> - `npm install` oxirida *"install-scripts … better-sqlite3 … not yet covered by allowScripts"* degan ogohlantirish chiqsa, bir marta quyidagilarni bajaring:
>   ```
>   npm install-scripts approve better-sqlite3
>   npm rebuild better-sqlite3
>   node -e "new (require('better-sqlite3'))(':memory:'); console.log('better-sqlite3 OK')"
>   ```
> - `gyp ERR!` xatosi chiqsa: `node_modules` papkasini o'chirib (`Remove-Item -Recurse -Force node_modules`), `npm install` ni qayta ishga tushiring. Loyiha Node 20, 22 va 24 uchun tayyor paketlardan foydalanadi, Visual Studio yoki kompilyator kerak emas.
> - PowerShell'da `.env` nusxasi: `Copy-Item .env.example .env`

`.env` faylida kamida quyidagilarni to'ldiring:

- `SESSION_SECRET` — maxfiy kalit. Uni quyidagi buyruq bilan yarating:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- lokal kompyuterda (HTTP) sinash uchun: `NODE_ENV=development` va `COOKIE_SECURE=0`.

```bash
npm run seed                # asl saytdagi barcha kontentni bazaga yuklaydi (server bo'sh bazada buni o'zi ham qiladi)
npm run create-admin        # birinchi Admin foydalanuvchini yaratadi (quyida batafsil)
npm start                   # http://localhost:3000  va  http://localhost:3000/admin
```

Ishlab chiqishda `npm run dev` fayl o'zgarganda serverni avtomatik qayta ishga tushiradi.

## 2. Birinchi admin foydalanuvchini yaratish

```bash
npm run create-admin
```

Skript email, ism va parolni so'raydi. Parol kamida 10 belgi bo'lishi va harf hamda raqamni o'z ichiga olishi kerak. Parol ekranda ko'rinmaydi va bazaga faqat bcrypt hash sifatida yoziladi.

- **Interaktiv bo'lmagan usul:**
  - Linux / macOS: `ADMIN_PASSWORD='...' npm run create-admin -- --email siz@lab.uz --name "Ism Familiya"`
  - Windows PowerShell: `$env:ADMIN_PASSWORD='...'; npm run create-admin -- --email siz@lab.uz --name "Ism Familiya"; Remove-Item Env:ADMIN_PASSWORD`
- **Sayt bo'sh ko'rinsa** (matn, menyu va logo yo'q): `data` papkasi yangi yoki bo'sh. Server bunday bazaga asl kontentni avtomatik yuklaydi; eski kontentingizni qaytarish uchun eski `data` papkasini (yoki backup'ni) tiklang.
- **Parolni unutsangiz:** shu buyruqni o'sha email bilan qayta ishga tushiring. Parol almashtiriladi, hisob blokdan chiqariladi va Admin roli beriladi.

Keyingi foydalanuvchilar panelning o'zida qo'shiladi: **Tizim → Foydalanuvchilar** (bu bo'lim faqat Admin uchun).

## 3. Rollar

| Imkoniyat | Admin | Editor |
|---|---|---|
| Barcha kontent: sahifalar, bloklar, ro'yxatlar, media, xabarlar, tarix | ✓ | ✓ |
| Umumiy sozlamalar (logo, kontakt, footer, slayder vaqti, contact forma) | ✓ | — |
| Header va footer menyusi | ✓ | — |
| Foydalanuvchilar, backup export va import | ✓ | — |

## 4. Admin panel bilan ishlash

- **Draft / Published.** Yangi yozuv avval Draft holatida saqlanadi va saytda ko'rinmaydi. "Saytda ko'rish ↗" tugmasi sahifani `?preview=1` bilan ochadi: tizimga kirgan foydalanuvchi draft yozuvlarni ham ko'radi, oddiy tashrif buyuruvchi esa yo'q.
- **Tartiblash.** Har bir ro'yxatda qatorni ⠿ belgisidan sudrab tartiblang (sensorli ekranda ham ishlaydi). Klaviaturada: Tab bilan ⠿ belgisiga o'tib, ↑/↓ tugmalarini bosing. Tartib darhol saqlanadi.
  - Yangiliklar saytda sana bo'yicha tartiblanadi, maqolalar esa yil bo'yicha guruhlanadi. Qo'lda berilgan tartib faqat bir xil sana yoki yil ichida ishlaydi.
- **Qidiruv va filtr.** Har bir ro'yxatda bor.
- **O'zgarishlar tarixi.** Har bir saqlash, o'chirish va tiklash yozib boriladi (har bir yozuv uchun oxirgi 50 ta versiya). Tahrirlash oynasidagi "Versiyalar" tugmasi yoki **Tizim → O'zgarishlar tarixi** orqali istalgan versiyaga qaytish yoki o'chirilgan yozuvni tiklash mumkin.
- **Media kutubxona.**
  - JPG, PNG, WEBP va GIF rasmlar avtomatik WEBP'ga o'giriladi va uch o'lchamda saqlanadi: 1920, 1000 va 400 px.
  - PDF fayllar o'zgarishsiz saqlanadi.
  - Har bir rasm uchun alt matni kiritiladi. Rasm tanlanganda alt matni formaga o'zi o'tadi.
  - Ishlatilayotgan faylni o'chirishdan oldin panel u qayerda ishlatilganini ko'rsatadi.
- **Rich text (yangilik matni).** Qalin, kursiv, H2/H3, ro'yxat, iqtibos, havola, kutubxonadan rasm va HTML ko'rinishi bor. Joylangan (paste) matn formatsiz qo'yiladi.
- **Contact forma.** Standart holatda o'chirilgan. **Sozlamalar → "Home sahifada contact formani ko'rsatish"** yoqilsa, forma Home sahifasida paydo bo'ladi. Kelgan xabarlar **Tizim → Xabarlar** bo'limida o'qilgan/o'qilmagan belgisi bilan ko'rinadi.
- **Hero slaydlar.** Almashish vaqti **Sozlamalar → "Hero slayd almashish vaqti (ms)"** da sozlanadi. Hozir siz so'ragan 500 ms (0.5 s) turibdi. Har bir slaydga alohida tugmalar berish mumkin; bo'sh qoldirilsa "Hero tugmalari" blokidagi umumiy tugmalar ishlatiladi.
- **Ctrl+S** (Mac'da Cmd+S) formani saqlaydi. Saqlanmagan o'zgarish bilan sahifadan chiqmoqchi bo'lsangiz, panel ogohlantiradi.

## 4.1. Qidiruv va Google

- **Saytdagi qidiruv:** header'dagi 🔍 belgisi `/search.html` sahifasini ochadi. Qidiruv hamma **Published** kontentni qamrab oladi:
  - yangiliklar (to'liq matni bilan), maqolalar, xodimlar, loyihalar;
  - tadqiqot yo'nalishlari, facilities, hamkorlik, xizmatlar;
  - sahifa matnlari.

  Admin panelda qo'shilgan yoki o'zgartirilgan yozuv darhol qidiruvga tushadi, o'chirilgani esa chiqib ketadi. Draft yozuvlar qidiruvda ko'rinmaydi. Barcha so'zlar istalgan tartibda topiladi; aniq ibora uchun qo'shtirnoq ishlating (`"soil fungi"`); raqamlar butun son sifatida solishtiriladi (`7` so'rovi `1997` ni topmaydi). Natijalar soni cheklanmagan. Kichik-katta harf, urg'u belgilari va o'zbekcha apostroflar (`o'`, `oʻ`, `o‘`) farq qilmaydi. Sahifa matnlari admin panelning **Qidiruv** bo'limida, belgini yashirish esa **Sozlamalar** da.
- **Google'da topilish:**
  - `https://sizning-domen.uz/sitemap.xml` barcha sahifalar va har bir yangilik manzilini avtomatik ro'yxatlaydi;
  - `robots.txt` Google'ga sitemap manzilini ko'rsatadi va `/admin` ni yopadi.

  Sayt online bo'lgach, [Google Search Console](https://search.google.com/search-console) da domeningizni tasdiqlang va **Sitemaps** bo'limiga `sitemap.xml` ni qo'shing. Google sahifalarni odatda bir necha kundan bir necha haftagacha ichida indekslaydi. `.env` da `SITE_URL` to'g'ri yozilgan bo'lishi kerak.

## 5. Serverga (hosting) joylash

### A) VPS (Ubuntu) — tavsiya etiladi

```bash
# 1. Node.js 22 o'rnatish
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs nginx

# 2. Loyihani /var/www/ecobiome ga joylang, so'ng:
cd /var/www/ecobiome
npm ci --omit=dev
cp .env.example .env && nano .env        # SESSION_SECRET, SITE_URL va boshqalar
npm run seed && npm run create-admin
```

**systemd xizmati** (`/etc/systemd/system/ecobiome.service`):

```ini
[Unit]
Description=Ecobiome website
After=network.target

[Service]
WorkingDirectory=/var/www/ecobiome
ExecStart=/usr/bin/node server.js
Restart=always
User=www-data
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /var/www/ecobiome
sudo systemctl enable --now ecobiome
```

**nginx** (`/etc/nginx/sites-available/ecobiome`):

```nginx
server {
    server_name ecobiome.uz www.ecobiome.uz;
    client_max_body_size 500M;          # backup import uchun (MAX_IMPORT_MB bilan mos)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ecobiome /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d ecobiome.uz -d www.ecobiome.uz   # bepul HTTPS
```

`.env` da `TRUST_PROXY=1` va `COOKIE_SECURE=1` bo'lishi shart. `COOKIE_SECURE=1` bo'lsa, sessiya cookie'si HTTPS so'rovlarda avtomatik Secure bo'ladi. Admin panel oddiy HTTP orqali ochilsa, server logida ogohlantirish chiqadi.

### B) cPanel "Setup Node.js App" bo'lgan shared hosting

1. cPanel → **Setup Node.js App** → **Create Application**:
   - Node versiyasi: 20 yoki 22;
   - Application root: `ecobiome`;
   - Startup file: `server.js`.
2. Fayllarni File Manager yoki FTP orqali shu papkaga yuklang (`node_modules` dan tashqari).
3. Ilova sahifasida **Run NPM Install** tugmasini bosing.
4. Muhit o'zgaruvchilarini (`.env` dagi qiymatlar) shu sahifada kiriting yoki `.env` faylini yuklang.
5. cPanel **Terminal** orqali quyidagini bajaring (terminal ichida avval cPanel ko'rsatgan `source …/activate` buyrug'ini ishga tushiring):
   `npm run seed && npm run create-admin`
6. **Restart** tugmasini bosing.

> `better-sqlite3` va `sharp` tayyor binar paketlarni yuklab oladi. Agar hosting ularni o'rnata olmasa, VPS variantidan foydalaning.

### Yangilash (yangi kod versiyasi)

```bash
npm run backup          # avval backup
# yangi fayllarni joylang (data/, uploads/, backups/, .env ga tegmang)
npm ci --omit=dev && npm run migrate && sudo systemctl restart ecobiome
```

## 6. Backup

Barcha ma'lumotlar bitta `.zip` backup'ga kiradi: kontent, foydalanuvchilar, xabarlar, o'zgarishlar tarixi, yuklangan rasm va PDF'lar.

### 6.1. Avtomatik kunlik backup (serverda) — sozlash shart emas

- **Qachon:** ishlab turgan server **har kuni** `BACKUP_HOUR` (standart: 03:00, `TZ` vaqt zonasi bo'yicha) da o'zi backup oladi. Cron kerak emas.
- **Qayerda:** nusxalar `backups/` papkasida turadi. Oxirgi `BACKUP_KEEP` ta (standart: 14) saqlanadi, eskilari o'zi o'chadi.
- **Admin panel:** **Tizim → Backup** sahifasida oxirgi backup vaqti, hajmi va xatolar ko'rinadi. **"Hozir backup olish"** tugmasi istalgan paytda qo'shimcha backup oladi.
- **Tiklash:** o'sha sahifada `.zip` tanlanib **Import qilish** bosiladi. Import oldidan joriy holat avtomatik saqlanadi.

> ⚠ Bu nusxalar **o'sha serverning o'zida** turadi. Server buzilsa yoki o'chirilsa, ular ham yo'qoladi. Shuning uchun 6.2 ni ham sozlang.

### 6.2. Onlayn (serverdan tashqari) nusxa — Google Drive misolida

`OFFSITE_REMOTE` sozlansa, har bir backup (kunlik ham, "Hozir backup olish" ham) avtomatik ravishda onlayn xotiraga ham yuboriladi. U yerda `OFFSITE_KEEP_DAYS` (standart: 90) kundan eski nusxalar o'chiriladi. Boshqa fayllaringizga tegilmaydi, faqat `ecobiome-*.zip` fayllari boshqariladi.

Buning uchun [rclone](https://rclone.org) ishlatiladi. U Google Drive, Dropbox, OneDrive, Yandex Disk, Mega, S3 va boshqa ko'plab xizmatlar bilan ishlaydi.

**1. Serverga rclone o'rnatish:**
```bash
curl https://rclone.org/install.sh | sudo bash
```

**2. Google Drive'ni ulash.** Serverda brauzer yo'q, shuning uchun bir qadam kompyuteringizda bajariladi. Serverda:
```bash
cd /var/www/ecobiome-cms
sudo -u www-data rclone config --config rclone.conf
```
Savollarga javoblar:
- `n` (new remote) → nom: `gdrive` → xizmat ro'yxatidan **Google Drive** raqamini kiriting;
- `client_id` va `client_secret` → bo'sh qoldiring (Enter);
- `scope` → `1` (to'liq kirish);
- keyingi savollar → Enter;
- **"Use web browser to automatically authenticate?"** → `n`.

Ekranda `rclone authorize "drive" "…"` ko'rinishidagi buyruq chiqadi. **Kompyuteringizda** (Windows): rclone'ni o'rnating (`winget install Rclone.Rclone`), PowerShell'da shu buyruqni ishga tushiring, ochilgan brauzerda Google hisobingizga kiring va ruxsat bering. Terminalda chiqqan uzun tokenni nusxalab, serverdagi savolga joylang. Qolgan savollarga Enter bosib, oxirida `q` bilan chiqing.

**3. `.env` ga yozish:**
```
OFFSITE_REMOTE=gdrive:ecobiome-backups
RCLONE_CONFIG=rclone.conf
```
(`ecobiome-backups` — Google Drive'dagi papka nomi, o'zi yaratiladi.)

**4. Tekshirish va qayta ishga tushirish:**
```bash
sudo -u www-data node scripts/backup.js      # "✓ Off-site: gdrive:ecobiome-backups/…" chiqishi kerak
sudo systemctl restart ecobiome
```
Endi admin panelning Backup sahifasida **"Oxirgi onlayn yuborish ✓"** ko'rinadi. Yuborish ishlamay qolsa, o'sha yerda qizil ogohlantirish chiqadi.

> `rclone.conf` Google hisobingizga kirish kalitini saqlaydi. U `.gitignore` da, uni hech kimga bermang.

### 6.3. Qo'shimcha: qo'lda nusxa

Istalgan paytda **Tizim → Backup → "Backup yuklab olish"** tugmasi bilan `.zip` ni kompyuteringizga yuklab olishingiz mumkin.

## 7. Xavfsizlik

- **Parollar:** bcrypt (cost 12) bilan hash qilinadi.
- **Login himoyasi:**
  - 5 marta noto'g'ri kiritilgan paroldan keyin hisob 15 daqiqaga bloklanadi;
  - bitta IP'dan 15 daqiqada 20 tadan ortiq noto'g'ri urinish bo'lsa, o'sha IP to'xtatiladi.

  Barcha qiymatlar `.env` da sozlanadi.
- **Sessiyalar:** httpOnly, SameSite va (production'da) Secure cookie bilan ishlaydi. Muddati `SESSION_HOURS` da belgilanadi. Sessiyalar bazada saqlanadi; parol almashtirilganda boshqa qurilmalardagi sessiyalar yopiladi.
- **CSRF:** admin'dagi har bir o'zgartiruvchi so'rov sessiya tokeni bilan tekshiriladi. Ommaviy contact forma double-submit cookie usuli bilan himoyalangan.
- **XSS:**
  - saytdagi barcha matnlar render paytida escape qilinadi;
  - rich text serverda `sanitize-html` whitelist bilan tozalanadi;
  - `javascript:` va `data:` havolalari rad etiladi;
  - qat'iy CSP header qo'yilgan (inline skript taqiqlangan).
- **Fayl yuklash:** fayl turi kengaytmasiga emas, mazmuniga (magic bytes) qarab tekshiriladi. SVG va boshqa xavfli turlar qabul qilinmaydi, hajm cheklangan (`MAX_UPLOAD_MB`). Backup importida zip-slip'dan himoya bor.
- **Kod va sozlamalar:**
  - barcha SQL so'rovlar parametrlangan;
  - maxfiy kalitlar faqat `.env` da saqlanadi (u `.gitignore` da);
  - `/admin` qidiruv tizimlari uchun yopiq.

## 8. Ko'p tillilik (tayyor sxema)

`translations` jadvali tayyor: `(entity, entity_id, field, lang, value)`.

- Asosiy ustunlar standart tilni saqlaydi (`settings.default_language = "en"`).
- Boshqa tillar har bir maydon uchun shu jadvalga yoziladi va o'qishda asosiy qiymatga fallback qilinadi.
- Tillar ro'yxati `settings.languages` da turadi.

Ko'p tillilik yoqilganda quyidagilar qo'shiladi: formalarda EN / UZ / RU tablari, `/uz/…` va `/ru/…` marshrutlari hamda header'da til almashtirgich. Bu mavjud ma'lumotlarga ta'sir qilmaydi.

## 9. Sinov

```bash
npm test     # 75 ta end-to-end tekshiruv (tests/e2e.js boshidagi izohga qarang — faqat test bazasida!)
```

## 10. Papka tuzilmasi

```
server.js                 Express ilova
src/config.js             .env o'qish
src/db/schema.sql         jadval sxemasi · seed-data.json — asl sayt kontenti
src/content/model.js      barcha bo'limlar, maydonlar, admin menyusi (bitta joyda)
src/lib/                  repo (ma'lumot + tarix), sanitize, auth, media, backup
src/routes/               public.js (sayt) · admin.js (login + API)
src/views/                EJS shablonlar (sayt + admin qobig'i)
public/                   css/style.css, js/main.js, assets/, admin/ (panel JS/CSS)
scripts/                  create-admin.js, backup.js
data/ uploads/ backups/   ish vaqtida yaratiladi (gitignore)
```

## 11. Qaysi sahifa qaysi jadvaldan o'qiydi

| Sahifa | Bo'lim | Jadval → maydonlar |
|---|---|---|
| Barcha sahifalar | `<head>` | `pages` → seo_title, seo_description, og_title, og_description, og_image · `settings` → favicon |
| | Header | `settings` → logo, logo_alt, brand_name, brand_tagline · `menu_items` (location = header, header_button; parent_id → submenyu) |
| | Footer | `settings` → footer_about, socials, footer_col1–3_title, address_short, email, phone, copyright_text, privacy/terms · `menu_items` (footer_1, footer_2) |
| | Page hero · CTA | `pages` → breadcrumb, hero_title, hero_lede · cta_enabled, cta_eyebrow, cta_title, cta_label, cta_url |
| **Home** `/` | Hero slayder | `hero_slides` → image, alt, focus, eyebrow, title, btn1/2 · `blocks.home_hero` (umumiy tugmalar) · `settings.slide_interval` |
| | Info + Mission | `blocks.home_info` |
| | About us | `blocks.home_about` → vision, history, quote, quote_author |
| | Explore | `blocks.home_explore` · `explore_cards` |
| | Contact forma (ixtiyoriy) | `blocks.home_contact` · `settings` → show_contact_form, address_full, office_hours, research_email, collab_email, map_url → natija `messages` ga yoziladi |
| **Research** | Tablar | `blocks.research_tabs` |
| | Research areas | `research_areas` → title, summary, questions, methods, current_focus, related_projects, link |
| | Facilities | `blocks.research_facilities` · `facilities` → icon, title, description, specs · `blocks.research_facility_practice` |
| | Collaboration | `blocks.research_collab` · `collab_types` · `blocks.research_network` · `collab_locations` · `blocks.research_timeline` · `collab_timeline` |
| **People** | Guruhlar | `blocks.people_intro` (izoh + 4 ta guruh sarlavhasi) · `people` → grp, name, photo, initials, role_title, bio, tags, email, orcid, scholar_url |
| **Projects** | Kartalar | `blocks.projects_intro` · `projects` → title, badge, state, year_start/end, overview … outcomes, related_label, tags, image, link · `project_people` → People |
| **Publications** | Filtr + ro'yxat (barcha yillar, cheklovsiz; so'z, yil, yo'nalish bo'yicha) | `blocks.publications_intro` · `pub_categories` · `publications` → year bo'yicha avtomatik guruh, authors, journal, volume, issue, pages, doi, category, pdf, url |
| **News & Events** | Kartalar | `news` → date, label, title, excerpt, cover, slug · `blocks.news_intro` |
| | `/news/<slug>.html` | `news` → title, date, label, context, body (rich text), cover, seo_*, og_* |
| **Search** `/search.html` | Qidiruv | `pages.search` (hero, SEO) · `blocks.search_intro` (matnlar) · natijalar barcha Published jadvallardan |
| **Services** | Kartalar | `services` → tag_label, title, description, methodology, applications, request_label/url, tags |
| Admin | — | `users`, `sessions`, `login_attempts`, `media`, `messages`, `revisions`, `slug_redirects`, `translations` |

**Slug o'zgarsa:** yangilikning slug'i o'zgartirilsa, eski `/news/<eski-slug>.html` manzili avtomatik 301 bilan yangisiga yo'naltiriladi (`slug_redirects` jadvali).

**Eski manzillar** 301 bilan yangi manzillarga yo'naltiriladi:

- `/facilities.html` → `/research.html#facilities`
- `/collaboration.html` → `/research.html#collaboration`
- `/contact.html` → `/#contact`
- `/news-article.html` → asl maqolaning yangi manzili
