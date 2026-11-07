/* Карта демонстрирует примеры и локальные наблюдения, а не подтверждённые подтопления. */
const $ = id => document.getElementById(id);
const labels = {0:'Уровень не указан',1:'Большая лужа',2:'Проезд затруднён',3:'Сильное подтопление'};
const colors = {0:'#728993',1:'#e8be4e',2:'#e99550',3:'#dc6a60'};
const storageKey = 'aktau-water-observations-v1', cacheKey = 'aktau-water-addresses-v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function saveStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { notify('Не удалось сохранить данные: проверьте доступ к хранилищу и размер фото.'); return false; } }
let cache = readStorage(cacheKey, {}); if (!cache || Array.isArray(cache) || typeof cache !== 'object') cache = {};
let personal = readStorage(storageKey, []); if (!Array.isArray(personal)) personal = [];
let examples = Array.isArray(window.EXAMPLE_POINTS) ? window.EXAMPLE_POINTS : [];
let points = [], markers = new Map(), adding = false, chosen = null, requestQueue = Promise.resolve(), lastRequest = 0;
const bounds = L.latLngBounds([43.60,51.10],[43.73,51.29]);
const map = L.map('map', {maxBounds:bounds,maxBoundsViscosity:1,zoomControl:true}).setView([43.6532,51.1975],12);
// Подложки Esri: при отсутствии библиотеки используем прямые адреса тайлов.
function watchTiles(layer, name) {
 let loaded = 0, failed = 0;
 layer.on('loading', () => { loaded = 0; failed = 0; });
 layer.on('tileload', () => { loaded++; });
 layer.on('tileerror', () => { failed++; });
 layer.on('load', () => {
  if (failed > 0 && loaded === 0 && map.hasLayer(layer)) {
   notify(`Не удалось загрузить карту «${name}». Попробуйте другой слой.`);
  }
 });
}
let streets, imagery, satellite;
if (L.esri) {
 streets = L.esri.basemapLayer('Streets', {maxZoom:20});
 imagery = L.esri.basemapLayer('Imagery', {maxZoom:20});
 satellite = L.layerGroup([imagery, L.esri.basemapLayer('ImageryLabels', {maxZoom:20})]);
} else {
 const attribution = 'Tiles © Esri — Esri, HERE, Garmin, USGS and contributors';
 streets = L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {maxZoom:20, attribution});
 imagery = L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:20, attribution});
 satellite = imagery;
}
watchTiles(streets, 'Улицы Esri'); watchTiles(imagery, 'Спутник Esri');
const baseLayers = {'Улицы · Esri': streets, 'Спутник · Esri': satellite};
streets.addTo(map);
L.control.layers(baseLayers, null, {position:'topright', collapsed:false}).addTo(map);
const cluster = L.markerClusterGroup({showCoverageOnHover:false}); map.addLayer(cluster);
let statusTimer; function notify(message) { const e=$('status'); e.textContent=message;e.classList.add('show');clearTimeout(statusTimer);statusTimer=setTimeout(()=>e.classList.remove('show'),5000); }
const coords = p => `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`;
const keyFor = p => `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;
function formatAddress(data, p) {
 const a=data.address || {}; const road=a.road || a.pedestrian || a.footway || a.path || a.street || a.square || '';
 const district=[a.neighbourhood,a.suburb,a.quarter,a.city_district,a.residential].filter(Boolean).find(x=>/мкр|микрорайон|microdistrict/i.test(x)) || a.neighbourhood || a.suburb || '';
 const parts=[]; if(road) parts.push(road); if(a.house_number) parts.push(`дом ${a.house_number}`); if(district && !parts.some(x=>x.toLowerCase()===district.toLowerCase())) parts.push(district); parts.push('Актау');
 if (!a.house_number) parts.push(coords(p)); return parts.join(', ');
}
// Очередь ограничивает начало запросов одним в секунду во всей вкладке.
function reverse(p) {
 const key=keyFor(p); if(cache[key]) return Promise.resolve(cache[key]);
 const task=requestQueue.then(async()=>{if(cache[key]) return cache[key];const wait=Math.max(0,1100-(Date.now()-lastRequest));if(wait) await new Promise(r=>setTimeout(r,wait));lastRequest=Date.now();
 try { const url=new URL('https://nominatim.openstreetmap.org/reverse');Object.entries({format:'jsonv2',lat:p.lat,lon:p.lng,'accept-language':'ru',addressdetails:'1',application:'aktau-water-map-demo'}).forEach(([k,v])=>url.searchParams.set(k,v)); const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000); let response;try{response=await fetch(url,{signal:controller.signal,headers:{'Accept':'application/json'}});}finally{clearTimeout(timer);}if(!response.ok) throw Error('HTTP '+response.status);const data=await response.json();if(data.error || !data.address) throw Error('Нет адреса');const value=formatAddress(data,p);cache[key]=value;saveStorage(cacheKey,cache);return value; } catch {return `Адрес временно недоступен · ${coords(p)}`;} });
 requestQueue=task.catch(()=>{});return task;
}
function addressOf(p) { return p.address || cache[keyFor(p)] || ''; }
function allPoints() { return [...examples,...personal]; }
const isExample = p => p.source === 'example';
function popup(p) {const address=addressOf(p) || (isExample(p) ? `Тестовые координаты: ${coords(p)}` : 'Определяем адрес…');const photo=p.photo && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(p.photo) ? `<img class="popup-photo" src="${esc(p.photo)}" alt="Фото наблюдения">` : '';return `${isExample(p) ? '<div class="example-badge">ТЕСТОВАЯ ТОЧКА · ВЫМЫШЛЕНА</div>' : ''}<div class="popup-title">${esc(p.name)}</div><div class="popup-level" style="color:${colors[p.severity]}">● ${labels[p.severity]}</div><p class="popup-description">${esc(p.description)}</p>${p.date ? `<p class="popup-description">Дата наблюдения: ${esc(p.date)}</p>`:''}${photo}${p.precision === 'approximate' ? '<p class="popup-precision">Маркер показывает ориентир, а не точное место затопления. Историческое сообщение; текущая обстановка неизвестна.</p>' : ''}<div class="popup-address"><b>Адрес</b><br><span class="address-text">${esc(address)}</span></div>${p.source && /^https?:\/\//i.test(p.source) ? `<div class="popup-source"><a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">Источник сообщения ↗</a>${p.locationSource ? ` · <a href="${esc(p.locationSource)}" target="_blank" rel="noopener noreferrer">Источник координат ↗</a>` : ''}</div>` : ''}<div class="popup-actions"><button type="button" class="copy-address">Копировать адрес</button><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${p.lat}%2C${p.lng}">Google Maps ↗</a><a target="_blank" rel="noopener noreferrer" href="https://2gis.kz/geo/${p.lng}%2C${p.lat}">2ГИС ↗</a></div>`;}
function attachPopup(marker,p) {marker.bindPopup(popup(p));marker.on('popupopen', async e=>{const node=e.popup.getElement();const button=node.querySelector('.copy-address');button.onclick=async()=>{const value=addressOf(p) || (isExample(p) ? `Тестовые координаты: ${coords(p)}` : `Адрес временно недоступен · ${coords(p)}`);try{await navigator.clipboard.writeText(value);notify('Адрес скопирован');}catch{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();try{if(!document.execCommand('copy'))throw Error();notify('Адрес скопирован');}catch{notify('Не удалось скопировать адрес');}area.remove();}};if(!addressOf(p) && !isExample(p)){const address=await reverse(p);if(e.popup.isOpen()){node.querySelector('.address-text').textContent=address;e.popup.update();}renderList();}});}
function renderList(){const query=$('search').value.trim().toLowerCase(), filter=$('filter').value;const shown=points.filter(p=>(filter==='all'||String(p.severity)===filter)&&`${p.name} ${addressOf(p)}`.toLowerCase().includes(query));$('count').textContent=shown.length;const list=$('point-list');list.innerHTML='';if(!shown.length){list.innerHTML='<div class="empty">Места не найдены. Попробуйте изменить поиск или фильтр.</div>';return;}shown.forEach((p,i)=>{const item=document.createElement('button');item.className='point-card';item.innerHTML=`<span class="point-number">${String(i+1).padStart(2,'0')}</span><span class="point-content"><span class="point-title">${esc(p.name)}${isExample(p) ? ' <b class="list-example">ТЕСТ</b>' : ''}</span><span class="point-address">${esc(addressOf(p)||coords(p))}</span></span><span class="point-level"><i class="dot s${p.severity}"></i>${labels[p.severity]}</span>`;item.onclick=()=>{const marker=markers.get(p);cluster.zoomToShowLayer(marker,()=>{map.setView(marker.getLatLng(),Math.max(map.getZoom(),16));marker.openPopup();});};list.append(item);});}
function refresh(){points=allPoints().filter(p => $('show-examples').checked || !isExample(p));cluster.clearLayers();markers.clear();points.forEach(p=>{const icon=L.divIcon({className:'map-marker',html:'',iconSize:[26,26],iconAnchor:[13,25]});const marker=L.marker([p.lat,p.lng],{icon});marker.on('add',()=>{const el=marker.getElement();if(el)el.style.background=isExample(p)?'#4b81b7':colors[p.severity];});attachPopup(marker,p);markers.set(p,marker);cluster.addLayer(marker);});renderList();}
$('show-examples').onchange=refresh; $('search').oninput=renderList;$('filter').onchange=renderList;
$('locate').onclick=()=>{if(!navigator.geolocation){notify('Геолокация недоступна в этом браузере');return;}notify('Определяем ваше местоположение…');navigator.geolocation.getCurrentPosition(pos=>{const latlng=L.latLng(pos.coords.latitude,pos.coords.longitude);if(!bounds.contains(latlng)){notify('Вы находитесь за пределами карты Актау');return;}L.circleMarker(latlng,{radius:8,color:'#fff',weight:3,fillColor:'#2b8376',fillOpacity:1}).addTo(map).bindPopup('Ваше местоположение').openPopup();map.setView(latlng,16);},()=>notify('Не удалось определить местоположение. Проверьте разрешения браузера.'),{timeout:12000});};
$('add').onclick=()=>{adding=!adding;$('add').innerHTML=adding?'× <span>Отменить выбор</span>':'＋ <span>Добавить место</span>';$('map-hint').textContent=adding?'Нажмите на карту, чтобы выбрать место':'Нажмите на маркер, чтобы узнать подробности ↗';map.getContainer().style.cursor=adding?'crosshair':'';};
map.on('click',async e=>{if(!adding)return;$('add').click();chosen={lat:e.latlng.lat,lng:e.latlng.lng};$('point-form').reset();$('point-form').elements.date.value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);$('form-address').textContent='Определяем адрес…';$('point-dialog').showModal();const current=chosen;const address=await reverse(current);if(chosen===current) $('form-address').textContent=address;});
$('close-dialog').onclick=()=>$('point-dialog').close();
$('point-form').onsubmit=async e=>{e.preventDefault();if(!chosen)return;const form=e.currentTarget;const file=form.elements.photo.files[0];if(file && file.size>1500000){notify('Выберите фото размером до 1,5 МБ');return;}let photo='';if(file){try{photo=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}catch{notify('Не удалось прочитать фото');return;}}const p={id:Date.now()+'-'+Math.random().toString(36).slice(2,7),name:form.elements.name.value.trim(),lat:chosen.lat,lng:chosen.lng,severity:Number(form.elements.severity.value),address:addressOf(chosen),description:form.elements.description.value.trim(),source:'user',date:form.elements.date.value,...(photo?{photo}:{})};if(!p.name||!p.description){notify('Заполните название и описание');return;}const updated=[...personal,p];if(!saveStorage(storageKey,updated))return;personal=updated;refresh();$('point-dialog').close();notify('Место сохранено в этом браузере');};
$('export').onclick=()=>{try{const blob=new Blob([JSON.stringify(allPoints(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='aktau-water-points.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{notify('Не удалось экспортировать данные');}};
$('import').onclick=()=>$('import-file').click();$('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse((await file.text()).replace(/^\uFEFF/, ''));if(!Array.isArray(data))throw Error();const valid=data.every(p=>p&&typeof p.name==='string'&&p.name.trim()&&typeof p.description==='string'&&typeof p.lat==='number'&&typeof p.lng==='number'&&bounds.contains([p.lat,p.lng])&&[0,1,2,3].includes(Number(p.severity))&&(!p.photo||typeof p.photo==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,/i.test(p.photo)));if(!valid)throw Error();const existing=new Set(allPoints().map(p=>String(p.id)));const incoming=data.filter(p=>p.source!=='example'&&!existing.has(String(p.id))).map(p=>({...p,id:p.id??Date.now()+Math.random(),severity:Number(p.severity),address:typeof p.address==='string'?p.address:'',source:'user'}));if(!saveStorage(storageKey,[...personal,...incoming]))return;personal.push(...incoming);refresh();notify(`Импортировано мест: ${incoming.length}`);}catch{notify('Ошибка импорта: проверьте формат JSON и координаты точек');}finally{e.target.value='';}};
refresh();

// На HTTP используем JSON как основной источник; при file:// работает локальная копия.
if (location.protocol === 'http:' || location.protocol === 'https:') {
 fetch('data/points.json?v=127-20261107', {cache:'no-store'}).then(r => { if (!r.ok) throw Error('HTTP ' + r.status); return r.text(); })
  .then(text => JSON.parse(text.replace(/^\uFEFF/, '')))
  .then(data => { if (!Array.isArray(data)) throw Error('Ожидается массив точек'); examples = data; refresh(); })
  .catch(error => { console.warn('Не удалось прочитать data/points.json:', error); notify('Файл точек недоступен. Показана резервная копия.'); });
}


