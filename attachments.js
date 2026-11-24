'use strict';
const attachmentStore=(()=>{
 let opening;
 function open(){if(!opening)opening=new Promise((resolve,reject)=>{const request=indexedDB.open('xiaodian-ledger-attachments',1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('screenshots'))db.createObjectStore('screenshots',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>{opening=null;reject(request.error)};request.onblocked=()=>{opening=null;reject(new Error('请关闭其他旧版账本页面后重试。'))};});return opening;}
 async function write(items,removed=[]){if(!items.length&&!removed.length)return;const db=await open();return new Promise((resolve,reject)=>{const transaction=db.transaction('screenshots','readwrite');const store=transaction.objectStore('screenshots');items.forEach(item=>store.put({id:item.id,blob:item.file}));removed.forEach(id=>store.delete(id));transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||new Error('截图未能保存。'));});}
 async function get(id){const db=await open();return new Promise((resolve,reject)=>{const request=db.transaction('screenshots','readonly').objectStore('screenshots').get(id);request.onsuccess=()=>resolve(request.result?.blob||null);request.onerror=()=>reject(request.error);});}
 return {write,get};
})();
