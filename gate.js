'use strict';
const from64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
document.getElementById('password-form').addEventListener('submit',async e=>{
 e.preventDefault();const button=e.submitter;const input=document.getElementById('site-password');const error=document.getElementById('password-error');
 button.disabled=true;button.textContent='解鎖中…';error.textContent='';
 let encrypted;
 try{const response=await fetch('./data.encrypted.json',{cache:'no-store'});if(!response.ok)throw Error();encrypted=await response.json();}
 catch{error.textContent='資料下載失敗，請重新整理後再試。';button.disabled=false;button.textContent='解鎖地圖';return;}
 try{
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(input.value.toUpperCase()),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:from64(encrypted.salt),iterations:encrypted.iterations},material,{name:'AES-GCM',length:256},false,['decrypt']);
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(encrypted.iv)},key,from64(encrypted.ciphertext));
 window.unlockedMapData=JSON.parse(new TextDecoder().decode(plain));input.value='';
 const script=document.createElement('script');script.src='./app.js';script.onerror=()=>{delete window.unlockedMapData;error.textContent='程式載入失敗，請重新整理。';};script.onload=()=>{document.body.classList.remove('locked');document.getElementById('password-gate').hidden=true;};document.head.append(script);
 }catch{error.textContent='密碼不正確或資料已損毀，請確認後再試。';}
 finally{button.disabled=false;button.textContent='解鎖地圖';}
});
document.getElementById('static-logout').onclick=()=>{delete window.unlockedMapData;location.reload();};
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
