(function(){
  'use strict';
  const config=window.SHOP_CLOUD||{};
  const local=['localhost','127.0.0.1'].includes(location.hostname);
  const enabled=!local||new URLSearchParams(location.search).has('cloud');
  const keyName='roccopet-private-sharing-key-v1';
  const initialKey=new URLSearchParams(location.hash.slice(1)).get('book');
  let accessKey='',base={entries:[],transfers:[]},busy=false,ready=false,bridge=null;
  const q=s=>document.querySelector(s);
  function status(text,error=false){const el=q('#cloud-status');if(el){el.textContent=text;el.classList.toggle('danger',error);}}
  function shareUrl(){return location.origin+location.pathname+'#book='+encodeURIComponent(accessKey);}
  async function rpc(name,args){
    if(!config.publicKey)throw Error('共享数据库尚在配置，请稍后再打开。');
    let res;
    for(let attempt=0;attempt<3;attempt++){
      try{res=await fetch(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.publicKey,'Content-Type':'application/json'},body:JSON.stringify({p_key:accessKey,...args}),signal:AbortSignal.timeout(15000)});if([502,503,504].includes(res.status))throw Error('网络暂时无法连接');break;}
      catch(error){if(attempt===2)throw Error('云端连接暂时中断，本次未确认保存。请刷新核对后重试。');}
    }
    let data;try{data=await res.json();}catch{throw Error('云端暂时无法连接，请重试。');}
    if(!res.ok)throw Error(data.message||'云端保存失败，请重试。');return data;
  }
  function validate(data){if(!data||!Array.isArray(data.entries)||!Array.isArray(data.transfers))throw Error('云端返回的数据不完整。');return data;}
  function adopt(data){validate(data);if(!ready||CloudCore.stable(data)!==CloudCore.stable(base)){base=structuredClone(data);bridge.replace(structuredClone(base));}ready=true;status('已同步 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));}
  async function refresh(){if(busy||!accessKey)return;busy=true;status('正在同步…');try{adopt(await rpc('shop_load',{}));q('#cloud-gate').close();return true;}catch(e){status(e.message,true);q('#cloud-error').textContent=e.message;return false;}finally{busy=false;}}
  async function save(next){
    if(!ready||busy){status('正在同步，请稍后再保存。',true);return false;}
    busy=true;q('main').inert=true;status('正在保存到云端…');
    try{const patch=CloudCore.changes(base,next);if(patch.length)adopt(await rpc('shop_commit',{p_changes:patch}));else status('已同步');return true;}
    catch(e){status(e.message,true);bridge.notify(e.message);return false;}finally{busy=false;q('main').inert=false;}
  }
  async function imageWrite(items){
    if(!ready)throw Error('请先连接共享账本。');
    for(const item of items){const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(item.file);});await rpc('shop_image_put',{p_id:item.id,p_mime:item.type||item.file.type,p_content:content});}
    // Removed screenshots are detached from records; bytes are retained for recovery.
  }
  async function imageGet(id){if(!ready)throw Error('共享账本尚未连接。');const data=await rpc('shop_image_get',{p_id:id});if(!data)return null;const bytes=Uint8Array.from(atob(data.content),c=>c.charCodeAt(0));return new Blob([bytes],{type:data.mime});}
  async function copyLink(){if(!ready)return;try{await navigator.clipboard.writeText(shareUrl());bridge.notify('共享链接已复制，发给朋友即可一起记账。');}catch{const input=q('#cloud-share-link');input.hidden=false;input.value=shareUrl();input.focus();input.select();bridge.notify('请复制选中的完整共享链接。');}}
  async function start(api){
    if(!enabled)return;bridge=api;
    q('.shop small').textContent='两人共享 · 云端账本';q('.sidebar-bottom p').textContent='同一链接，共用一本账';q('#reset').hidden=true;
    q('.demo-note span:last-child').textContent='共享账本：保存后同步到另一台设备。专属链接是进入凭证，请只发给合伙人。';
    q('#entry-dialog .dialog-footer .muted').textContent='保存到共享账本';
    q('#attachment-help').textContent='支持 JPG、PNG、WebP，每张最多 10 MB，最多 5 张。保存后截图同步到共享账本，两个人都能查看；不随 CSV 导出。';
    q('footer span:last-child').textContent='ROCCOPET · 共享账本';
    q('#cloud-bar').hidden=false;
    const incoming=initialKey;
    try{accessKey=incoming||localStorage.getItem(keyName)||'';}catch{accessKey=incoming||'';}
    // Strip the key from the address after remembering it; navigation uses ordinary view hashes.
    if(incoming){try{localStorage.setItem(keyName,incoming);}catch{}history.replaceState(null,'',location.pathname+location.search+'#overview');}
    q('#cloud-gate').addEventListener('cancel',e=>e.preventDefault());q('#cloud-gate').showModal();
    q('#cloud-retry').onclick=()=>refresh();q('#cloud-refresh').onclick=()=>refresh();q('#cloud-share').onclick=copyLink;
    q('#cloud-error').textContent=accessKey?'正在连接你们的共享账本…':'请使用完整的专属共享链接打开，或让合伙人点击「复制共享链接」发给你。';
    if(accessKey)await refresh();else status('等待共享链接');
    setInterval(()=>{if(ready&&!busy&&!document.querySelector('dialog[open]')&&!document.hidden&&!CloudCore.changes(base,bridge.current()).length)refresh();},6000);
    window.addEventListener('online',()=>refresh());
  }
  window.CloudLedger={enabled,save,start,refresh,imageWrite,imageGet,get ready(){return ready;}};
})();
