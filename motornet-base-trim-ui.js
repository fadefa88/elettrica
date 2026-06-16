(function(){
  const POLL_MS = 500;
  const MAX_POLLS = 30;
  let installed = false;

  function byId(id){ return document.getElementById(id); }
  function clean(value){ return String(value || '').replace(/\bundefined\b/gi, '').replace(/\s+/g, ' ').trim(); }
  function esc(value){ return clean(value).replace(/"/g, '&quot;'); }
  function money(value){
    const n = Number(value || 0);
    return n > 0 ? new Intl.NumberFormat('it-IT', {style:'currency', currency:'EUR', maximumFractionDigits:0}).format(n) : '';
  }
  function fuelLabelLocal(fuel){
    try { if(typeof fuelLabel === 'function') return fuelLabel(fuel); } catch(e) {}
    return ({benzina:'Benzina', diesel:'Diesel', gasolio:'Diesel', gpl:'GPL', metano:'Metano', elettrica:'Elettrica', elettrica_idrogeno:'Elettrica a idrogeno', ibrida_benzina:'Ibrida benzina', ibrida_diesel:'Ibrida diesel', ibrida_gpl:'Ibrida GPL', ibrida_metano:'Ibrida metano'}[fuel] || fuel || '');
  }
  function modelId(car){
    const text = [car && car.source_url, car && car.motornet_detail_url].join(' ');
    const m = text.match(/\/modello\/(\d+)/i);
    if(m) return m[1];
    return clean([car && car.brand, car && car.model].join('|')).toLowerCase();
  }
  function trimCode(car){
    const text = [car && car.source_url, car && car.motornet_detail_url].join(' ');
    const m = text.match(/\/allestimento\/([A-Z0-9]+)/i);
    return m ? m[1].toUpperCase() : clean(car && car.id);
  }
  function words(text){ return clean(text).split(' ').filter(Boolean); }
  function commonPrefix(models){
    const lists = models.map(words).filter(a => a.length);
    if(!lists.length) return '';
    const out = [];
    for(let i=0; i<lists[0].length; i++){
      const w = lists[0][i];
      if(lists.every(a => clean(a[i]).toLowerCase() === clean(w).toLowerCase())) out.push(w);
      else break;
    }
    return clean(out.join(' '));
  }
  function modelText(car){
    const brand = clean(car && car.brand);
    let model = clean(car && car.model);
    if(brand && model.toLowerCase().startsWith(brand.toLowerCase() + ' ')) model = clean(model.slice(brand.length));
    return model || clean(car && car.version) || clean(car && car.powertrain) || 'Modello Motornet';
  }
  function groupLabel(cars){
    const models = cars.map(modelText).filter(Boolean);
    if(cars.length > 1){
      const prefix = commonPrefix(models);
      if(prefix) return prefix;
    }
    return models[0] || 'Modello Motornet';
  }
  function suffixLabel(car, baseLabel){
    const model = modelText(car);
    let suffix = model;
    const b = clean(baseLabel);
    if(b && suffix.toLowerCase().startsWith(b.toLowerCase())) suffix = clean(suffix.slice(b.length));
    if(!suffix) suffix = clean(car.version || car.powertrain || trimCode(car));
    if(b && suffix.toLowerCase().startsWith(b.toLowerCase())) suffix = clean(suffix.slice(b.length));
    if(!suffix || suffix.toLowerCase() === clean(car.brand).toLowerCase()) suffix = 'Allestimento base';
    const parts = [suffix];
    if(car.fuel) parts.push(fuelLabelLocal(car.fuel));
    if(car.year) parts.push(String(car.year));
    const p = money(car.price_eur || car.price);
    if(p) parts.push(p);
    return parts.filter(Boolean).join(' · ');
  }
  function carLabel(car){
    const brand = clean(car && car.brand);
    const model = modelText(car);
    if(!brand) return model;
    if(model.toLowerCase() === brand.toLowerCase()) return brand;
    if(model.toLowerCase().startsWith(brand.toLowerCase() + ' ')) return model;
    return clean(brand + ' ' + model);
  }
  function filterEv(){
    const fuel = byId('evFuelPick')?.value || 'elettrica';
    const brand = byId('evBrandPick')?.value || 'all';
    return (Array.isArray(EV) ? EV : []).filter(c => (c.fuel === fuel) && (brand === 'all' || c.brand === brand));
  }
  function filterIce(){
    const fuel = byId('iceFuelPick')?.value || 'all';
    const brand = byId('iceBrandPick')?.value || 'all';
    return (Array.isArray(IC) ? IC : []).filter(c => (fuel === 'all' || c.fuel === fuel) && (brand === 'all' || c.brand === brand));
  }
  function buildGroups(cars){
    const map = new Map();
    cars.forEach(car => {
      const key = modelId(car);
      if(!map.has(key)) map.set(key, {key, cars: []});
      map.get(key).cars.push(car);
    });
    const groups = Array.from(map.values()).map(g => {
      g.cars.sort((a,b) => (Number(a.price_eur||0) - Number(b.price_eur||0)) || clean(a.model).localeCompare(clean(b.model), 'it'));
      g.label = groupLabel(g.cars);
      return g;
    });
    groups.sort((a,b) => a.label.localeCompare(b.label, 'it'));
    return groups;
  }
  function ensureSelect(oldSelectId, baseId, trimId, baseText, trimText, full){
    const old = byId(oldSelectId);
    if(!old || byId(baseId) || byId(trimId)) return;
    const oldLabel = old.closest('label');
    if(oldLabel) oldLabel.style.display = 'none';
    old.style.display = 'none';
    const baseLabel = document.createElement('label');
    baseLabel.className = full ? 'full' : '';
    baseLabel.innerHTML = baseText + '<select id="'+baseId+'"></select>';
    const trimLabel = document.createElement('label');
    trimLabel.className = full ? 'full' : '';
    trimLabel.innerHTML = trimText + '<select id="'+trimId+'"></select>';
    const anchor = oldLabel || old;
    anchor.parentNode.insertBefore(baseLabel, anchor.nextSibling);
    baseLabel.parentNode.insertBefore(trimLabel, baseLabel.nextSibling);
  }
  function setHiddenSelection(hiddenId, carId){
    const hidden = byId(hiddenId);
    if(!hidden) return;
    hidden.innerHTML = carId ? '<option value="'+esc(carId)+'" selected>'+esc(carId)+'</option>' : '<option value=""></option>';
    hidden.value = carId || '';
  }
  function fillBase(kind){
    const isEv = kind === 'ev';
    const cars = isEv ? filterEv() : filterIce();
    const base = byId(isEv ? 'evBaseSelect' : 'iceBaseSelect');
    const trim = byId(isEv ? 'evTrimSelect' : 'iceTrimSelect');
    const hidden = byId(isEv ? 'evSelect' : 'iceSelect');
    const hint = byId(isEv ? 'evChoiceHint' : 'iceChoiceHint');
    if(!base || !trim || !hidden) return;

    const currentCarId = hidden.value || '';
    const groups = buildGroups(cars);
    let currentGroupKey = groups.find(g => g.cars.some(c => c.id === currentCarId))?.key || '';
    base.innerHTML = '<option value="">Seleziona modello base</option>' + groups.map(g => '<option value="'+esc(g.key)+'">'+esc(g.label)+' ('+g.cars.length+' all.)</option>').join('');
    if(!currentGroupKey && groups.length === 1) currentGroupKey = groups[0].key;
    base.value = groups.some(g => g.key === currentGroupKey) ? currentGroupKey : '';
    fillTrim(kind, false);
    if(hint) hint.textContent = groups.length ? '' : 'Nessuna auto Motornet disponibile per questo filtro.';
  }
  function fillTrim(kind, resetSelection){
    const isEv = kind === 'ev';
    const cars = isEv ? filterEv() : filterIce();
    const base = byId(isEv ? 'evBaseSelect' : 'iceBaseSelect');
    const trim = byId(isEv ? 'evTrimSelect' : 'iceTrimSelect');
    const hiddenId = isEv ? 'evSelect' : 'iceSelect';
    const hidden = byId(hiddenId);
    if(!base || !trim || !hidden) return;
    const groups = buildGroups(cars);
    const group = groups.find(g => g.key === base.value);
    const current = resetSelection ? '' : hidden.value;
    if(!group){
      trim.innerHTML = '<option value="">Prima scegli il modello base</option>';
      setHiddenSelection(hiddenId, '');
      runAfterSelection();
      return;
    }
    trim.innerHTML = '<option value="">Seleziona allestimento</option>' + group.cars.map(c => '<option value="'+esc(c.id)+'">'+esc(suffixLabel(c, group.label))+'</option>').join('');
    let next = group.cars.some(c => c.id === current) ? current : '';
    if(!next && group.cars.length === 1) next = group.cars[0].id;
    trim.value = next;
    setHiddenSelection(hiddenId, next);
    runAfterSelection();
  }
  function runAfterSelection(){
    if(typeof setAutoFields === 'function') setAutoFields();
    if(typeof calculate === 'function') calculate();
    if(typeof updateNavigation === 'function') updateNavigation();
  }
  function syncManual(){
    const evOn = !!byId('manualEvMode')?.checked;
    const iceOn = !!byId('manualIceMode')?.checked;
    ['evBaseSelect','evTrimSelect'].forEach(id => { const el = byId(id); if(el) el.disabled = evOn; });
    ['iceBaseSelect','iceTrimSelect'].forEach(id => { const el = byId(id); if(el) el.disabled = iceOn; });
  }
  function wire(){
    ensureSelect('evSelect', 'evBaseSelect', 'evTrimSelect', 'Modello base elettrica', 'Allestimento elettrica', false);
    ensureSelect('iceSelect', 'iceBaseSelect', 'iceTrimSelect', 'Modello base termica', 'Allestimento termica', true);

    const evBase = byId('evBaseSelect');
    const evTrim = byId('evTrimSelect');
    const iceBase = byId('iceBaseSelect');
    const iceTrim = byId('iceTrimSelect');
    if(evBase && !evBase.__baseTrimBound){ evBase.oninput = () => fillTrim('ev', true); evBase.__baseTrimBound = true; }
    if(evTrim && !evTrim.__baseTrimBound){ evTrim.oninput = () => { setHiddenSelection('evSelect', evTrim.value); runAfterSelection(); }; evTrim.__baseTrimBound = true; }
    if(iceBase && !iceBase.__baseTrimBound){ iceBase.oninput = () => fillTrim('ice', true); iceBase.__baseTrimBound = true; }
    if(iceTrim && !iceTrim.__baseTrimBound){ iceTrim.oninput = () => { setHiddenSelection('iceSelect', iceTrim.value); runAfterSelection(); }; iceTrim.__baseTrimBound = true; }

    try {
      fillEvSelect = function(){ fillBase('ev'); };
      fillIceSelect = function(){ fillBase('ice'); };
    } catch(e) {}

    const evBrand = byId('evBrandPick');
    if(evBrand) evBrand.oninput = function(){ if(typeof fillEvSelect === 'function') fillEvSelect(); };
    const evFuel = byId('evFuelPick');
    if(evFuel) evFuel.onchange = function(){ if(typeof fillEvBrands === 'function') fillEvBrands(); if(typeof fillEvSelect === 'function') fillEvSelect(); };
    ['iceFuelPick','iceBrandPick'].forEach(id => {
      const el = byId(id);
      if(el) el.oninput = function(){ if(typeof fillIceSelect === 'function') fillIceSelect(); };
    });
    ['manualEvMode','manualIceMode'].forEach(id => {
      const el = byId(id);
      if(el && !el.__baseTrimManualBound){ el.addEventListener('input', syncManual); el.__baseTrimManualBound = true; }
    });
    syncManual();
  }
  function init(){
    if(typeof EV === 'undefined' || typeof IC === 'undefined') return false;
    if(!byId('evSelect') || !byId('iceSelect')) return false;
    wire();
    if(typeof fillEvSelect === 'function') fillEvSelect();
    if(typeof fillIceSelect === 'function') fillIceSelect();
    installed = true;
    return true;
  }
  window.addEventListener('load', function(){
    let n = 0;
    const timer = setInterval(function(){
      n += 1;
      init();
      if(installed && n > 5) clearInterval(timer);
      if(n >= MAX_POLLS) clearInterval(timer);
    }, POLL_MS);
  });
})();
