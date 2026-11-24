'use strict';
let lastDeletedRecord=null;
function confirmRecordDeletion(input){const records=Array.isArray(input)?input:[input],dialog=$('#delete-confirm-dialog');$('#delete-confirm-title').textContent=records.length===1?'删除这笔记录？':'删除选中的 '+records.length+' 笔记录？';$('#delete-confirm-name').textContent=records.slice(0,3).map(e=>e.name).join('、')+(records.length>3?' 等':'' );dialog.showModal();return new Promise(resolve=>{const finish=value=>{dialog.close();resolve(value);};$('#confirm-record-delete').onclick=()=>finish(true);$('#cancel-record-delete').onclick=()=>finish(false);dialog.oncancel=event=>{event.preventDefault();finish(false);};});}
function filteredLedgerEntries(){const query=$('#search').value.trim().toLowerCase();return state.entries.filter(e=>(!$('#type-filter').value||displayType(e)===$('#type-filter').value)&&(!$('#payer-filter').value||e.payer===$('#payer-filter').value)&&(!$('#status-filter').value||displayStatus(e)===$('#status-filter').value)&&matchesAaFilter(e,$('#aa-filter').value)&&[e.name,e.order,e.procurementOrder,e.shippingTracking,e.note,e.payer,e.tracking,e.returnDirection,e.returnBearer,e.size,e.color,e.supplier,e.customerName,e.customerAddress,e.customerPhone].join(' ').toLowerCase().includes(query));}
function renderLedgerSelection(){const existing=new Set(state.entries.map(e=>e.id));for(const id of selectedLedgerIds)if(!existing.has(id))selectedLedgerIds.delete(id);const boxes=$$('#ledger-table [data-select-entry]');for(const box of boxes)box.checked=selectedLedgerIds.has(box.dataset.selectEntry);const master=$('#ledger-select-page');if(master){master.checked=boxes.length>0&&boxes.every(box=>box.checked);master.indeterminate=boxes.some(box=>box.checked)&&!master.checked;}$('#bulk-delete').disabled=false;$('#bulk-delete').textContent=ledgerSelectionMode&&selectedLedgerIds.size?'删除选中（'+selectedLedgerIds.size+'）':'批量删除';$('#ledger-selection-actions').hidden=!ledgerSelectionMode;$('#ledger-selected-count').textContent='已选 '+selectedLedgerIds.size+' 笔';}
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
 if($('#payer-filter').value&&$('#payer-filter').value!==e.payer)$('#payer-filter').value='';if($('#type-filter').value&&$('#type-filter').value!==displayType(e))$('#type-filter').value='';if($('#status-filter').value&&$('#status-filter').value!==displayStatus(e))$('#status-filter').value='';if($('#aa-filter').value&&!matchesAaFilter(e,$('#aa-filter').value))$('#aa-filter').value='';
 const text=x=>[x.name,x.order,x.procurementOrder,x.shippingTracking,x.note,x.payer,x.tracking,x.returnDirection,x.returnBearer,x.size,x.color,x.supplier,x.customerName,x.customerAddress,x.customerPhone].join(' ').toLowerCase();const query=$('#search').value.trim().toLowerCase();if(query&&!text(e).includes(query))$('#search').value='';
 const entries=state.entries.filter(x=>(!$('#type-filter').value||displayType(x)===$('#type-filter').value)&&(!$('#status-filter').value||displayStatus(x)===$('#status-filter').value)&&matchesAaFilter(x,$('#aa-filter').value)&&(!$('#payer-filter').value||x.payer===$('#payer-filter').value)&&text(x).includes($('#search').value.trim().toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date));
 ledgerPage=Math.floor(Math.max(0,entries.findIndex(x=>x.id===id))/ledgerPageSize)+1;renderLedger();
 const row=$('#ledger-table').querySelector('[data-record-id="'+CSS.escape(id)+'"]');if(row){row.classList.add('saved-row');row.scrollIntoView({block:'center',behavior:'smooth'});row.querySelector('[data-edit]')?.focus({preventScroll:true});setTimeout(()=>row.classList.remove('saved-row'),2500);}
}
async function deleteLedgerEntry(id,fromDialog=false){return deleteLedgerEntries([id],fromDialog);}
async function deleteLedgerEntries(ids,fromDialog=false){
 if(entrySaving)return;const idSet=new Set(ids),records=state.entries.filter(e=>idSet.has(e.id));if(!records.length)return;
 if(state.entries.some(e=>e.purchaseId&&idSet.has(e.purchaseId)&&!idSet.has(e.id))){toast('有未选中的销售关联这些进货，请先解除关联，或同时选中关联销售。');return;}
 if(!await confirmRecordDeletion(records))return;
 const previous=state.entries.slice();setEntrySaving(true);try{state.entries=state.entries.filter(e=>!idSet.has(e.id));if(!await persist()){state.entries=previous;toast('删除未保存，请检查云端同步状态。');return;}lastDeletedRecord=structuredClone(records);selectedLedgerIds.clear();ledgerSelectionMode=false;render();$('#deleted-record-notice').querySelector('span').textContent='已删除 '+records.length+' 笔记录，总览和库存已更新。';$('#deleted-record-notice').hidden=false;entrySaving=false;if(fromDialog)closeEntry();toast('已删除 '+records.length+' 笔，可撤销本次删除。');}finally{setEntrySaving(false);}
}
function installOrderFinance(){
 installLedgerScroll();
 const f=$('#entry-form').elements;f.fulfillment.onchange=()=>{f.aaStatus.value='未AA';saleFields();};f.purchaseId.onchange=fillLinkedPurchase;f.qty.addEventListener('change',fillLinkedPurchase);
 f.relatedEntryId.onchange=()=>{const original=state.entries.find(e=>e.id===f.relatedEntryId.value);if(original)f.order.value=original.order||'';};
 $('#bulk-delete').onclick=()=>{if(!ledgerSelectionMode){ledgerSelectionMode=true;selectedLedgerIds.clear();renderLedger();return;}if(!selectedLedgerIds.size){toast('请先勾选要删除的记录。');return;}deleteLedgerEntries([...selectedLedgerIds]);};$('#exit-bulk-mode').onclick=()=>{ledgerSelectionMode=false;selectedLedgerIds.clear();renderLedger();};$('#select-filtered-entries').onclick=()=>{for(const e of filteredLedgerEntries())selectedLedgerIds.add(e.id);renderLedgerSelection();};$('#clear-selected-entries').onclick=()=>{selectedLedgerIds.clear();renderLedgerSelection();};
 $('#undo-record-delete').onclick=async()=>{if(!lastDeletedRecord)return;const records=Array.isArray(lastDeletedRecord)?lastDeletedRecord:[lastDeletedRecord],previous=state.entries.slice(),button=$('#undo-record-delete');if(records.some(r=>state.entries.some(e=>e.id===r.id))){toast('有记录已恢复，请刷新核对。');return;}button.disabled=true;try{state.entries.unshift(...records);if(!await persist()){state.entries=previous;return;}lastDeletedRecord=null;$('#deleted-record-notice').hidden=true;render();returnToLedger(records[0].id);toast('已撤销本次 '+records.length+' 笔删除。');}finally{button.disabled=false;}};
}

function installLedgerScroll(){
 const table=$('#ledger-table'),range=$('#ledger-scroll-position'),bar=$('#ledger-horizontal-control');
 const sync=()=>{const max=table.scrollWidth-table.clientWidth;bar.hidden=max<=1;if(max>0)range.value=String(Math.round(table.scrollLeft/max*1000));$('#ledger-scroll-left').disabled=table.scrollLeft<=1;$('#ledger-scroll-right').disabled=table.scrollLeft>=max-1;};
 range.addEventListener('input',()=>{table.scrollLeft=(table.scrollWidth-table.clientWidth)*Number(range.value)/1000;sync();});
 $('#ledger-scroll-left').onclick=()=>table.scrollBy({left:-Math.max(150,table.clientWidth*.6),behavior:'smooth'});$('#ledger-scroll-right').onclick=()=>table.scrollBy({left:Math.max(150,table.clientWidth*.6),behavior:'smooth'});
 table.addEventListener('scroll',sync,{passive:true});new ResizeObserver(sync).observe(table);new MutationObserver(sync).observe(table,{childList:true,subtree:true});sync();
}
