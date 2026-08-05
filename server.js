const express=require("express"),multer=require("multer"),crypto=require("crypto"),path=require("path"),fs=require("fs");
const app=express(),PORT=process.env.PORT||3000,dir=path.join(__dirname,"uploads");
fs.mkdirSync(dir,{recursive:true});
const upload=multer({dest:dir,limits:{fileSize:50*1024*1024}});
const items=new Map();

const home=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Emms</title>
<style>body{font-family:system-ui;background:#101318;color:white;display:grid;place-items:center;min-height:100vh}.box{background:#1b2028;padding:28px;border-radius:18px;width:min(90%,500px)}button,input{width:100%;padding:13px;margin-top:12px;border-radius:10px;border:0}button{font-weight:700}</style>
<div class=box><h1>Emms</h1><p>Convert an image to a View Once video.</p><input id=f type=file accept="image/*"><button onclick=go()>Create View Once Link</button><p id=s></p><input id=l readonly hidden><button id=c hidden onclick="navigator.clipboard.writeText(l.value);c.textContent='Copied!'">Copy Link</button></div>
<script>
async function go(){if(!f.files[0])return s.textContent='Choose an image first.';s.textContent='Converting…';
const b=await createImageBitmap(f.files[0]),x=document.createElement('canvas'),m=Math.min(1,1280/b.width);x.width=b.width*m;x.height=b.height*m;x.getContext('2d').drawImage(b,0,0,x.width,x.height);
const r=new MediaRecorder(x.captureStream(30),{mimeType:'video/webm'}),a=[];r.ondataavailable=e=>e.data.size&&a.push(e.data);
const v=await new Promise(z=>{r.onstop=()=>z(new Blob(a,{type:'video/webm'}));r.start();setTimeout(()=>r.stop(),5000)});
const q=new FormData;q.append('media',v,'emms.webm');s.textContent='Uploading…';const res=await fetch('/api/upload',{method:'POST',body:q}),d=await res.json();if(!res.ok)throw Error(d.error);
l.value=d.url;l.hidden=false;c.hidden=false;s.textContent='Done. Send the link.'}
</script>`;

app.get("/",(_,res)=>res.send(home));
app.post("/api/upload",upload.single("media"),(req,res)=>{
 if(!req.file)return res.status(400).json({error:"No media uploaded"});
 const id=crypto.randomBytes(18).toString("hex");items.set(id,{file:req.file.filename,viewed:false});
 res.json({url:`${req.protocol}://${req.get("host")}/view/${id}`});
});
app.get("/view/:id",(req,res)=>res.send(`<!doctype html><meta name="viewport" content="width=device-width"><title>Emms View Once</title><style>body{font-family:system-ui;background:#101318;color:white;text-align:center;padding:30px}video{max-width:100%;border-radius:12px}</style><h1>View Once</h1><p id=s>Opening…</p><video id=v controls autoplay playsinline hidden></video><script>
fetch('/api/media/${encodeURIComponent(req.params.id)}').then(async r=>{if(!r.ok)throw Error((await r.json()).error);return r.blob()}).then(b=>{v.src=URL.createObjectURL(b);v.hidden=false;s.textContent='This media can only be opened once.'}).catch(e=>s.textContent=e.message)</script>`));
app.get("/api/media/:id",(req,res)=>{const x=items.get(req.params.id);if(!x)return res.status(404).json({error:"This View Once media is no longer available."});items.delete(req.params.id);const p=path.join(dir,x.file);res.sendFile(p,e=>fs.rm(p,{force:true},()=>{}));});
app.listen(PORT,()=>console.log("Emms running on port "+PORT));