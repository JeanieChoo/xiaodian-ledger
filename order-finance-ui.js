'use strict';
let lastDeletedRecord=null;
function confirmRecordDeletion(record){const dialog=$('#delete-confirm-dialog');$('#delete-confirm-name').textContent=record.name;dialog.showModal();return new Promise(resolve=>{const finish=value=>{dialog.close();resolve(value);};$('#confirm-record-delete').onclick=()=>finish(true);$('#cancel-record-delete').onclick=()=>finish(false);dialog.oncancel=event=>{event.preventDefault();finish(false);};});}
function populateOrderLinks(entry){
 const f=$('#entry-form').elements;
 const purchases=state.entries.filter(e=>e.type==='进货'&&!combinedSale(e)&&hasInventoryInfo(e));
 f.purchaseId.innerHTML='<option value="">手动填写进价</option>'+purchases.map(e=>'<option value="'+esc(e.id)+'">'+esc([e.name,e.size,e.color,e.supplier,e.order].filter(Boolean).join(' · '))+' · '+money(net(e)/e.qty)+'/件</option>').join('');
 f.purchaseId.value=entry?.purchaseId||'';
 f.relatedEntryId.innerHTML='<option value="">按下面的订单号归集 / 暂不关联</option>'+state.entries.filter(e=>['进货','销售'].includes(e.type)).map(e=>'<option value="'+esc(e.id)+'">'+esc([e.name,e.size,e.color,e.order].filter(Boolean).join(' · '))+'</option>').join('');
 f.relatedEntryId.value=entry?.relatedEntryId||'';f.pairedFees.value=entry?.fees??0;
}
function fillLinkedPurchase(){const f=$('#entry-form').elements;if(f.type.value!=='销售'||f.fulfillment.value!=='库存销售'||!f.purchaseId.value)return;const p=state.entries.find(e=>e.id===f.purchaseId.value);if(!p||!p.qty)return;for(const k of ['name','size','color','supplier','productUrl'])f[k].value=p[k]||'';const qty=Number(f.qty.value)||1;f.cost.value=(Math.round(net(p)*100*qty/p.qty)/100).toFixed(2);}
function returnToLedger(id){
 const e=state.entries.find(x=>x.id===id);if(!e)return;navigate('ledger');
 if($('#type-filter').value&&$('#type-filter').value!==displayType(e))$('#type-filter').value='';if($('#status-filter').value&&$('#status-filter').value!==e.status)$('#status-filter').value='';if($('#aa-filter').value&&!matchesAaFilter(e,$('#aa-filter').value))$('#aa-filter').value='';
 const text=x=>[x.name,x.order,x.note,x.payer,x.tracking,x.returnDirection,x.returnBearer,x.size,x.color,x.supplier,x.customerName,x.customerAddress,x.customerPhone].join(' ').toLowerCase();const query=$('#search').value.trim().toLowerCase();if(query&&!text(e).includes(query))$('#search').value='';
 const entries=state.entries.filter(x=>(!$('#type-filter').value||displayType(x)===$('#type-filter').value)&&(!$('#status-filter').value||x.status===$('#status-filter').value)&&matchesAaFilter(x,$('#aa-filter').value)&&text(x).includes($('#search').value.trim().toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date));
 ledgerPage=Math.floor(Math.max(0,entries.findIndex(x=>x.id===id))/ledgerPageSize)+1;renderLedger();
 const row=$('#ledger-table').querySelector('[data-record-id="'+CSS.escape(id)+'"]');if(row){row.classList.add('saved-row');row.scrollIntoView({block:'center',behavior:'smooth'});row.querySelector('[data-edit]')?.focus({preventScroll:true});setTimeout(()=>row.classList.remove('saved-row'),2500);}
}
async function deleteLedgerEntry(id,fromDialog=false){
 if(entrySaving)return;const record=state.entries.find(e=>e.id===id);if(!record)return;
 if(state.entries.some(e=>e.purchaseId===id)){toast('有销售关联这笔进货，请先解除销售中的进货关联再删除。');return;}
 if(!await confirmRecordDeletion(record))return;
 const previous=state.entries.slice();setEntrySaving(true);try{state.entries=state.entries.filter(e=>e.id!==id);if(!await persist()){state.entries=previous;toast('删除未保存，请检查云端同步状态。');return;}lastDeletedRecord=structuredClone(record);render();$('#deleted-record-notice').hidden=false;entrySaving=false;if(fromDialog)closeEntry();toast('记录已删除，可在收支明细撤销。');}finally{setEntrySaving(false);}
}
function installOrderFinance(){
 const f=$('#entry-form').elements;f.fulfillment.onchange=()=>{f.aaStatus.value='未AA';saleFields();};f.purchaseId.onchange=fillLinkedPurchase;f.qty.addEventListener('change',fillLinkedPurchase);
 f.relatedEntryId.onchange=()=>{const original=state.entries.find(e=>e.id===f.relatedEntryId.value);if(original)f.order.value=original.order||'';};
 $('#undo-record-delete').onclick=async()=>{if(!lastDeletedRecord)return;const record=lastDeletedRecord,previous=state.entries.slice();if(state.entries.some(e=>e.id===record.id)){toast('这笔记录已存在，请刷新核对。');return;}state.entries.unshift(record);if(!await persist()){state.entries=previous;return;}lastDeletedRecord=null;$('#deleted-record-notice').hidden=true;render();returnToLedger(record.id);toast('已撤销删除。');};
}
