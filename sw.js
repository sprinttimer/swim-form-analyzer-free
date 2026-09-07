const CACHE_NAME = 'swim-form-analyzer-pro-v1.6.2';
const CACHE_PREFIX = 'swim-form-analyzer-pro-';
const LOCAL_VIDEO_CACHE = 'swim-form-analyzer-local-video-v1';
const LOCAL_PATH = '/__swim_local_video__/';
const ROOT_URL = new URL('./', self.registration.scope).href;
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL.map(u => new Request(u,{cache:'reload'}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== LOCAL_VIDEO_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function reply(event,data){
  try{event.ports?.[0]?.postMessage(data);}catch(_){}
}
function virtualRequestUrl(token){
  return new URL(`__swim_local_video__/${encodeURIComponent(token)}`,self.registration.scope).href;
}

self.addEventListener('message', event => {
  const d=event.data||{};
  if(d.type==='SKIP_WAITING'){
    self.skipWaiting();reply(event,{ok:true});return;
  }
  if(d.type==='LOCAL_VIDEO_CAPABILITIES'){
    reply(event,{ok:true,localVideoRange:true,version:'1.6.2'});return;
  }
  if(d.type==='REGISTER_LOCAL_VIDEO'){
    event.waitUntil((async()=>{
      try{
        if(!d.token||!(d.blob instanceof Blob)||!d.blob.size)throw new Error('動画Blobがありません。');
        const mime=(d.mime||d.blob.type||'application/octet-stream').toLowerCase();
        const headers=new Headers({
          'Content-Type':mime,
          'Content-Length':String(d.blob.size),
          'Accept-Ranges':'bytes',
          'Cache-Control':'no-store',
          'X-Swim-Local-Video':'1',
          'X-Swim-Video-Name':encodeURIComponent(d.name||'video')
        });
        const cache=await caches.open(LOCAL_VIDEO_CACHE);
        await cache.put(virtualRequestUrl(d.token),new Response(d.blob,{status:200,headers}));
        reply(event,{ok:true,token:d.token,size:d.blob.size,mime});
      }catch(e){reply(event,{ok:false,error:e?.message||String(e)});}
    })());
    return;
  }
  if(d.type==='UNREGISTER_LOCAL_VIDEO'){
    event.waitUntil((async()=>{
      try{const cache=await caches.open(LOCAL_VIDEO_CACHE);await cache.delete(virtualRequestUrl(d.token));reply(event,{ok:true});}
      catch(e){reply(event,{ok:false,error:e?.message||String(e)});}
    })());
  }
});

function parseRange(header,total){
  if(!header)return null;
  const m=/^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if(!m)return {invalid:true};
  let start=m[1]?Number(m[1]):NaN,end=m[2]?Number(m[2]):NaN;
  if(!Number.isFinite(start)){
    const suffix=end;
    if(!Number.isFinite(suffix)||suffix<=0)return {invalid:true};
    start=Math.max(0,total-suffix);end=total-1;
  }else{
    if(!Number.isFinite(end))end=total-1;
  }
  start=Math.max(0,Math.floor(start));end=Math.min(total-1,Math.floor(end));
  if(start>end||start>=total)return {invalid:true};
  return {start,end};
}

async function serveLocalVideo(request,url){
  const cache=await caches.open(LOCAL_VIDEO_CACHE);
  // Cache keys ignore query strings by design here; token path is unique.
  const key=url.origin+url.pathname;
  const stored=await cache.match(key);
  if(!stored)return new Response('Local video expired',{status:404,headers:{'Cache-Control':'no-store'}});
  const blob=await stored.blob();
  const mime=stored.headers.get('Content-Type')||blob.type||'application/octet-stream';
  const total=blob.size;
  const base={
    'Content-Type':mime,
    'Accept-Ranges':'bytes',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'X-Swim-Local-Video':'1'
  };
  if(request.method==='HEAD')return new Response(null,{status:200,headers:{...base,'Content-Length':String(total)}});
  const range=parseRange(request.headers.get('Range'),total);
  if(range?.invalid)return new Response(null,{status:416,headers:{...base,'Content-Range':`bytes */${total}`}});
  if(range){
    const part=blob.slice(range.start,range.end+1,mime);
    return new Response(part,{status:206,headers:{...base,'Content-Length':String(part.size),'Content-Range':`bytes ${range.start}-${range.end}/${total}`}});
  }
  return new Response(blob,{status:200,headers:{...base,'Content-Length':String(total)}});
}

self.addEventListener('fetch', event => {
  const request=event.request;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(url.pathname.includes(LOCAL_PATH) && (request.method==='GET'||request.method==='HEAD')){
    event.respondWith(serveLocalVideo(request,url));
    return;
  }
  if(request.method!=='GET')return;

  const isAppDocument=request.mode==='navigate'||/\/index\.html$/.test(url.pathname);
  if(isAppDocument){
    event.respondWith(
      fetch(request,{cache:'no-store'})
        .then(response=>{
          if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(INDEX_URL,copy)).catch(()=>{});}
          return response;
        })
        .catch(()=>caches.match(INDEX_URL).then(cached=>cached||caches.match(ROOT_URL)))
    );
    return;
  }

  event.respondWith(
    fetch(request).then(response=>{
      if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)).catch(()=>{});}
      return response;
    }).catch(()=>caches.match(request))
  );
});
