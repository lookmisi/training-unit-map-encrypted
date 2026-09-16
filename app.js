'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize = s => String(s??'').normalize('NFKC').replace(/台/g,'臺').replace(/\s+/g,'').toLowerCase();
const date = s => /^\d{7}$/.test(s) ? `${s.slice(0,3)}/${s.slice(3,5)}/${s.slice(5)}` : s || '未提供';
const centers={'臺北市':[121.537,25.055],'新北市':[121.452,25.012],'基隆市':[121.741,25.129],'桃園市':[121.25,24.993],'新竹市':[120.968,24.806],'新竹縣':[121.011,24.827],'苗栗縣':[120.821,24.565],'臺中市':[120.67,24.151],'彰化縣':[120.542,24.075],'南投縣':[120.685,23.91],'雲林縣':[120.535,23.71],'嘉義市':[120.448,23.481],'嘉義縣':[120.292,23.459],'臺南市':[120.207,22.997],'高雄市':[120.301,22.64],'屏東縣':[120.487,22.666],'宜蘭縣':[121.753,24.752],'花蓮縣':[121.601,23.991],'臺東縣':[121.145,22.756],'澎湖縣':[119.566,23.567],'金門縣':[118.318,24.435],'連江縣':[119.95,26.16]};
const definitions=[['city','縣市'],['authority','主管機關'],['category','單位類別'],['structure','單一／非單一'],['management','管理評鑑等級'],['technical','技術評鑑等級'],['locationStatus','定位狀態'],['hqId','總會']];
let data, filtered=[], selected=null, map=null, mapReady=false, mapFailed=false, markers=[], popup=null, view='map', query='', filterValues={}, lastFocus=null;
function field(label,value){return `<dt>${esc(label)}</dt><dd>${esc(value||'未提供')}</dd>`;}
function badge(label,value){return `<span class="badge ${value && value!=='無'?'grade':''}">${esc(label)} ${esc(value||'未提供')}</span>`;}
function notice(message){$('#map-notice').hidden=!message;$('#map-notice').textContent=message;}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,3000);}
function syncFilters(){
 document.querySelectorAll('[data-filter]').forEach(el=>el.checked=(filterValues[el.dataset.filter]||[]).includes(el.value));
 document.querySelectorAll('[data-summary]').forEach(el=>{const v=filterValues[el.dataset.summary]||[];el.textContent=v.length?'已選 '+v.length+' 項':'全部';});
}
function options(){
 $('#filter-grid').innerHTML=definitions.map(([key,label])=>{
 const values=[...new Set(data.units.map(u=>u[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 return '<details class="multi-filter"><summary>'+esc(label)+'<span data-summary="'+key+'">全部</span></summary><div class="multi-options">'+values.map(v=>'<label><input type="checkbox" data-filter="'+key+'" value="'+esc(v)+'"><span>'+esc(filterLabel(key,v))+'</span></label>').join('')+'</div></details>';
 }).join('');
 document.querySelectorAll('[data-filter]').forEach(el=>el.onchange=()=>{const v=new Set(filterValues[el.dataset.filter]||[]);el.checked?v.add(el.value):v.delete(el.value);filterValues[el.dataset.filter]=[...v];syncFilters();render();});
}
function filterLabel(key,value){return key==='hqId'?data.headquarters.find(h=>h.id===value)?.name||value:value;}
function render(){
  const terms=normalize(query).split(/[，,]+/).filter(Boolean);
  filtered=data.units.filter(u=>Object.entries(filterValues).every(([k,v])=>!v.length||v.includes(u[k]))&&terms.every(term=>normalize([u.name,u.hqName,u.id,u.address,u.authority,u.contact,u.phone,u.email].join(' ')).includes(term)));
  if(selected&&!filtered.some(u=>u.id===selected)) closeDetail();
  const active=Object.entries(filterValues).flatMap(([k,values])=>values.map(v=>[k,v]));
  $('#active-filters').innerHTML=(query?`<button class="chip" data-clear="query">搜尋：${esc(query)} ×</button>`:'')+active.map(([k,v])=>`<button class="chip" data-clear="${k}" data-value="${esc(v)}">${esc(filterLabel(k,v))} ×</button>`).join('');
  $('#active-filters').querySelectorAll('[data-clear]').forEach(b=>b.onclick=()=>{if(b.dataset.clear==='query'){query='';$('#search').value='';}else{filterValues[b.dataset.clear]=(filterValues[b.dataset.clear]||[]).filter(v=>v!==b.dataset.value);syncFilters();}render();});
  $('#unit-count').textContent=filtered.length;$('#result-count').textContent=filtered.length;$('#mobile-count').textContent=filtered.length;
  $('#hq-count').textContent=new Set(filtered.map(u=>u.hqId).filter(Boolean)).size;$('#city-count').textContent=new Set(filtered.map(u=>u.city)).size;
  $('#scope').textContent=filterValues.city?.join('、')||((query||active.length)?'符合條件的機構':'全臺訓練機構');
  $('#unit-list').innerHTML=filtered.length?filtered.map(u=>`<button class="unit-card ${u.id===selected?'selected':''}" data-unit="${esc(u.id)}" aria-pressed="${u.id===selected}"><div class="card-top"><span>${esc(u.city)}</span><span>${esc(u.id)}</span></div><h3>${esc(u.name)}</h3><p class="card-authority">${esc(u.authority)}</p><div class="badges">${badge('管理',u.management)}${badge('技術',u.technical)}${!u.presentInLatest?'<span class="badge pending">本次未提供</span>':''}</div></button>`).join(''):'<p class="empty">沒有符合條件的機構。<br>試著減少篩選條件或更換關鍵字。</p>';
  $('#table-body').innerHTML=filtered.map(u=>`<tr><td><button data-unit="${esc(u.id)}">${esc(u.name)}</button></td><td>${esc(u.city)}</td><td>${esc(u.hqName)}</td><td>${esc(u.authority)}</td><td>${esc(u.management)}</td><td>${esc(u.technical)}</td><td>${esc(u.phone)}</td><td>${esc(u.address)}</td></tr>`).join('')||'<tr><td colspan="8">沒有符合條件的機構</td></tr>';
  document.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>showDetail(b.dataset.unit));
  renderMap();
}
function closeDetail(){selected=null;$('#detail').hidden=true;document.querySelectorAll('.unit-card.selected').forEach(x=>{x.classList.remove('selected');x.setAttribute('aria-pressed','false');});if(popup){popup.remove();popup=null;}map?.resize();if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});}
function record(title,grade,start,end){return `<div class="record"><div class="record-top"><strong>${title}</strong>${grade?badge('等級',grade):''}</div><p>效期起日　${esc(date(start))}<br>效期迄日　${esc(date(end))}</p></div>`;}
function showDetail(id){
  const u=data.units.find(u=>u.id===id);if(!u)return;
  lastFocus=document.activeElement;selected=id;
  const h=data.headquarters.find(h=>h.id===u.hqId), relatives=data.units.filter(x=>x.hqId&&x.hqId===u.hqId), problems=data.issues.filter(x=>x.id===u.hqId||x.id===u.id);
  $('#detail-content').innerHTML=`<p class="detail-kicker">${esc(u.city)} ／ ${esc(u.category)}</p><h2 class="detail-title">${esc(u.name)}</h2><div class="badges">${badge('管理評鑑',u.management)}${badge('技術評鑑',u.technical)}</div><p class="detail-address">${esc(u.address||'未提供地址')}</p><div class="detail-actions"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.address)}" target="_blank" rel="noopener noreferrer">開啟地圖 ↗</a><button id="copy-address">複製地址</button><button id="show-hq">查看同總會機構</button></div>${!u.presentInLatest?'<p class="warning">本次檔案未提供此機構，保留前次資料供查閱，狀態待確認。</p>':''}<section class="detail-section"><h3>基本資料</h3><dl class="fields">${field('系統帳號',u.id)}${field('總會',u.hqName)}${field('單位類別',u.category)}${field('狀態',u.status)}${field('機構型態',u.structure)}${field('主管機關',u.authority)}</dl></section><section class="detail-section"><h3>聯絡與地址</h3><dl class="fields">${field('負責人',`${u.title} ${u.contact}`)}${field('電話',u.phone)}${field('信箱',u.email)}${field('郵遞區號',u.postalCode)}${field('單位地址',u.address)}</dl><p class="subtle" style="margin-top:10px">負責人姓名已隱藏最後兩字。</p></section><section class="detail-section"><h3>評鑑資料</h3>${record('管理評鑑',u.management,u.managementStart,u.managementEnd)}${record('技術評鑑',u.technical,u.technicalStart,u.technicalEnd)}<dl class="fields" style="margin-top:14px">${field('免實地評鑑',u.exemption)}</dl></section><section class="detail-section"><h3>認可資料</h3>${record('管理認可',null,u.recognitionManagementStart,u.recognitionManagementEnd)}${record('技術認可',null,u.recognitionTechnicalStart,u.recognitionTechnicalEnd)}<dl class="fields" style="margin-top:14px">${field('申請條件',u.application)}${field('取得技甲以上',u.technicalA)}</dl></section><section class="detail-section"><h3>歷年評鑑紀錄</h3><p class="history">${esc(u.history||'未提供')}</p></section><section class="detail-section"><h3>總會</h3><dl class="fields">${field('名稱',u.hqName)}${field('地址',h?.address||u.hqAddress)}${field('狀態',h?.status)}${field('原表附設家數',h?.declaredCount)}${field('本資料機構數',relatives.length+' 家')}</dl>${problems.map(p=>`<p class="warning">${esc(p.type)}${p.declared?`：原表 ${esc(p.declared)} 家，本次明細 ${esc(p.actual)} 家。`:''}</p>`).join('')}${h?.notes.filter(Boolean).map(n=>`<p class="subtle" style="margin-top:8px">${esc(n)}</p>`).join('')||''}${relatives.map(x=>`<button class="related" data-related="${esc(x.id)}">${esc(x.name)} ${x.id===id?'（目前查看）':'↗'}</button>`).join('')}</section><section class="detail-section"><h3>位置與來源</h3><dl class="fields">${field('定位狀態',u.geo?.status==='verified'?'使用者已確認座標':u.geo?'地址比對位置，待確認':'待補精確座標')}${field('座標來源',u.geo?.source)}${field('資料來源',u.sourceFile)}${field('來源列',`${u.sourceSheet}，第 ${u.sourceRow} 列`)}</dl><details><summary>查看全部原始欄位（姓名已遮蔽）</summary><dl class="fields">${u.rawFields.map(f=>field(`${f.group} · ${f.label}`,f.value)).join('')}</dl></details></section>`;
  $('#detail').hidden=false;$('#detail-content').scrollTop=0;
  document.querySelectorAll('.unit-card').forEach(b=>{b.classList.toggle('selected',b.dataset.unit===id);b.setAttribute('aria-pressed',String(b.dataset.unit===id));});
  document.querySelector(`.unit-card[data-unit="${id}"]`)?.scrollIntoView({block:'nearest'});
  $('#copy-address').onclick=async()=>{try{await navigator.clipboard.writeText(u.address);toast('已複製地址');}catch{toast('無法自動複製，請選取地址複製。');}};
  $('#show-hq').disabled=!u.hqId;$('#show-hq').onclick=()=>{clearFilters(false);filterValues.hqId=[u.hqId];syncFilters();render();};
  document.querySelectorAll('[data-related]').forEach(b=>b.onclick=()=>{if(!filtered.some(x=>x.id===b.dataset.related)){clearFilters(false);render();}showDetail(b.dataset.related);});
  if(mapReady){map.resize();const coords=u.geo?.coordinates||centers[u.city];if(coords){map.easeTo({center:coords,zoom:u.geo?15:9,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:600});if(popup)popup.remove();const node=document.createElement('div');node.innerHTML=`<h3>${esc(u.name)}</h3><p>${esc(u.address)}</p><p>${esc(u.geo?.status==='verified'?'使用者提供 Google 地圖座標':u.geo?'地址比對位置，請核對':'此處為縣市參考位置，非機構地址')}</p>`;popup=new maplibregl.Popup({offset:22}).setLngLat(coords).setDOMContent(node).addTo(map);}}
  $('#close-detail').focus({preventScroll:true});
}
function homeView(){if(!mapReady)return;const points=data.units.map(u=>u.geo?.coordinates||centers[u.city]).filter(Boolean);map.fitBounds([[Math.min(119.9,...points.map(p=>p[0]))-.08,Math.min(21.85,...points.map(p=>p[1]))-.08],[Math.max(122.02,...points.map(p=>p[0]))+.08,Math.max(25.3,...points.map(p=>p[1]))+.08]],{padding:{top:85,bottom:155,left:30,right:40},duration:0});}
function clearFilters(redraw=true){filterValues={};query='';$('#search').value='';syncFilters();if(redraw)render();}
function updateMapNotice(){
  if(mapFailed){notice('底圖暫時無法載入。仍可使用搜尋、列表與完整資料；也可按「開啟地圖」查詢地址。');return;}
  if(!mapReady){notice('正在載入底圖…');return;}
  if($('#map-mode').value==='unit'){const n=filtered.filter(u=>u.geo?.coordinates).length;notice(n<filtered.length?`目前 ${n} 家有地址比對座標，${filtered.length-n} 家待補座標；待補機構仍可由列表查閱。`:n?`目前 ${n} 家均有座標（使用者確認 ${filtered.filter(u=>u.geo?.status==='verified').length} 家）；其餘為地址比對位置。`:'沒有符合條件的機構。');}
  else notice('縣市分布以參考位置呈現家數。點圓點可展開該縣市機構清單；精確地址請查看機構資料。');
}
function renderMap(){
 updateMapNotice();if(!mapReady)return;
 markers.forEach(m=>m.remove());markers=[];
 const cityMode=$('#map-mode').value==='city';
 $('#legend-text').textContent=cityMode?'縣市機構數（非機構地址）':'點數量放大；點單位標記查看資料';
 const groups=[];
 for(const u of filtered){
  const coord=cityMode?centers[u.city]:u.geo?.coordinates;if(!coord)continue;
  const point=map.project(coord);
  let group=groups.find(g=>cityMode?g.city===u.city:Math.hypot(g.point.x-point.x,g.point.y-point.y)<42);
  if(group)group.units.push(u);else groups.push({city:u.city,coord,point,units:[u]});
 }
 for(const group of groups){
  const list=group.units,el=document.createElement('button');
  el.className='unit-marker'+(list.length>1?' clustered':'');
  el.textContent=list.length>1?list.length:'●';
  el.setAttribute('aria-label',cityMode?group.city+' '+list.length+' 家':list.length>1?list.length+' 家機構，點選展開':list[0].name);
  el.title=cityMode?group.city:list.length===1?list[0].name:list.length+' 家機構';
  el.onclick=()=>{
   if(!cityMode&&list.length===1){showDetail(list[0].id);return;}
   const coords=list.map(u=>u.geo?.coordinates).filter(Boolean);
   const same=coords.length&&coords.every(c=>Math.abs(c[0]-coords[0][0])<0.00001&&Math.abs(c[1]-coords[0][1])<0.00001);
   if(!cityMode&&!same&&map.getZoom()<18){map.easeTo({center:group.coord,zoom:Math.min(map.getZoom()+2,19),duration:400});return;}
   const node=document.createElement('div');
   const title=document.createElement('h3');title.textContent=cityMode?group.city+' · '+list.length+' 家':'此位置的機構';node.append(title);
   for(const u of list){const b=document.createElement('button');b.textContent=u.name;b.onclick=()=>showDetail(u.id);node.append(b);}
   popup?.remove();popup=new maplibregl.Popup({offset:22,maxWidth:'310px'}).setLngLat(group.coord).setDOMContent(node).addTo(map);
  };
  markers.push(new maplibregl.Marker({element:el}).setLngLat(group.coord).addTo(map));
 }
}
async function loadMap(){
 try{
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/maplibre-gl.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
  map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[120.9,23.75],zoom:6.6,attributionControl:true});
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  map.on('error',()=>{mapFailed=true;updateMapNotice();});
  map.on('load',()=>{mapReady=true;mapFailed=false;homeView();renderMap();});
  map.on('moveend',()=>renderMap());map.on('resize',()=>renderMap());
 }catch{mapFailed=true;updateMapNotice();}
}
function changeView(v){view=v;$('#map-panel').hidden=v!=='map';$('#table-panel').hidden=v!=='table';$('#map-view').setAttribute('aria-pressed',v==='map');$('#table-view').setAttribute('aria-pressed',v==='table');document.body.classList.remove('mobile-list');$('#mobile-map').setAttribute('aria-pressed',v==='map');$('#mobile-list').setAttribute('aria-pressed','false');map?.resize();}
function exportCSV(){const columns=[['name','職訓機構'],['id','系統帳號'],['hqName','總會'],['city','縣市'],['category','類別'],['status','狀態'],['authority','主管機關'],['management','管理評鑑等級'],['managementStart','管理評鑑起日'],['managementEnd','管理評鑑迄日'],['technical','技術評鑑等級'],['technicalStart','技術評鑑起日'],['technicalEnd','技術評鑑迄日'],['recognitionManagementStart','管理認可起日'],['recognitionManagementEnd','管理認可迄日'],['recognitionTechnicalStart','技術認可起日'],['recognitionTechnicalEnd','技術認可迄日'],['contact','負責人（遮蔽）'],['phone','電話'],['email','信箱'],['address','地址'],['history','歷年評鑑紀錄']];const cell=(s)=>{let v=String(s??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};const csv='\ufeff'+[columns.map(([,n])=>cell(n)).join(','),...filtered.map(u=>columns.map(([k])=>cell(k==='id'?"'"+u[k]:u[k])).join(','))].join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`訓練單位查詢_${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`已匯出 ${filtered.length} 家機構`);}
async function init(){
  try{data=window.unlockedMapData;delete window.unlockedMapData;if(!data)throw Error('尚未解鎖');data.units.forEach(u=>u.locationStatus=u.geo?.status==='verified'?'使用者已確認座標':u.geo?'已有地址比對座標':'位置待確認');options();render();$('#version').textContent=`來源 ${data.meta.sourceFile.split('-')[0]} · ${data.meta.latestCount} 家`;
    $('#source-content').innerHTML=`<p><strong>來源檔案</strong><br>${esc(data.meta.sourceFile)}</p><p>本次匯入 ${data.meta.latestCount} 家職訓機構、${data.headquarters.filter(h=>h.status==='現行').length} 家現行總會，另保留 ${data.headquarters.filter(h=>h.status==='已撤銷').length} 家已撤銷總會紀錄。</p><p>評鑑分為管理與技術；認可目前也分為管理與技術。日期依原表以民國年呈現，不自行推定資格有效或失效。</p><p>縣市分布的圓點是參考位置，不是機構地址。負責人最後兩字已在網站資料中遮蔽。</p><p><strong>待核對事項</strong></p><ul>${data.issues.map(x=>`<li>${esc(data.headquarters.find(h=>h.id===x.id)?.name||x.id)}：${esc(x.type)}${x.declared?`（原表 ${esc(x.declared)} 家，本次 ${esc(x.actual)} 家）`:''}</li>`).join('')||'<li>無</li>'}</ul><p class="subtle">底圖：OpenFreeMap ／ MapLibre。座標來源：OpenStreetMap；保留原始地址供核對。新版未出現的機構預設保留，不直接判定撤銷。</p>`;
    $('#search').addEventListener('input',e=>{query=e.target.value;render();});$('#clear').onclick=()=>clearFilters();$('#close-detail').onclick=closeDetail;$('#map-mode').onchange=renderMap;$('#fit').onclick=homeView;$('#map-view').onclick=()=>changeView('map');$('#table-view').onclick=()=>changeView('table');$('#export').onclick=exportCSV;$('#source-button').onclick=()=>$('#source-dialog').showModal();$('#close-source').onclick=()=>$('#source-dialog').close();$('#mobile-map').onclick=()=>{changeView('map');map?.resize();};$('#mobile-list').onclick=()=>{document.body.classList.add('mobile-list');$('#mobile-list').setAttribute('aria-pressed','true');$('#mobile-map').setAttribute('aria-pressed','false');};$('#mobile-filter').onclick=()=>document.body.classList.add('filters-open');$('#close-filters').onclick=$('#apply-filters').onclick=()=>{document.body.classList.remove('filters-open');map?.resize();};document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDetail();document.body.classList.remove('filters-open');}if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('#search').focus();}});await loadMap();
  }catch(e){$('#unit-list').innerHTML='<p class="empty">資料無法載入。請透過本機預覽網址開啟，或稍後重新整理。</p>';$('#version').textContent='資料載入失敗';notice('資料未載入，請重新整理。');console.error(e);}
}
init();
