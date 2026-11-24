(function(root){
  'use strict';
  function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
  function changes(before,next){const result=[];for(const kind of ['entries','transfers']){const old=new Map((before[kind]||[]).map(x=>[x.id,x])),fresh=new Map((next[kind]||[]).map(x=>[x.id,x]));if(fresh.size!==(next[kind]||[]).length)throw Error('存在重复记录编号，无法保存。');for(const id of new Set([...old.keys(),...fresh.keys()])){const a=old.get(id)||null,b=fresh.get(id)||null;if(stable(a)!==stable(b))result.push({kind,id,before:a,after:b});}}return result;}
  const api={stable,changes};if(typeof module==='object'&&module.exports)module.exports=api;else root.CloudCore=api;
})(typeof globalThis==='object'?globalThis:this);
