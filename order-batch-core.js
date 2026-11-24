(function(root){
 'use strict';
 const C=typeof module==='object'&&module.exports?require('./order-import-core.js'):root.OrderImportCore;
 const copy=v=>JSON.parse(JSON.stringify(v)),same=(a,b)=>C.stable(a)===C.stable(b),norm=v=>String(v||'').normalize('NFKC').replace(/[\s,，。.;；、\-—()（）]/g,'').toLowerCase();
 const rank=s=>({'待发货':0,'已购买未发货':0,'已发货':1,'已签收':2,'待退回':3,'已退回退款':4})[s]??-1;
 const phone=v=>/^\+?\d{7,15}$/.test(norm(v))?norm(v):'';
 function variantSize(v){return norm(v).match(/^(\d?xl|xxxl|xxl|xl|xs|s|m|l|均码)(?![a-z])/i)?.[1]||norm(v);}
 function fit(p,s){
  if(p.qty!==s.qty)return false;
  if(p.size&&s.size&&variantSize(p.size)!==variantSize(s.size))return false;
  const a=norm(p.color),b=norm(s.color);if(a&&b&&!(a.includes(b)||b.includes(a)))return false;
  return true;
 }
 function visibleNameMatches(a,b){
  a=norm(a);b=norm(b);if(!a||!b)return false;
  const pattern=(masked,full)=>{const chunks=masked.split(/[*＊•●]+/);if(chunks.length===1)return masked.length===1?full.startsWith(masked):masked===full;const start=chunks[0],end=chunks[chunks.length-1];return (start.length+end.length)>0&&full.startsWith(start)&&full.endsWith(end);};
  return /[*＊•●]/.test(a)?pattern(a,b):/[*＊•●]/.test(b)?pattern(b,a):a===b||a.length===1&&b.startsWith(a)||b.length===1&&a.startsWith(b);
 }
 function regionMatches(full,masked){
  const clean=String(masked||'').normalize('NFKC').split(/[*＊•●]/)[0].trim(),prefix=norm(clean);
  if(!/[*＊•●]/.test(masked)||prefix.length<6)return false;
  const regions=clean.match(/省|市|区|县|自治区|自治州/g)||[];
  return regions.length>=2&&norm(full).startsWith(prefix);
 }
 function matchReason(p,s){
  if(s.cancelled)return '';
  if(p.downstreamOrder&&p.downstreamOrder===s.order&&fit(p,s))return '下游订单号一致';
  if(p.shippingTracking&&norm(p.shippingTracking)===norm(s.shippingTracking)&&fit(p,s))return '快递单号及规格数量一致';
  const days=Math.abs(Date.parse(p.date)-Date.parse(s.date))/86400000;if(!Number.isFinite(days)||days>21||!fit(p,s))return '';
  const pp=phone(p.receiverPhone||p.customerPhone),sp=phone(s.customerPhone),pa=norm(p.receiverAddress||p.customerAddress),sa=norm(s.customerAddress),pn=norm(p.receiverName||p.customerName),sn=norm(s.customerName);
  if(pp&&pp===sp&&pa.length>=10&&pa===sa)return '电话、地址、规格数量一致';
  if(pn&&pn===sn&&!/[*＊]/.test(pn)&&pa.length>=10&&pa===sa)return '收件人、地址、规格数量一致';
  const purchaseDate=Date.parse(p.date),saleDate=Date.parse(s.date);
  if(purchaseDate>=saleDate&&days<=7&&p.size&&s.size&&p.color&&s.color&&visibleNameMatches(pn,sn)&&(regionMatches(p.receiverAddress||p.customerAddress,s.customerAddress)||regionMatches(s.customerAddress,p.receiverAddress||p.customerAddress)))return '收件人可见信息、收货地区、尺码颜色数量及日期一致（唯一对应）';
  return '';
 }
 function unwrap(entry){
  if(entry.orderSources)return Object.entries(entry.orderSources).map(([platform,value])=>({platform,entry:copy(value),rootId:entry.id}));
  if(entry.importData?.key)return [{platform:entry.platform||(entry.importData.kind==='销售'?'小红书':'1688'),entry:copy(entry),rootId:entry.id}];
  return [];
 }
 function derived(s,p){
  if(!s)return {...copy(p),procurementDate:p.date,procurementOrder:p.order};
  if(!p)return {...copy(s),fulfillment:s.fulfillment||'按单采购',procurementOrder:'',procurementDate:'',procurementStatus:'',cost:s.cost??null,fees:s.fees??0};
  let status=s.status;if(rank(status)<3&&rank(p.status)<3&&rank(p.status)>rank(status))status=p.status;
  return {...copy(s),type:'销售',date:s.date,status,cost:p.amount,purchaseRefund:p.refund||0,fees:(s.fees||0)+(p.fees||0),fulfillment:'按单采购',purchaseId:'',payer:p.payer,aaStatus:p.aaStatus,aaPayer:p.aaPayer,aaAmount:p.aaAmount,supplier:p.supplier,productUrl:p.productUrl,procurementOrder:p.order,procurementDate:p.date,procurementStatus:p.status,shippingTracking:s.shippingTracking||p.shippingTracking||'',attachments:[...(s.attachments||[]),...(p.attachments||[])].filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i),note:[s.note,p.note].filter((v,i,a)=>v&&a.indexOf(v)===i).join('；')};
 }
 function createBatchPlan(batches,existing,options={}){
  const roots=new Map(existing.map(e=>[e.id,e])),sources=new Map(),manual=existing.filter(e=>!unwrap(e).length),issues=[],sourceItems=[];
  for(const e of existing)for(const src of unwrap(e)){const key=src.entry.importData.key;if(sources.has(key))throw Error('已有重复的来源订单标识，请先核对');sources.set(key,src);}
  const importedKeys=new Set(),blockedKeys=new Set();
  // Flatten snapshots for source-local three-way updates. Canonical records are composed only after every file is parsed.
  for(const batch of batches){
   const parsed=batch.parsed,virtual=[...sources.values()].map(src=>({...copy(src.entry),id:'src:'+src.entry.importData.key}));
   const plan=C.createPlan(parsed,[...virtual,...manual],options);issues.push(...plan.issues.map(i=>({...i,file:batch.name})));
   for(const item of plan.items){item.file= batch.name;sourceItems.push(item);if(item.action==='blocked'){blockedKeys.add(item.source.key);continue;}
    const key=item.source.key,prior=sources.get(key),candidate=copy(item.candidate);candidate.id='src:'+key;
    candidate.platform=parsed.platform||candidate.platform||(parsed.kind==='销售'?'小红书':'1688');
    if(!prior){candidate.source='导入：'+batch.name;if(candidate.type==='销售'){candidate.fees=0;candidate.fulfillment='按单采购';}}
    if(item.action!=='skip')candidate.importData={...candidate.importData,fileName:batch.name};
    const manualRoot=item.currentId&&roots.has(item.currentId)?item.currentId:null;
    sources.set(key,{entry:candidate,platform:candidate.platform,rootId:prior?.rootId||manualRoot});importedKeys.add(key);
   }
  }
  const protectedPurchaseIds=new Set(existing.filter(e=>e.purchaseId).map(e=>e.purchaseId));
  const sales=[...sources].filter(([,v])=>v.platform==='小红书'),purchases=[...sources].filter(([,v])=>v.platform!=='小红书'),pairs=new Map(),claimed=new Set(),suggestions=[];
  // Already confirmed links stay stable across later exports.
  for(const [pk,p] of purchases){const old=p.rootId&&roots.get(p.rootId);if(old?.orderSources?.['小红书']){const sk=old.orderSources['小红书'].importData.key;if(sources.has(sk)){pairs.set(pk,sk);claimed.add(sk);}}}
  // Explicit preview choices take precedence; one purchase line can fund only one sales line in this version.
  for(const [pk,sk] of Object.entries(options.links||{})){if(!sources.has(pk)||!sources.has(sk)||pairs.has(pk))continue;if(protectedPurchaseIds.has(sources.get(pk).rootId))throw Error('这笔进货已有库存销售关联，请保持囤货采购，不能整笔转为代发');if(sources.get(pk).entry.qty!==sources.get(sk).entry.qty)throw Error('采购与销售数量不同，请先按对应数量拆分后再关联');if(claimed.has(sk))throw Error('同一销售商品行不能重复关联两条采购，请先拆分或合并采购明细');pairs.set(pk,sk);claimed.add(sk);}
  const possible=new Map();for(const [pk,p] of purchases){if(pairs.has(pk)||protectedPurchaseIds.has(p.rootId))continue;possible.set(pk,sales.filter(([sk,s])=>!claimed.has(sk)&&matchReason(p.entry,s.entry)).map(([sk,s])=>({key:sk,reason:matchReason(p.entry,s.entry)})));}
  for(const [pk,list] of possible){if(list.length!==1)continue;const sk=list[0].key;if([...possible.values()].filter(a=>a.some(x=>x.key===sk)).length===1){pairs.set(pk,sk);claimed.add(sk);}}
  for(const [pk,p] of purchases){if(pairs.has(pk)||!importedKeys.has(pk)&&!sales.some(([sk])=>importedKeys.has(sk)))continue;
   const choices=sales.filter(([sk,s])=>!claimed.has(sk)&&!s.entry.cancelled).map(([key,s])=>({key,order:s.entry.order,name:s.entry.name,size:s.entry.size,color:s.entry.color,qty:s.entry.qty,customerName:s.entry.customerName,date:s.entry.date}));
   if(choices.length)suggestions.push({purchaseKey:pk,purchase:p.entry,choices,ambiguous:(possible.get(pk)||[]).length>1});
  }
  const groups=[];for(const [sk,s] of sales){const pair=[...pairs].find(([,v])=>v===sk);groups.push({s,p:pair?sources.get(pair[0]):null,keys:pair?[sk,pair[0]]:[sk]});}
  for(const [pk,p] of purchases)if(!pairs.has(pk))groups.push({s:null,p,keys:[pk]});
  const usedRoots=new Set(),entries=manual.filter(e=>![...sources.values()].some(s=>s.rootId===e.id)).map(copy),items=[],removed=[];
  for(const group of groups){const {s,p,keys}=group,preferred=(s?.rootId&&roots.get(s.rootId))||(p?.rootId&&roots.get(p.rootId)),purchaseSource=p?copy(p.entry):null,purchaseRoot=p?.rootId&&roots.get(p.rootId);
   if(s&&purchaseRoot&&!purchaseRoot.orderSources?.['小红书'])for(const k of ['amount','refund','payer','aaStatus','aaPayer','aaAmount','fees','attachments','note','shippingTracking'])if(purchaseRoot[k]!==undefined)purchaseSource[k]=copy(purchaseRoot[k]);
   const baseline=derived(s?.entry,purchaseSource);
   let id=preferred?.id;if(!id)id=options.idForKey?options.idForKey(keys[0]):'import:'+keys[0];
   if(usedRoots.has(id))throw Error('来源订单关联冲突，已停止导入');usedRoots.add(id);
   const candidate={...baseline,id};delete candidate.orderSources;delete candidate.orderDerived;
   const warnings=sourceItems.filter(i=>keys.includes(i.source.key)).flatMap(i=>i.warnings||[]);
   if(preferred?.orderDerived){for(const k of new Set([...Object.keys(preferred.orderDerived),...Object.keys(preferred)])){const value=preferred.orderDerived[k];if(['id','orderSources','orderDerived','importData','source'].includes(k))continue;if(!same(preferred[k],value)&&preferred[k]!==undefined){candidate[k]=copy(preferred[k]);if(!same(preferred[k],baseline[k]))warnings.push('保留手动填写：'+({cost:'进货成本',fees:'发货费用',note:'备注',attachments:'截图',aaStatus:'AA结算',aaPayer:'AA付款人',aaAmount:'AA金额',payer:'归属',status:'状态',date:'日期',refund:'顾客退款',returnShipping:'退货运费',shippingTracking:'快递单号',customerName:'顾客姓名',customerPhone:'顾客电话',customerAddress:'顾客地址'}[k]||'记录信息'));}}}
   // Preserve manually entered cost, fees, refund, notes, AA and screenshots on first adoption too.
   if(preferred&&!preferred.orderDerived){for(const k of ['cost','fees','returnShipping','note','attachments'])if(k!=='attachments'&&preferred[k]!==undefined&&preferred[k]!==null&&preferred[k]!==''&&(!Array.isArray(preferred[k])||preferred[k].length))candidate[k]=copy(preferred[k]);}
   if(s&&purchaseRoot&&!purchaseRoot.orderSources?.['小红书'])for(const k of ['payer','aaStatus','aaPayer','aaAmount'])if(purchaseSource[k]!==undefined)candidate[k]=copy(purchaseSource[k]);
   candidate.orderSources={};if(s)candidate.orderSources['小红书']=copy(s.entry);if(p)candidate.orderSources['1688']=copy(purchaseSource);
   candidate.orderDerived=copy(baseline);delete candidate.orderDerived.id;delete candidate.orderDerived.orderSources;delete candidate.orderDerived.orderDerived;
   candidate.importData=copy((s||p).entry.importData);
   if(s&&p){warnings.push('已自动关联销售与采购，只记一笔收入和一笔成本');const reason=matchReason(p.entry,s.entry);if(reason)warnings.push('匹配依据：'+reason);}else if(s)warnings.push('尚未关联采购：保留销售，成本待补');
   const action=!preferred?'create':same(candidate,preferred)?'skip':'update';entries.push(candidate);items.push({action,candidate,currentId:preferred?.id,keys,warnings:[...new Set(warnings)],linked:!!(s&&p)});
   for(const src of [s,p])if(src?.rootId&&src.rootId!==id&&!removed.includes(src.rootId))removed.push(src.rootId);
  }
  for(const id of removed){const source=[...sources.values()].find(v=>v.rootId===id),target=source&&entries.find(e=>Object.values(e.orderSources||{}).some(v=>v.importData?.key===source.entry.importData.key));if(target)for(const entry of entries)if(entry.relatedEntryId===id)entry.relatedEntryId=target.id;}
  const relevant=items.filter(i=>i.keys.some(k=>importedKeys.has(k))||i.action!=='skip');
  return {entries,items:relevant,removed,issues,suggestions,sourceItems,counts:{create:items.filter(i=>i.action==='create').length,update:items.filter(i=>i.action==='update').length,skip:relevant.filter(i=>i.action==='skip').length,blocked:blockedKeys.size+issues.length,linked:relevant.filter(i=>i.linked).length},files:batches.map(b=>({name:b.name,platform:b.parsed.platform,orders:b.parsed.orders.length,lines:b.parsed.entries.length,total:b.parsed.totalCents/100}))};
 }
 const api={createBatchPlan,matchReason,derived,unwrap};if(typeof module==='object'&&module.exports)module.exports=api;else root.OrderBatchCore=api;
})(typeof globalThis==='object'?globalThis:this);
