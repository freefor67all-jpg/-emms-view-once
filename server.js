const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const Database = require("better-sqlite3");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

const BASE = __dirname;
const UPLOAD_DIR = path.join(BASE, "uploads");
const DB_FILE = path.join(BASE, "emms.sqlite");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

/* =========================
   DATABASE
========================= */

const db = new Database(DB_FILE);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  amount_ngn INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  paystack_reference TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL,
  amount_ngn INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

/* =========================
   DEFAULT PRICES
========================= */

const defaultSettings = {
  monthly_price: "1000",
  yearly_price: "15000",
};

for (const [key, value] of Object.entries(defaultSettings)) {
  db.prepare(
    "INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)"
  ).run(key, value);
}

/* =========================
   ADMIN ACCOUNT
========================= */

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const email = process.env.ADMIN_EMAIL.toLowerCase();

  const existing = db
    .prepare("SELECT id FROM users WHERE email=?")
    .get(email);

  if (!existing) {
    const hash = bcrypt.hashSync(
      process.env.ADMIN_PASSWORD,
      12
    );

    db.prepare(
      "INSERT INTO users(email,password_hash,is_admin) VALUES(?,?,1)"
    ).run(email, hash);

    console.log("Admin account created.");
  }
}

/* =========================
   FILE UPLOAD
========================= */

const upload = multer({
  dest: UPLOAD_DIR,

  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 10,
  },

  fileFilter: (_, file, cb) => {
    if (!/^image\\/|^video\\//.test(file.mimetype)) {
      return cb(
        new Error("Only image and video files are allowed.")
      );
    }

    cb(null, true);
  },
});

/* =========================
   VIEW ONCE STORAGE
========================= */

const viewOnceItems = new Map();

/* =========================
   HELPERS
========================= */

function getSetting(key) {
  const row = db
    .prepare("SELECT value FROM settings WHERE key=?")
    .get(key);

  return row ? row.value : undefined;
}

function getPrices() {
  return {
    monthly: Number(
      getSetting("monthly_price") || 1000
    ),

    yearly: Number(
      getSetting("yearly_price") || 15000
    ),
  };
}

function getUserById(id) {
  return db
    .prepare(
      "SELECT id,email,is_admin,created_at FROM users WHERE id=?"
    )
    .get(id);
}

function getActiveSubscription(userId) {
  return db
    .prepare(`
      SELECT *
      FROM subscriptions
      WHERE user_id=?
      AND status='active'
      AND datetime(expires_at) > datetime('now')
      ORDER BY datetime(expires_at) DESC
      LIMIT 1
    `)
    .get(userId);
}

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Login required.",
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  const user = req.session.userId
    ? getUserById(req.session.userId)
    : null;

  if (!user || !user.is_admin) {
    return res.status(403).json({
      error: "Admin access required.",
    });
  }

  next();
}

function ngnToKobo(naira) {
  return Math.round(Number(naira) * 100);
}

/* =========================
   HOME
========================= */

app.get("/", (_, res) => {
  res.send(homePage());
});

/* =========================
   PUBLIC CONFIG
========================= */

app.get("/api/config", (_, res) => {
  const prices = getPrices();

  res.json({
    monthly: prices.monthly,
    yearly: prices.yearly,
    paystackConfigured:
      Boolean(process.env.PAYSTACK_SECRET_KEY),
  });
});

/* =========================
   CURRENT USER
========================= */

app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({
      loggedIn: false,
      premium: false,
    });
  }

  const user = getUserById(req.session.userId);
  const subscription = getActiveSubscription(
    req.session.userId
  );

  res.json({
    loggedIn: true,
    user,
    premium: Boolean(subscription),
    subscription: subscription || null,
  });
});

/* =========================
   REGISTER
========================= */

app.post("/api/register", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();

  const password = String(req.body.password || "");

  if (
    !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)
  ) {
    return res.status(400).json({
      error: "Enter a valid email.",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters.",
    });
  }

  const existing = db
    .prepare("SELECT id FROM users WHERE email=?")
    .get(email);

  if (existing) {
    return res.status(409).json({
      error: "An account already exists.",
    });
  }

  const passwordHash = await bcrypt.hash(
    password,
    12
  );

  const result = db
    .prepare(
      "INSERT INTO users(email,password_hash) VALUES(?,?)"
    )
    .run(email, passwordHash);

  req.session.userId = Number(
    result.lastInsertRowid
  );

  res.json({
    ok: true,
  });
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();

  const password = String(req.body.password || "");

  const user = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get(email);

  if (
    !user ||
    !(await bcrypt.compare(
      password,
      user.password_hash
    ))
  ) {
    return res.status(401).json({
      error: "Invalid email or password.",
    });
  }

  req.session.userId = user.id;

  res.json({
    ok: true,
  });
});

/* =========================
   LOGOUT
========================= */

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true,
    });
  });
});

/* =========================
   VIEW ONCE UPLOAD
========================= */

app.post(
  "/api/upload",
  upload.single("media"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "No media uploaded.",
      });
    }

    const id = crypto
      .randomBytes(18)
      .toString("hex");

    viewOnceItems.set(id, {
      file: req.file.filename,
    });

    res.json({
      url: `${req.protocol}://${req.get(
        "host"
      )}/view/${id}`,
    });
  }
);

/* =========================
   VIEW ONCE PAGE
========================= */

app.get("/view/:id", (req, res) => {
  const id = encodeURIComponent(req.params.id);

  res.send(`
<!doctype html>

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>EMMS View Once</title>

<style>

body{
  margin:0;
  padding:30px;
  background:#05070d;
  color:white;
  text-align:center;
  font-family:system-ui;
}

video{
  max-width:100%;
  border-radius:18px;
}

</style>

<h1>EMMS</h1>

<p id="status">Opening…</p>

<video
  id="video"
  controls
  autoplay
  playsinline
  hidden
></video>

<script>

fetch("/api/media/${id}")

.then(async response => {

  if(!response.ok){

    const data =
      await response.json();

    throw Error(data.error);

  }

  return response.blob();

})

.then(blob => {

  video.src =
    URL.createObjectURL(blob);

  video.hidden = false;

  status.textContent =
    "This media can only be opened once.";

})

.catch(error => {

  status.textContent =
    error.message;

});

</script>
`);
});

/* =========================
   VIEW ONCE MEDIA
========================= */

app.get("/api/media/:id", (req, res) => {
  const item = viewOnceItems.get(
    req.params.id
  );

  if (!item) {
    return res.status(404).json({
      error:
        "This View Once media is no longer available.",
    });
  }

  viewOnceItems.delete(req.params.id);

  const filename = path.basename(
    item.file
  );

  const filePath = path.join(
    UPLOAD_DIR,
    filename
  );

  res.sendFile(filePath, error => {

    fs.rm(
      filePath,
      { force: true },
      () => {}
    );

    if (
      error &&
      !res.headersSent
    ) {
      res.status(404).json({
        error: "Media unavailable.",
      });
    }

  });
});

/* =========================
   PREMIUM PLANS
========================= */

app.get("/api/premium/plans", (_, res) => {

  const prices = getPrices();

  res.json({

    currency: "NGN",

    plans: [

      {
        id: "monthly",
        name: "Monthly",
        amount: prices.monthly,
      },

      {
        id: "yearly",
        name: "Yearly",
        amount: prices.yearly,
      },

    ],

  });

});

/* =========================
   PAYSTACK INITIALIZATION
========================= */

app.post(
  "/api/paystack/initialize",
  requireLogin,
  async (req, res) => {

    if (!process.env.PAYSTACK_SECRET_KEY) {

      return res.status(503).json({
        error:
          "Paystack is not configured yet.",
      });

    }

    const plan =
      req.body.plan === "yearly"
        ? "yearly"
        : "monthly";

    const prices = getPrices();

    const amount = prices[plan];

    const user = getUserById(
      req.session.userId
    );

    try {

      const response = await fetch(
        "https://api.paystack.co/transaction/initialize",
        {

          method: "POST",

          headers: {

            Authorization:
              `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,

            "Content-Type":
              "application/json",

          },

          body: JSON.stringify({

            email: user.email,

            amount:
              ngnToKobo(amount),

            currency: "NGN",

            callback_url:
              `${req.protocol}://${req.get("host")}/payment/callback`,

            metadata: {

              user_id: user.id,

              plan,

            },

          }),

        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.status
      ) {

        return res.status(502).json({
          error:
            data.message ||
            "Payment initialization failed.",
        });

      }

      res.json({

        authorization_url:
          data.data.authorization_url,

        reference:
          data.data.reference,

      });

    } catch (error) {

      res.status(502).json({
        error:
          "Could not reach Paystack.",
      });

    }

  }
);

/* =========================
   PAYSTACK CALLBACK
========================= */

app.get(
  "/payment/callback",
  async (req, res) => {

    const reference =
      String(
        req.query.reference || ""
      );

    if (
      !reference ||
      !process.env.PAYSTACK_SECRET_KEY
    ) {

      return res
        .status(400)
        .send(
          "Missing payment reference."
        );

    }

    try {

      const response = await fetch(

        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,

        {

          headers: {

            Authorization:
              `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,

          },

        }

      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.status ||
        data.data.status !==
          "success"
      ) {

        return res
          .status(400)
          .send(
            "Payment was not successful."
          );

      }

      const metadata =
        data.data.metadata || {};

      const userId =
        Number(metadata.user_id);

      const plan =
        metadata.plan === "yearly"
          ? "yearly"
          : "monthly";

      const prices =
        getPrices();

      const expectedAmount =
        ngnToKobo(
          prices[plan]
        );

      if (
        Number(data.data.amount) !==
          expectedAmount ||
        !userId
      ) {

        return res
          .status(400)
          .send(
            "Payment amount could not be verified."
          );

      }

      const existing =
        db.prepare(
          "SELECT id FROM payments WHERE reference=?"
        ).get(reference);

      if (!existing) {

        const start =
          new Date();

        const end =
          new Date(start);

        end.setMonth(
          end.getMonth() +
          (plan === "yearly"
            ? 12
            : 1)
        );

        const addPayment =
          db.prepare(`
            INSERT INTO payments
            (
              user_id,
              reference,
              plan,
              amount_ngn,
              status
            )
            VALUES(?,?,?,?,?)
          `);

        const addSubscription =
          db.prepare(`
            INSERT INTO subscriptions
            (
              user_id,
              plan,
              amount_ngn,
              status,
              starts_at,
              expires_at,
              paystack_reference
            )
            VALUES(?,?,?,?,?,?,?)
          `);

        const transaction =
          db.transaction(() => {

            addPayment.run(
              userId,
              reference,
              plan,
              prices[plan],
              "success"
            );

            addSubscription.run(
              userId,
              plan,
              prices[plan],
              "active",
              start.toISOString(),
              end.toISOString(),
              reference
            );

          });

        transaction();

      }

      res.redirect(
        "/?payment=success"
      );

    } catch (error) {

      res
        .status(502)
        .send(
          "Could not verify payment."
        );

    }

  }
);
/* =========================
   ADMIN PRICE CONTROL
========================= */

app.post(
  "/api/admin/prices",
  requireAdmin,
  (req, res) => {
    const monthly = Number(req.body.monthly);
    const yearly = Number(req.body.yearly);

    if (
      !Number.isInteger(monthly) ||
      monthly < 0 ||
      !Number.isInteger(yearly) ||
      yearly < 0
    ) {
      return res.status(400).json({
        error:
          "Prices must be whole numbers in NGN.",
      });
    }

    db.prepare(
      "UPDATE settings SET value=? WHERE key='monthly_price'"
    ).run(String(monthly));

    db.prepare(
      "UPDATE settings SET value=? WHERE key='yearly_price'"
    ).run(String(yearly));

    res.json({
      ok: true,
      prices: getPrices(),
    });
  }
);


/* =========================
   ADMIN USERS
========================= */

app.get(
  "/api/admin/users",
  requireAdmin,
  (req, res) => {

    const users = db.prepare(`
      SELECT
        u.id,
        u.email,
        u.is_admin,
        u.created_at,

        (
          SELECT expires_at
          FROM subscriptions s
          WHERE s.user_id = u.id
          AND s.status = 'active'
          ORDER BY datetime(s.expires_at) DESC
          LIMIT 1
        ) AS premium_until

      FROM users u

      ORDER BY u.id DESC
    `).all();

    res.json({
      users,
    });

  }
);


/* =========================
   ADMIN PREMIUM CONTROL
========================= */

app.post(
  "/api/admin/users/:id/premium",
  requireAdmin,
  (req, res) => {

    const userId =
      Number(req.params.id);

    const active =
      Boolean(req.body.active);

    const user =
      getUserById(userId);

    if (!user) {

      return res.status(404).json({
        error:
          "User not found.",
      });

    }

    if (!active) {

      db.prepare(`
        UPDATE subscriptions
        SET status='cancelled'
        WHERE user_id=?
        AND status='active'
      `).run(userId);

    } else {

      const start =
        new Date();

      const end =
        new Date(start);

      end.setMonth(
        end.getMonth() + 1
      );

      db.prepare(`
        INSERT INTO subscriptions
        (
          user_id,
          plan,
          amount_ngn,
          status,
          starts_at,
          expires_at
        )
        VALUES(?,?,?,?,?,?)
      `).run(
        userId,
        "admin",
        0,
        "active",
        start.toISOString(),
        end.toISOString()
      );

    }

    res.json({
      ok: true,
    });

  }
);


/* =========================
   ADMIN STATISTICS
========================= */

app.get(
  "/api/admin/stats",
  requireAdmin,
  (_, res) => {

    const users =
      db.prepare(
        "SELECT COUNT(*) AS n FROM users"
      ).get().n;

    const premiumUsers =
      db.prepare(`
        SELECT COUNT(
          DISTINCT user_id
        ) AS n

        FROM subscriptions

        WHERE status='active'

        AND datetime(expires_at)
        > datetime('now')
      `).get().n;

    const successfulPayments =
      db.prepare(`
        SELECT COUNT(*) AS n

        FROM payments

        WHERE status='success'
      `).get().n;

    res.json({

      users,

      premiumUsers,

      successfulPayments,

      prices: getPrices(),

    });

  }
);


/* =========================
   ERROR HANDLER
========================= */

app.use(
  (err, req, res, next) => {

    if (
      err instanceof
      multer.MulterError
    ) {

      return res.status(400).json({
        error: err.message,
      });

    }

    if (err) {

      return res.status(400).json({
        error:
          err.message ||
          "Request failed.",
      });

    }

    next();

  }
);


/* =========================
   CINEMATIC HOMEPAGE
========================= */

function homePage() {

return `<!doctype html>

<html lang="en">

<head>

<meta charset="utf-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1"
>

<title>
EMMS — Cinematic AI Media Studio
</title>

<style>

/* RESET */

*{
box-sizing:border-box;
}

html{
scroll-behavior:smooth;
}

body{

margin:0;

background:#020409;

color:#fff;

font-family:
Inter,
system-ui,
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
sans-serif;

}

/* BACKGROUND */

body:before{

content:"";

position:fixed;

inset:0;

pointer-events:none;

background:

radial-gradient(
circle at 50% 0%,
rgba(43,125,255,.22),
transparent 38%
),

linear-gradient(
180deg,
#020409,
#07101e 55%,
#020308
);

z-index:-1;

}

/* NAVIGATION */

nav{

position:sticky;

top:0;

z-index:10;

padding:
16px 5%;

display:flex;

justify-content:space-between;

align-items:center;

background:
rgba(3,5,10,.78);

backdrop-filter:
blur(15px);

border-bottom:
1px solid #182238;

}

.logo{

font-weight:950;

letter-spacing:6px;

font-size:22px;

}

.navlinks{

display:flex;

gap:8px;

flex-wrap:wrap;

}

.navlinks a{

color:#c9d7ed;

text-decoration:none;

padding:9px 12px;

border-radius:10px;

}

.navlinks a:hover{

background:#101a2b;

}


/* HERO */

.hero{

min-height:88vh;

display:grid;

place-items:center;

text-align:center;

padding:
70px 20px;

position:relative;

overflow:hidden;

}

.hero:after{

content:"";

position:absolute;

width:600px;

height:600px;

border-radius:50%;

background:
rgba(0,116,255,.15);

filter:
blur(100px);

top:15%;

left:50%;

transform:
translateX(-50%);

z-index:-1;

}

.hero h1{

font-size:
clamp(48px,10vw,100px);

line-height:.92;

margin:0;

letter-spacing:-4px;

}

.hero h1 span{

background:
linear-gradient(
90deg,
#fff,
#6eb7ff,
#fff
);

-webkit-background-clip:
text;

color:transparent;

}

.hero p{

max-width:720px;

margin:
24px auto;

color:#aebbd0;

font-size:19px;

line-height:1.7;

}

.actions{

display:flex;

justify-content:center;

gap:12px;

flex-wrap:wrap;

}

.btn{

border:0;

border-radius:999px;

padding:
15px 23px;

font-weight:850;

color:white;

background:
linear-gradient(
135deg,
#1683ff,
#4b42ff
);

cursor:pointer;

text-decoration:none;

box-shadow:
0 12px 40px
rgba(31,105,255,.22);

}

.btn.alt{

background:#101827;

border:
1px solid #263753;

}


/* SECTIONS */

.wrap{

max-width:1100px;

margin:auto;

padding:
60px 20px;

}

.grid{

display:grid;

grid-template-columns:
repeat(
auto-fit,
minmax(280px,1fr)
);

gap:18px;

}

.card{

background:
rgba(10,16,28,.86);

border:
1px solid #1a2941;

border-radius:24px;

padding:25px;

box-shadow:
0 25px 80px
rgba(0,0,0,.28);

}

h2{

font-size:31px;

margin:
0 0 12px;

}

h3{

margin-top:0;

}

.muted{

color:#9eacc0;

}


/* FORM ELEMENTS */

.drop{

border:
1px dashed #385274;

border-radius:18px;

padding:24px;

text-align:center;

}

.drop input{

margin-top:12px;

}

input,
textarea,
select{

width:100%;

padding:13px;

border-radius:12px;

border:
1px solid #273a55;

background:#07101b;

color:white;

margin:
8px 0 12px;

}

textarea{

min-height:110px;

resize:vertical;

}


/* STATUS */

.status{

min-height:24px;

color:#9ec8ff;

}

.hidden{

display:none !important;

}


/* VIDEO */

video{

width:100%;

border-radius:18px;

margin-top:15px;

}


/* PREMIUM */

.price{

font-size:34px;

font-weight:900;

}

.pill{

display:inline-block;

padding:
5px 9px;

border-radius:999px;

background:#0c2849;

color:#7fbeff;

font-size:12px;

}


/* ADMIN */

.admin{

border-color:#4b3b13;

background:
linear-gradient(
145deg,
#17130a,
#0b111b
);

}

table{

width:100%;

border-collapse:collapse;

}

td,
th{

padding:10px;

border-bottom:
1px solid #20304a;

text-align:left;

font-size:13px;

}


/* MOBILE */

@media(max-width:600px){

.navlinks a{

display:none;

}

.hero h1{

letter-spacing:-2px;

}

.wrap{

padding:
42px 14px;

}

}

</style>

</head>


<body>


<!-- NAVIGATION -->

<nav>

<div class="logo">
EMMS
</div>

<div class="navlinks">

<a href="#studio">
Studio
</a>

<a href="#premium">
Premium
</a>

<a href="#account">
Account
</a>

<a href="#admin">
Admin
</a>

</div>

</nav>


<!-- HERO -->

<section class="hero">

<div>

<span class="pill">
CINEMATIC MEDIA STUDIO
</span>

<h1>

Turn Your
<span>Moments</span>

<br>

Into Stories.

</h1>

<p>

Create cinematic videos from
your words and images.

Share them with EMMS View Once,
and unlock premium creation tools.

</p>

<div class="actions">

<a
class="btn"
href="#studio"
>
Create Video
</a>

<a
class="btn alt"
href="#premium"
>
View Premium
</a>

</div>

</div>

</section>


<!-- STUDIO -->

<section
class="wrap"
id="studio"
>

<div class="grid">


<!-- VIDEO GENERATOR -->

<div class="card">

<h2>
🎬 Video Studio
</h2>

<p class="muted">

Choose up to 10 images and
turn them into a short
cinematic slideshow.

</p>

<div class="drop">

<b>
Images
</b>

<input
id="images"
type="file"
accept="image/*"
multiple
>

</div>

<textarea
id="caption"
maxlength="1000"
placeholder="Write your story or caption..."
></textarea>

<button
class="btn"
style="width:100%"
onclick="makeVideo()"
>

Generate Cinematic Video

</button>

<p
id="videoStatus"
class="status"
></p>

<video
id="preview"
controls
hidden
></video>

<button
id="shareBtn"
class="btn alt hidden"
style="width:100%"
onclick="shareVideo()"
>

Create View Once Link

</button>

<p
id="shareStatus"
class="status"
></p>

</div>


<!-- OUTFIT EDITOR -->

<div class="card">

<h2>
👗 AI Outfit Editor
</h2>

<p class="muted">

Upload a photo and describe
a replacement outfit.

This feature is for clothing
replacement only.

</p>

<input
id="outfitImage"
type="file"
accept="image/*"
>

<textarea
id="outfitPrompt"
placeholder="Example: Replace the current outfit with a black formal evening gown."
></textarea>

<button
class="btn"
style="width:100%"
onclick="outfitEdit()"
>

Generate Outfit Edit

</button>

<p
id="outfitStatus"
class="status"
></p>

<p class="muted">

The AI image service must be
configured by the site owner
before this feature can generate
an edited image.

</p>

</div>


</div>

</section>


<!-- PREMIUM -->

<section
class="wrap"
id="premium"
>

<div class="card">

<h2>
⭐ EMMS Premium
</h2>

<p class="muted">

Unlock advanced creation tools.
Prices are controlled by the
administrator.

</p>

<div class="grid">


<div>

<span class="pill">
MONTHLY
</span>

<div
class="price"
id="monthlyPrice"
>
₦1,000
</div>

<button
class="btn"
onclick="buy('monthly')"
>

Subscribe Monthly

</button>

</div>


<div>

<span class="pill">
YEARLY
</span>

<div
class="price"
id="yearlyPrice"
>
₦15,000
</div>

<button
class="btn"
onclick="buy('yearly')"
>

Subscribe Yearly

</button>

</div>


</div>

<p
id="premiumStatus"
class="status"
></p>

</div>

</section>


<!-- ACCOUNT -->

<section
class="wrap"
id="account"
>

<div class="grid">

<div class="card">

<h2>
Account
</h2>

<p
id="me"
class="muted"
>
Not logged in.
</p>

<input
id="email"
type="email"
placeholder="Email"
>

<input
id="password"
type="password"
placeholder="Password (8+ characters)"
>

<div class="actions">

<button
class="btn"
onclick="register()"
>
Create Account
</button>

<button
class="btn alt"
onclick="login()"
>
Login
</button>

<button
class="btn alt"
onclick="logout()"
>
Logout
</button>

</div>

<p
id="accountStatus"
class="status"
></p>

</div>

</div>

</section>


<!-- ADMIN -->

<section
class="wrap"
id="admin"
>

<div class="card admin">

<h2>
👑 Admin Control
</h2>

<p class="muted">

Only an authenticated
administrator can use these
controls.

</p>

<div class="grid">


<div>

<label>
Monthly price (₦)
</label>

<input
id="adminMonthly"
type="number"
min="0"
>

<label>
Yearly price (₦)
</label>

<input
id="adminYearly"
type="number"
min="0"
>

<button
class="btn"
onclick="savePrices()"
>

Save Prices

</button>

</div>


<div>

<button
class="btn alt"
onclick="loadAdmin()"
>

Load Admin Dashboard

</button>

<p
id="adminStatus"
class="status"
></p>

<div
id="stats"
></div>

</div>

</div>

<div
id="users"
></div>

</div>

</section>


<footer
class="wrap muted"
>

EMMS © 2026 —
Cinematic media,
sharing and creation.

</footer>


<script>

/* =========================
   HELPERS
========================= */

let generatedBlob = null;

let generatedType =
"video/webm";

let viewOnceUrl = "";

const $ =
id =>
document.getElementById(id);

const money =
n =>
new Intl.NumberFormat(
"en-NG",
{
style:"currency",
currency:"NGN",
maximumFractionDigits:0
}
).format(n);


async function api(
url,
options={}
){

const response =
await fetch(
url,
options
);

const data =
await response
.json()
.catch(
() => ({})
);

if(!response.ok){

throw Error(
data.error ||
"Request failed."
);

}

return data;

}


/* =========================
   REFRESH ACCOUNT
========================= */

async function refresh(){

try{

const config =
await api(
"/api/config"
);

$("monthlyPrice")
.textContent =
money(
config.monthly
);

$("yearlyPrice")
.textContent =
money(
config.yearly
);

$("adminMonthly")
.value =
config.monthly;

$("adminYearly")
.value =
config.yearly;


const me =
await api(
"/api/me"
);


$("me").textContent =
me.loggedIn

? "Logged in as "
+ me.user.email
+
(
me.premium
?
" — ⭐ Premium until "
+
new Date(
me.subscription.expires_at
).toLocaleDateString()

: ""
)

: "Not logged in.";


if(me.premium){

$("premiumStatus")
.textContent =
"Premium is active on this account.";

}

}catch(error){

$("accountStatus")
.textContent =
error.message;

}

}


/* =========================
   REGISTER
========================= */

async function register(){

try{

await api(
"/api/register",
{

method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

email:
$("email").value,

password:
$("password").value

})

}
);

$("accountStatus")
.textContent =
"Account created successfully.";

refresh();

}catch(error){

$("accountStatus")
.textContent =
error.message;

}

}


/* =========================
   LOGIN
========================= */

async function login(){

try{

await api(
"/api/login",
{

method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

email:
$("email").value,

password:
$("password").value

})

}
);

$("accountStatus")
.textContent =
"Login successful.";

refresh();

}catch(error){

$("accountStatus")
.textContent =
error.message;

}

}


/* =========================
   LOGOUT
========================= */

async function logout(){

await api(
"/api/logout",
{
method:"POST"
}
);

$("accountStatus")
.textContent =
"You have been logged out.";

refresh();

}


/* =========================
   PREMIUM PAYMENT
========================= */

async function buy(plan){

try{

const data =
await api(
"/api/paystack/initialize",
{

method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({
plan
})

}
);

location.href =
data.authorization_url;

}catch(error){

$("premiumStatus")
.textContent =
error.message;

}

}


/* =========================
   VIDEO GENERATOR
========================= */

async function makeVideo(){

const files =
[
...$("images").files
];

const text =
$("caption")
.value
.trim();


if(!files.length){

$("videoStatus")
.textContent =
"Choose at least one image.";

return;

}


if(!text){

$("videoStatus")
.textContent =
"Write your text first.";

return;

}


$("videoStatus")
.textContent =
"Loading images...";


try{

const bitmaps =
await Promise.all(
files.map(
file =>
createImageBitmap(file)
)
);


const WIDTH = 1280;

const HEIGHT = 720;

const canvas =
document.createElement(
"canvas"
);

canvas.width =
WIDTH;

canvas.height =
HEIGHT;

const ctx =
canvas.getContext(
"2d"
);


const stream =
canvas.captureStream(
30
);


const supportedFormats = [

"video/webm;codecs=vp9",

"video/webm;codecs=vp8",

"video/webm"

];


const mime =
supportedFormats.find(
type =>
MediaRecorder
.isTypeSupported(type)
);


if(!mime){

throw Error(
"This browser cannot create a video recording."
);

}


generatedType =
mime;


const recorder =
new MediaRecorder(
stream,
{
mimeType:mime
}
);


const chunks = [];


recorder.ondataavailable =
event => {

if(event.data.size){

chunks.push(
event.data
);

}

};


const blob =
await new Promise(
resolve => {

recorder.onstop =
() => {

resolve(
new Blob(
chunks,
{
type:mime
}
)
);

};


recorder.start();


const start =
performance.now();

const duration =
20;


function frame(now){

const elapsed =
(now - start) /
1000;


ctx.fillStyle =
"#05070d";

ctx.fillRect(
0,
0,
WIDTH,
HEIGHT
);


const imageIndex =
Math.min(

bitmaps.length - 1,

Math.floor(
elapsed /
(
duration /
bitmaps.length
)
)

);


const image =
bitmaps[
imageIndex
];


const scale =
Math.max(

WIDTH /
image.width,

HEIGHT /
image.height

);


const imageWidth =
image.width *
scale;


const imageHeight =
image.height *
scale;


const progress =
(
elapsed %
(
duration /
bitmaps.length
)
) /
(
duration /
bitmaps.length
);


const zoom =
1.02 +
progress *
0.04;


ctx.save();


ctx.translate(
WIDTH / 2,
HEIGHT / 2
);


ctx.scale(
zoom,
zoom
);


ctx.globalAlpha =
0.98;


ctx.drawImage(

image,

-imageWidth / 2,

-imageHeight / 2,

imageWidth,

imageHeight

);


ctx.restore();


/* cinematic overlay */

ctx.fillStyle =
"rgba(0,0,0,.32)";

ctx.fillRect(
0,
0,
WIDTH,
HEIGHT
);


/* text */

ctx.textAlign =
"center";

ctx.textBaseline =
"middle";

ctx.font =
"700 46px Georgia,serif";

ctx.fillStyle =
"#ffffff";

ctx.shadowColor =
"#000000";

ctx.shadowBlur =
14;


const words =
text.split(
/\\s+/
);


const lines = [];

let line = "";


for(
const word of words
){

const test =
line
?
line + " " + word
:
word;


if(
ctx.measureText(
test
).width >
WIDTH * .78
&&
line
){

lines.push(
line
);

line =
word;

}else{

line =
test;

}

}


if(line){

lines.push(
line
);

}


const lineHeight =
58;


const startY =
HEIGHT / 2
-
(
lines.length *
lineHeight
) / 2
+
lineHeight / 2;


lines
.slice(0,7)
.forEach(
(line,index) => {

ctx.fillText(

line,

WIDTH / 2,

startY +
index *
lineHeight

);

}
);


ctx.shadowBlur = 0;


if(
elapsed <
duration
){

requestAnimationFrame(
frame
);

}else{

recorder.stop();

}

}


requestAnimationFrame(
frame
);

}
);


generatedBlob =
blob;


$("preview").src =
URL.createObjectURL(
blob
);

$("preview").hidden =
false;


$("shareBtn")
.classList
.remove("hidden");


$("videoStatus")
.textContent =
"Video ready. Preview it, then create a View Once link.";

}catch(error){

$("videoStatus")
.textContent =
error.message;

}

}


/* =========================
   VIEW ONCE LINK
========================= */

async function shareVideo(){

if(!generatedBlob){

return;

}


try{

$("shareStatus")
.textContent =
"Uploading...";


const form =
new FormData();


form.append(
"media",
generatedBlob,
"emms-video.webm"
);


const data =
await api(
"/api/upload",
{

method:"POST",

body:form

}
);


viewOnceUrl =
data.url;


$("shareStatus")
.innerHTML =
'<a style="color:#7fbeff" href="'
+
data.url
+
'" target="_blank">'
+
"Open View Once link"
+
"</a>";


if(
navigator.clipboard
){

await navigator.clipboard
.writeText(
data.url
);

}

}catch(error){

$("shareStatus")
.textContent =
error.message;

}

}


/* =========================
   OUTFIT EDITOR
========================= */

async function outfitEdit(){

const file =
$("outfitImage")
.files[0];

const prompt =
$("outfitPrompt")
.value
.trim();


if(
!file ||
!prompt
){

$("outfitStatus")
.textContent =
"Choose an image and describe the replacement outfit.";

return;

}


$("outfitStatus")
.textContent =
"The editor is ready, but an AI image API must be configured on the server before generation can run.";

}


/* =========================
   ADMIN PRICE UPDATE
========================= */

async function savePrices(){

try{

const data =
await api(
"/api/admin/prices",
{

method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

monthly:
$("adminMonthly")
.value,

yearly:
$("adminYearly")
.value

})

}
);


$("adminStatus")
.textContent =
"Prices saved: "
+
money(
data.prices.monthly
)
+
" / "
+
money(
data.prices.yearly
);


refresh();

}catch(error){

$("adminStatus")
.textContent =
error.message;

}

}


/* =========================
   ADMIN DASHBOARD
========================= */

async function loadAdmin(){

try{

const results =
await Promise.all([

api(
"/api/admin/stats"
),

api(
"/api/admin/users"
)

]);


const stats =
results[0];

const users =
results[1];


$("stats")
.textContent =
"Users: "
+
stats.users
+
" | Premium: "
+
stats.premiumUsers
+
" | Successful payments: "
+
stats.successfulPayments;


$("users").innerHTML =

"<h3>Users</h3>"

+

"<table>"

+

"<tr>"

+
"<th>ID</th>"
+
"<th>Email</th>"
+
"<th>Premium until</th>"
+
"<th>Action</th>"

+

"</tr>"

+

users.users
.map(
user =>

"<tr>"

+
"<td>"
+
user.id
+
"</td>"

+

"<td>"
+
user.email
+
"</td>"

+

"<td>"
+
(
user.premium_until
?
new Date(
user.premium_until
)
.toLocaleDateString()
:
"—"
)
+
"</td>"

+

"<td>"

+

"<button onclick='setPremium("
+
user.id
+
","
+
(!user.premium_until)
+
")'>"

+

(
user.premium_until
?
"Disable"
:
"Grant"
)

+

"</button>"

+

"</td>"

+

"</tr>"

)
.join("")

+

"</table>";


}catch(error){

$("adminStatus")
.textContent =
error.message;

}

}


/* =========================
   ADMIN PREMIUM TOGGLE
========================= */

async function setPremium(
id,
active
){

try{

await api(

"/api/admin/users/"
+
id
+
"/premium",

{

method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({
active
})

}

);


loadAdmin();

}catch(error){

$("adminStatus")
.textContent =
error.message;

}

}


/* =========================
   START
========================= */

refresh();

</script>

</body>

</html>`;

}


/* =========================
   START SERVER
========================= */

app.listen(
PORT,
() => {

console.log(
"EMMS running on port "
+
PORT
);

}
);
