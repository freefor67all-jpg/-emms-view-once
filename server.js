const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const uploads = path.join(__dirname, "uploads");
fs.mkdirSync(uploads, { recursive: true });

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  dest: uploads,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

/* =========================
   VIEW ONCE MEDIA
========================= */

const media = new Map();

/* =========================
   PREMIUM SETTINGS
========================= */

let prices = {
  monthly: 1000,
  yearly: 15000
};

/* =========================
   HOME PAGE
========================= */

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1.0"
>

<title>EMMS — Cinematic AI Studio</title>

<style>

*{
  box-sizing:border-box;
}

html{
  scroll-behavior:smooth;
}

body{
  margin:0;
  background:#02040a;
  color:white;
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

body:before{
  content:"";
  position:fixed;
  inset:0;
  z-index:-1;
  background:
    radial-gradient(
      circle at 50% 0%,
      rgba(35,105,255,.25),
      transparent 38%
    ),
    radial-gradient(
      circle at 15% 50%,
      rgba(0,180,255,.08),
      transparent 30%
    ),
    linear-gradient(
      180deg,
      #02040a,
      #07111f 55%,
      #02040a
    );
}

nav{
  position:sticky;
  top:0;
  z-index:50;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:16px 6%;
  background:rgba(2,4,10,.75);
  backdrop-filter:blur(18px);
  border-bottom:1px solid rgba(255,255,255,.08);
}

.logo{
  font-size:24px;
  font-weight:950;
  letter-spacing:7px;
}

nav a{
  color:#c8d5e8;
  text-decoration:none;
  margin-left:18px;
}

.hero{
  min-height:88vh;
  display:grid;
  place-items:center;
  text-align:center;
  padding:70px 20px;
}

.hero-inner{
  max-width:900px;
}

.badge{
  display:inline-block;
  padding:8px 13px;
  border:1px solid rgba(100,170,255,.35);
  border-radius:999px;
  color:#8ec7ff;
  background:rgba(30,100,220,.08);
  font-size:12px;
  font-weight:800;
  letter-spacing:2px;
}

.hero h1{
  font-size:clamp(48px,9vw,100px);
  line-height:.92;
  letter-spacing:-5px;
  margin:24px 0;
}

.hero h1 span{
  background:
    linear-gradient(
      90deg,
      #ffffff,
      #6bb7ff,
      #a98cff,
      #ffffff
    );
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}

.hero p{
  max-width:700px;
  margin:0 auto 32px;
  color:#aab9cd;
  font-size:18px;
  line-height:1.7;
}

.buttons{
  display:flex;
  justify-content:center;
  gap:12px;
  flex-wrap:wrap;
}

.btn{
  border:0;
  border-radius:999px;
  padding:15px 24px;
  background:
    linear-gradient(
      135deg,
      #087cff,
      #6048ff
    );
  color:white;
  font-weight:850;
  cursor:pointer;
  text-decoration:none;
  box-shadow:
    0 12px 45px
    rgba(35,105,255,.25);
}

.btn.secondary{
  background:#0b1422;
  border:1px solid #263a55;
}

section{
  max-width:1100px;
  margin:auto;
  padding:70px 20px;
}

.grid{
  display:grid;
  grid-template-columns:
    repeat(
      auto-fit,
      minmax(280px,1fr)
    );
  gap:20px;
}

.card{
  background:
    rgba(8,15,27,.88);
  border:1px solid #1a2b43;
  border-radius:26px;
  padding:26px;
  box-shadow:
    0 25px 80px
    rgba(0,0,0,.3);
}

.card h2{
  margin-top:0;
}

.muted{
  color:#9eafc5;
  line-height:1.6;
}

input,
textarea{
  width:100%;
  padding:14px;
  margin:8px 0 14px;
  border-radius:13px;
  border:1px solid #263a55;
  background:#060d18;
  color:white;
  font-size:15px;
}

textarea{
  min-height:120px;
  resize:vertical;
}

.filebox{
  padding:20px;
  border:1px dashed #355477;
  border-radius:18px;
  text-align:center;
  margin-bottom:15px;
}

.status{
  min-height:24px;
  color:#8fc5ff;
}

.price{
  font-size:38px;
  font-weight:950;
  margin:15px 0;
}

.feature{
  padding:12px 0;
  border-bottom:1px solid rgba(255,255,255,.06);
}

.admin{
  border-color:#5a4719;
}

video{
  width:100%;
  max-height:600px;
  border-radius:18px;
  margin-top:15px;
}

.hidden{
  display:none !important;
}

footer{
  text-align:center;
  padding:50px 20px;
  color:#687991;
}

@media(max-width:650px){

  nav a{
    display:none;
  }

  .hero h1{
    letter-spacing:-3px;
  }

  section{
    padding:45px 14px;
  }

}

</style>

</head>

<body>

<nav>

<div class="logo">
EMMS
</div>

<div>

<a href="#studio">Studio</a>
<a href="#premium">Premium</a>
<a href="#admin">Admin</a>

</div>

</nav>


<!-- HERO -->

<div class="hero">

<div class="hero-inner">

<span class="badge">
EMMS CINEMATIC AI STUDIO
</span>

<h1>
Your Story.
<br>
<span>Your Cinema.</span>
</h1>

<p>
Turn your images and words into cinematic
stories. Create, edit, and share moments
with EMMS.
</p>

<div class="buttons">

<a
class="btn"
href="#studio"
>
Start Creating
</a>

<a
class="btn secondary"
href="#premium"
>
View Premium
</a>

</div>

</div>

</div>


<!-- STUDIO -->

<section id="studio">

<div class="grid">


<!-- VIDEO -->

<div class="card">

<h2>
🎬 Image + Text Video
</h2>

<p class="muted">
Upload images and add your story.
EMMS creates a cinematic video
in your browser.
</p>

<div class="filebox">

<input
id="images"
type="file"
accept="image/*"
multiple
>

</div>

<textarea
id="story"
placeholder="Write your cinematic story here..."
></textarea>

<button
class="btn"
style="width:100%"
onclick="createVideo()"
>

Create Cinematic Video

</button>

<p
id="videoStatus"
class="status"
></p>

<video
id="video"
controls
hidden
></video>

<button
id="share"
class="btn secondary hidden"
style="width:100%;margin-top:12px"
onclick="createViewOnce()"
>

Create View Once Link

</button>

<p
id="shareStatus"
class="status"
></p>

</div>


<!-- OUTFIT -->

<div class="card">

<h2>
👗 Outfit Editor
</h2>

<p class="muted">

Upload an image and describe the
new clothing you want.

</p>

<div class="filebox">

<input
id="outfitImage"
type="file"
accept="image/*"
>

</div>

<textarea
id="outfitPrompt"
placeholder="Example: Replace the outfit with an elegant black evening dress."
></textarea>

<button
class="btn"
style="width:100%"
onclick="editOutfit()"
>

Apply Outfit Command

</button>

<p
id="outfitStatus"
class="status"
></p>

</div>


</div>

</section>


<!-- PREMIUM -->

<section id="premium">

<div class="card">

<h2>
⭐ EMMS Premium
</h2>

<p class="muted">
Premium pricing is currently controlled
by the administrator.
Payment can be connected to Paystack
later.
</p>

<div class="grid">

<div class="card">

<h3>
Monthly
</h3>

<div
class="price"
id="monthly"
>
₦1,000
</div>

<div class="feature">
More video creation
</div>

<div class="feature">
Premium tools
</div>

<button
class="btn"
onclick="premiumMessage()"
>
Subscribe
</button>

</div>


<div class="card">

<h3>
Yearly
</h3>

<div
class="price"
id="yearly"
>
₦15,000
</div>

<div class="feature">
More video creation
</div>

<div class="feature">
Premium tools
</div>

<button
class="btn"
onclick="premiumMessage()"
>
Subscribe
</button>

</div>

</div>

<p
id="premiumStatus"
class="status"
></p>

</div>

</section>


<!-- ADMIN -->

<section id="admin">

<div class="card admin">

<h2>
👑 Admin Control
</h2>

<p class="muted">
Admin controls for your EMMS project.
</p>

<label>
Monthly Price (₦)
</label>

<input
id="adminMonthly"
type="number"
value="1000"
>

<label>
Yearly Price (₦)
</label>

<input
id="adminYearly"
type="number"
value="15000"
>

<button
class="btn"
onclick="savePrices()"
>

Save Prices

</button>

<p
id="adminStatus"
class="status"
></p>

</div>

</section>


<footer>

EMMS © 2026
<br>
Turn Your Moments Into Stories.

</footer>


<script>

/* =========================
   VIDEO CREATOR
========================= */

let generatedVideo = null;


async function createVideo(){

const files =
[
  ...document
    .getElementById("images")
    .files
];

const text =
document
  .getElementById("story")
  .value
  .trim();

const status =
document
  .getElementById("videoStatus");


if(!files.length){

status.textContent =
"Please choose at least one image.";

return;

}

if(!text){

status.textContent =
"Please enter your story.";

return;

}


status.textContent =
"Creating your cinematic video...";


try{

const images =
await Promise.all(
files.map(
file =>
createImageBitmap(file)
)
);


const width = 1280;
const height = 720;

const canvas =
document.createElement("canvas");

canvas.width = width;
canvas.height = height;

const ctx =
canvas.getContext("2d");

const stream =
canvas.captureStream(30);


const formats = [

"video/webm;codecs=vp9",

"video/webm;codecs=vp8",

"video/webm"

];


const mime =
formats.find(
x =>
MediaRecorder
.isTypeSupported(x)
);


if(!mime){

throw Error(
"Your browser cannot create this video format."
);

}


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


generatedVideo =
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

const duration = 20;


function draw(now){

const seconds =
(now - start) / 1000;


ctx.fillStyle =
"#05070c";

ctx.fillRect(
0,
0,
width,
height
);


const index =
Math.min(

images.length - 1,

Math.floor(
seconds /
(duration / images.length)
)

);


const image =
images[index];


const scale =
Math.max(
width / image.width,
height / image.height
);


const imageWidth =
image.width * scale;

const imageHeight =
image.height * scale;


const zoom =
1.02 +
(
(seconds % 4) / 4
) * .04;


ctx.save();

ctx.translate(
width / 2,
height / 2
);

ctx.scale(
zoom,
zoom
);

ctx.drawImage(

image,

-imageWidth / 2,

-imageHeight / 2,

imageWidth,

imageHeight

);

ctx.restore();


/* cinematic dark overlay */

ctx.fillStyle =
"rgba(0,0,0,.35)";

ctx.fillRect(
0,
0,
width,
height
);


/* cinematic text */

ctx.textAlign =
"center";

ctx.textBaseline =
"middle";

ctx.font =
"bold 46px Georgia, serif";

ctx.fillStyle =
"white";

ctx.shadowColor =
"black";

ctx.shadowBlur =
12;


const words =
text.split(/\s+/);

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
ctx.measureText(test).width >
width * .8 &&
line
){

lines.push(line);

line = word;

}else{

line = test;

}

}


if(line){

lines.push(line);

}


const lineHeight = 58;

const startY =
height / 2 -
(
lines.length *
lineHeight
) / 2;


lines
.slice(0,7)
.forEach(
(line,index) => {

ctx.fillText(

line,

width / 2,

startY +
index * lineHeight

);

}
);


if(
seconds < duration
){

requestAnimationFrame(draw);

}else{

recorder.stop();

}

}


requestAnimationFrame(draw);

}
);


const video =
document.getElementById("video");

video.src =
URL.createObjectURL(
generatedVideo
);

video.hidden = false;


document
  .getElementById("share")
  .classList
  .remove("hidden");


status.textContent =
"Your cinematic video is ready.";

}catch(error){

status.textContent =
error.message;

}

}


/* =========================
   VIEW ONCE
========================= */

async function createViewOnce(){

if(!generatedVideo){

return;

}


const status =
document
  .getElementById("shareStatus");


status.textContent =
"Uploading...";


try{

const form =
new FormData();

form.append(
"media",
generatedVideo,
"emms-video.webm"
);


const response =
await fetch(
"/api/upload",
{
method:"POST",
body:form
}
);


const data =
await response.json();


if(!response.ok){

throw Error(
data.error ||
"Upload failed."
);

}


await navigator.clipboard
  ?.writeText(data.url);


status.innerHTML =
`<a
href="${data.url}"
target="_blank"
style="color:#8fc5ff"
>
View Once Link
</a>`;

}catch(error){

status.textContent =
error.message;

}

}


/* =========================
   OUTFIT COMMAND
========================= */

function editOutfit(){

const image =
document
  .getElementById("outfitImage")
  .files[0];

const prompt =
document
  .getElementById("outfitPrompt")
  .value
  .trim();


const status =
document
  .getElementById("outfitStatus");


if(!image){

status.textContent =
"Choose an image first.";

return;

}


if(!prompt){

status.textContent =
"Describe the outfit.";

return;

}


/*
  This is the interface for the
  future AI image-editing API.

  A real AI provider must be
  connected before this can
  actually change clothing.
*/

status.textContent =
"Outfit command received. Connect an AI image API to generate the edited image.";

}


/* =========================
   PREMIUM
========================= */

function premiumMessage(){

document
  .getElementById("premiumStatus")
  .textContent =
"Premium payment will be connected later. Current prices: ₦1,000 monthly and ₦15,000 yearly.";

}


/* =========================
   ADMIN PRICE CONTROL
========================= */

async function savePrices(){

const monthly =
Number(
document
  .getElementById("adminMonthly")
  .value
);

const yearly =
Number(
document
  .getElementById("adminYearly")
  .value
);


if(
!Number.isInteger(monthly) ||
monthly < 0 ||
!Number.isInteger(yearly) ||
yearly < 0
){

document
  .getElementById("adminStatus")
  .textContent =
"Enter valid prices.";

return;

}


try{

const response =
await fetch(
"/api/admin/prices",
{

method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({
monthly,
yearly
})

}
);


const data =
await response.json();


if(!response.ok){

throw Error(
data.error ||
"Could not save prices."
);

}


document
  .getElementById("monthly")
  .textContent =
"₦" +
monthly.toLocaleString();

document
  .getElementById("yearly")
  .textContent =
"₦" +
yearly.toLocaleString();


document
  .getElementById("adminStatus")
  .textContent =
"Prices updated.";

}catch(error){

document
  .getElementById("adminStatus")
  .textContent =
error.message;

}

}

</script>

</body>
</html>`);
});


/* =========================
   VIEW ONCE UPLOAD API
========================= */

app.post(
  "/api/upload",
  upload.single("media"),
  (req, res) => {

    if(!req.file){

      return res.status(400).json({
        error:"No media uploaded."
      });

    }

    const id =
      crypto
        .randomBytes(18)
        .toString("hex");

    media.set(
      id,
      {
        file:req.file.filename
      }
    );

    res.json({
      url:
        `${req.protocol}://${req.get("host")}/view/${id}`
    });

  }
);


/* =========================
   VIEW ONCE PAGE
========================= */

app.get(
  "/view/:id",
  (req, res) => {

    const id =
      encodeURIComponent(
        req.params.id
      );

    res.send(`<!doctype html>

<html>

<head>

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>EMMS View Once</title>

<style>

body{
  margin:0;
  padding:30px;
  text-align:center;
  background:#02040a;
  color:white;
  font-family:system-ui;
}

video{
  max-width:100%;
  border-radius:18px;
}

</style>

</head>

<body>

<h1>EMMS</h1>

<p id="status">
Opening...
</p>

<video
  id="video"
  controls
  autoplay
  playsinline
  hidden
></video>

<script>

fetch(
  "/api/media/${id}"
)

.then(
  async response => {

    if(!response.ok){

      const data =
        await response.json();

      throw Error(
        data.error
      );

    }

    return response.blob();

  }
)

.then(
  blob => {

    video.src =
      URL.createObjectURL(blob);

    video.hidden =
      false;

    status.textContent =
      "This media can only be opened once.";

  }
)

.catch(
  error => {

    status.textContent =
      error.message;

  }
);

</script>

</body>

</html>`);

  }
);


/* =========================
   VIEW ONCE MEDIA API
========================= */

app.get(
  "/api/media/:id",
  (req, res) => {

    const item =
      media.get(
        req.params.id
      );

    if(!item){

      return res.status(404).json({

        error:
          "This View Once media is no longer available."

      });

    }


    media.delete(
      req.params.id
    );


    const filename =
      path.basename(
        item.file
      );

    const file =
      path.join(
        uploads,
        filename
      );


    res.sendFile(
      file,
      error => {

        fs.rm(
          file,
          {
            force:true
          },
          () => {}
        );

        if(
          error &&
          !res.headersSent
        ){

          res.status(404).json({
            error:
              "Media unavailable."
          });

        }

      }
    );

  }
);


/* =========================
   PUBLIC PRICES
========================= */

app.get(
  "/api/prices",
  (req, res) => {

    res.json({

      currency:"NGN",

      monthly:
        prices.monthly,

      yearly:
        prices.yearly

    });

  }
);


/* =========================
   ADMIN PRICE API
========================= */

app.post(
  "/api/admin/prices",
  (req, res) => {

    /*
      Temporary admin protection.

      Before going live, replace this
      with proper authentication.
    */

    const adminKey =
      req.headers["x-admin-key"];

    if(
      process.env.ADMIN_KEY &&
      adminKey !==
        process.env.ADMIN_KEY
    ){

      return res.status(403).json({

        error:
          "Admin access denied."

      });

    }


    const monthly =
      Number(
        req.body.monthly
      );

    const yearly =
      Number(
        req.body.yearly
      );


    if(
      !Number.isInteger(monthly) ||
      monthly < 0 ||
      !Number.isInteger(yearly) ||
      yearly < 0
    ){

      return res.status(400).json({

        error:
          "Invalid prices."

      });

    }


    prices.monthly =
      monthly;

    prices.yearly =
      yearly;


    res.json({

      ok:true,

      prices

    });

  }
);


/* =========================
   HEALTH CHECK
========================= */

app.get(
  "/health",
  (req, res) => {

    res.json({
      ok:true,
      service:"EMMS"
    });

  }
);


/* =========================
   SERVER
========================= */

app.listen(
  PORT,
  () => {

    console.log(
      `EMMS running on port ${PORT}`
    );

  }
);
