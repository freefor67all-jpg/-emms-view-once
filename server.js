const express=require("express"),multer=require("multer"),crypto=require("crypto"),path=require("path"),fs=require("fs");

const app=express(),PORT=process.env.PORT||3000,dir=path.join(__dirname,"uploads");
fs.mkdirSync(dir,{recursive:true});

const upload=multer({dest:dir,limits:{fileSize:50*1024*1024}});
const items=new Map();

const const home=`<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EMMS — Turn Your Moments Into Stories</title>

<style>
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  background:#030711;
  color:white
}
.hero{
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  text-align:center;
  padding:30px 20px;
  background:
    radial-gradient(circle at 50% 35%,rgba(0,110,255,.28),transparent 35%),
    linear-gradient(180deg,#020814,#06152b 55%,#030711)
}
.hero-content{max-width:800px}
.logo{
  font-size:clamp(48px,14vw,100px);
  font-weight:900;
  letter-spacing:12px;
  margin:0;
  text-shadow:0 0 35px rgba(0,140,255,.65)
}
.tagline{
  font-size:clamp(28px,6vw,55px);
  margin:15px 0;
  line-height:1.05
}
.description{
  color:#b8c9df;
  font-size:18px;
  line-height:1.6;
  max-width:600px;
  margin:20px auto 30px
}
.btn{
  display:inline-block;
  padding:16px 30px;
  border-radius:999px;
  border:1px solid rgba(80,170,255,.5);
  background:linear-gradient(135deg,#087cff,#0048a8);
  color:white;
  font-weight:800;
  text-decoration:none;
  box-shadow:0 10px 35px rgba(0,90,255,.3);
  cursor:pointer
}
.section{
  padding:70px 20px;
  max-width:850px;
  margin:auto
}
.card{
  background:rgba(10,22,42,.88);
  border:1px solid rgba(80,160,255,.2);
  border-radius:24px;
  padding:28px;
  box-shadow:0 20px 60px rgba(0,0,0,.35)
}
h2{font-size:32px;margin-top:0}
input,textarea,button{
  width:100%;
  padding:15px;
  margin-top:14px;
  border-radius:12px;
  border:1px solid #263b58;
  font-size:16px
}
input,textarea{
  background:#07101e;
  color:white
}
textarea{
  font-family:"Times New Roman",serif;
  resize:vertical
}
button{
  background:linear-gradient(135deg,#087cff,#0048a8);
  color:white;
  border:0;
  font-weight:800
}
.status{color:#9fcaff}
.premium{
  margin-top:25px;
  padding:25px;
  border-radius:20px;
  background:linear-gradient(135deg,rgba(0,91,255,.18),rgba(0,20,50,.8));
  border:1px solid rgba(70,150,255,.25)
}
footer{
  text-align:center;
  padding:35px;
  color:#71839a
}
</style>

<section class="hero">
  <div class="hero-content">
    <h1 class="logo">EMMS</h1>
    <div class="tagline">Turn Your Moments Into Stories.</div>
    <p class="description">
      Create cinematic 20-second videos from your images and your own words.
    </p>
    <a class="btn" href="#create">Create Your Video</a>
  </div>
</section>

<section class="section" id="create">
  <div class="card">
    <h2>Create Your Video</h2>
    <p>Choose an image and write the message you want to appear on it.</p>

    <input id="f" type="file" accept="image/*">

    <textarea id="t" rows="4" maxlength="300"
      placeholder="Enter your text here..."></textarea>

    <button onclick="go()">Create 20-Second Video</button>

    <p id="s" class="status"></p>

    <input id="l" readonly hidden>

    <button id="c" hidden
      onclick="navigator.clipboard.writeText(l.value);c.textContent='Copied!'">
      Copy Link
    </button>
  </div>

  <div class="premium">
    <h2>⭐ EMMS Premium</h2>
    <p>
      Unlock more ways to share and create with EMMS Premium.
    </p>
    <p>
      Premium features will be available through your secure account.
    </p>
  </div>
</section>

<footer>
  EMMS © 2026 — Turn Your Moments Into Stories.
</footer>

<script>
async function go(){
  if(!f.files[0])
    return s.textContent='Choose an image first.';

  const text=t.value.trim();

  if(!text)
    return s.textContent='Enter your text first.';

  s.textContent='Preparing your cinematic video…';

  try{
    const b=await createImageBitmap(f.files[0]);
    const x=document.createElement('canvas');
    const m=Math.min(1,1280/b.width);

    x.width=b.width*m;
    x.height=b.height*m;

    const ctx=x.getContext('2d');

    const stream=x.captureStream(30);
    const mimeTypes=[
      'video/mp4',
      'video/webm;codecs=vp8',
      'video/webm'
    ];

    const mimeType=mimeTypes.find(type =>
      MediaRecorder.isTypeSupported(type)
    );

    if(!mimeType)
      throw Error('This browser cannot create the video format.');

    const r=new MediaRecorder(stream,{mimeType});
    const a=[];

    r.ondataavailable=e=>{
      if(e.data.size)a.push(e.data);
    };

    const v=await new Promise(resolve=>{
      r.onstop=()=>resolve(
        new Blob(a,{type:mimeType})
      );

      r.start();

      const start=performance.now();

      function draw(now){
        const elapsed=now-start;
        const seconds=elapsed/1000;

        ctx.clearRect(0,0,x.width,x.height);
        ctx.drawImage(b,0,0,x.width,x.height);

        const fade=Math.min(1,seconds/2);

        ctx.save();
        ctx.globalAlpha=fade;
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.font='bold 48px "Times New Roman",serif';

        const maxWidth=x.width*.82;
        const words=text.split(' ');
        const lines=[];
        let line='';

        for(const word of words){
          const test=line?line+' '+word:word;

          if(ctx.measureText(test).width>maxWidth&&line){
            lines.push(line);
            line=word;
          }else{
            line=test;
          }
        }

        if(line)lines.push(line);

        const lineHeight=60;
        const totalHeight=lines.length*lineHeight;
        const startY=(x.height-totalHeight)/2+lineHeight/2;

        ctx.shadowColor='rgba(0,0,0,.9)';
        ctx.shadowBlur=8;
        ctx.shadowOffsetX=2;
        ctx.shadowOffsetY=2;
        ctx.fillStyle='white';

        lines.forEach((line,i)=>{
          ctx.fillText(
            line,
            x.width/2,
            startY+i*lineHeight
          );
        });

        ctx.restore();

        if(seconds<20){
          requestAnimationFrame(draw);
        }else{
          r.stop();
        }
      }

      requestAnimationFrame(draw);
    });

    s.textContent='Uploading…';

    const q=new FormData();
    q.append('media',v,'emms-video');

    const res=await fetch('/api/upload',{
      method:'POST',
      body:q
    });

    const d=await res.json();

    if(!res.ok)throw Error(d.error);

    l.value=d.url;
    l.hidden=false;
    c.hidden=false;

    s.textContent='Done. Send the link.';

  }catch(e){
    s.textContent=e.message||'Something went wrong.';
  }
}
</script>`;`;

app.get("/",(_,res)=>res.send(home));

app.post("/api/upload",upload.single("media"),(req,res)=>{
if(!req.file)return res.status(400).json({error:"No media uploaded"});

const id=crypto.randomBytes(18).toString("hex");

items.set(id,{
file:req.file.filename,
viewed:false
});

res.json({
url:`${req.protocol}://${req.get("host")}/view/${id}`
});
});

app.get("/view/:id",(req,res)=>res.send(`<!doctype html>
<meta name="viewport" content="width=device-width">
<title>Emms View Once</title>
<style>
body{
font-family:system-ui;
background:#101318;
color:white;
text-align:center;
padding:30px
}
video{
max-width:100%;
border-radius:12px
}
</style>
<h1>View Once</h1>
<p id=s>Opening…</p>
<video id=v controls autoplay playsinline hidden></video>
<script>
fetch('/api/media/${encodeURIComponent(req.params.id)}')
.then(async r=>{
if(!r.ok)throw Error((await r.json()).error);
return r.blob();
})
.then(b=>{
v.src=URL.createObjectURL(b);
v.hidden=false;
s.textContent='This media can only be opened once.';
})
.catch(e=>s.textContent=e.message);
</script>`

app.get("/api/media/:id",(req,res)=>{
const x=items.get(req.params.id);

if(!x){
return res.status(404).json({
error:"This View Once media is no longer available."
});
}

items.delete(req.params.id);

const p=path.join(dir,x.file);

res.sendFile(p,e=>fs.rm(p,{force:true},()=>{}));
});

app.listen(PORT,()=>console.log("Emms running on port "+PORT));
