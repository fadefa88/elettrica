(function(){
  const STYLE_ID = 'motornetRuntimeChipStyles';
  const RUNTIME_CLASS = 'motornet-runtime-spec-chips';

  function byId(id){ return document.getElementById(id); }
  function text(value){ return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim(); }
  function norm(value){ return text(value).toLowerCase(); }
  function parseNumber(value){
    if(value === null || value === undefined) return undefined;
    const m = String(value).replace(/\s+/g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    if(!m) return undefined;
    const n = Number(m[0]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  function round1(n){ return Math.round(Number(n) * 10) / 10; }
  function validKwh100(value){ const n = parseNumber(value); return n && n >= 5 && n <= 60 ? round1(n) : undefined; }
  function validRange(value){ const n = parseNumber(value); return n && n >= 30 && n <= 1500 ? Math.round(n) : undefined; }
  function validBattery(value){ const n = parseNumber(value); return n && n >= 5 && n <= 250 ? round1(n) : undefined; }

  function specEntries(car){
    const out = [];
    const seen = new Set();
    function add(key, value){
      const k = text(key);
      const v = text(value);
      if(!k || !v || v === '[object Object]') return;
      const sig = k + '\u0000' + v;
      if(seen.has(sig)) return;
      seen.add(sig);
      out.push([k, v]);
    }
    function walk(node, path){
      if(node === null || node === undefined) return;
      if(typeof node !== 'object'){
        add(path.join(' '), node);
        if(path.length) add(path[path.length - 1], node);
        return;
      }
      if(Array.isArray(node)){
        node.forEach(item => walk(item, path));
        return;
      }
      const label = node.label || node.name || node.key || node.title;
      const value = node.value || node.val || node.text;
      if(label !== undefined && value !== undefined){
        add(path.concat([label]).join(' '), value);
        add(label, value);
      }
      Object.entries(node).forEach(([key, value]) => {
        if(['label','name','key','title','value','val','text'].includes(key) && typeof value !== 'object') return;
        if(value && typeof value === 'object') walk(value, path.concat([key]));
        else {
          add(path.concat([key]).join(' '), value);
          add(key, value);
        }
      });
    }
    if(car && car.specs_raw && typeof car.specs_raw === 'object') walk(car.specs_raw, []);
    return out;
  }

  function fieldText(car){
    if(!car) return '';
    return [
      car.display_name, car.title, car.name, car.brand, car.model,
      car.version, car.powertrain, car.motor, car.fuel_original
    ].map(text).filter(Boolean).join(' · ');
  }

  function kwh100FromCar(car){
    const direct = validKwh100(car && car.consumption_kwh_100km);
    if(direct) return direct;
    for(const [key, value] of specEntries(car)){
      const k = norm(key);
      const joined = norm(key + ' ' + value);
      if(/max/.test(k) || /max/.test(joined)) continue;
      if(/kw\/?h\s*100\s*km/i.test(k) || /kwh\s*\/\s*100\s*km/i.test(k) || /kwh\s*100\s*km/i.test(k) || /consumo.*elettric.*combinato/i.test(k) || /consumo.*combinato/i.test(k) || /k\s*w\s*h\s*\/?\s*100\s*km/i.test(joined)){
        const n = validKwh100(value) || validKwh100(joined);
        if(n) return n;
      }
    }
    return undefined;
  }

  function rangeFromCar(car){
    const direct = validRange(car && car.range_wltp_km);
    if(direct) return direct;
    for(const [key, value] of specEntries(car)){
      const k = norm(key);
      if(/urbano/.test(k) || /max/.test(k)) continue;
      if(/autonomia.*solo.*elettric.*combinato/i.test(k) || /autonomia.*elettric.*combinato/i.test(k) || /autonomia.*wltp.*combinato/i.test(k) || /autonomia.*combinato/i.test(k) || /^autonomia\s+wltp/i.test(k) || /autonomia.*solo.*elettric/i.test(k) || /autonomia.*elettric/i.test(k) || /^autonomia\b/i.test(k)){
        const n = validRange(value);
        if(n) return n;
      }
    }
    return undefined;
  }

  function batteryFromNameOrSpecs(car){
    const direct = validBattery(car && car.battery_kwh);
    if(direct) return direct;
    for(const [key, value] of specEntries(car)){
      const k = norm(key);
      if(/capac.*batter/i.test(k) || /cap\.?\s*batter/i.test(k) || /batter.*capac/i.test(k) || /^batteria$/i.test(k) || /batteria.*kwh/i.test(k) || /batteria.*utile/i.test(k) || /batteria.*netta/i.test(k) || /batteria.*lorda/i.test(k) || /accumulatore/i.test(k) || /capac.*accumulator/i.test(k) || /energia.*batter/i.test(k) || /battery.*capacity/i.test(k)){
        const n = validBattery(value);
        if(n) return n;
      }
    }
    const cleaned = fieldText(car).replace(/\d+(?:[\.,]\d+)?\s*k\s*w\s*h\s*\/?\s*100\s*km/gi, ' ');
    const matches = cleaned.matchAll(/(?:^|[^\d])([1-9]\d{0,2}(?:[\.,]\d{1,2})?)\s*k\s*w\s*h\b/gi);
    for(const match of matches){
      const n = validBattery(match[1]);
      if(n) return n;
    }
    return undefined;
  }

  function enrichEv(car){
    if(!car || typeof car !== 'object') return car;
    const fuel = norm(car.fuel || car.fuel_original || car.category);
    const isEv = fuel.includes('elettr') || fuel === 'electric';
    if(!isEv) return car;

    const kwh = kwh100FromCar(car);
    const range = rangeFromCar(car);
    let battery = batteryFromNameOrSpecs(car);

    if(!battery && range && kwh) battery = validBattery(range * kwh / 100);
    if(kwh) car.consumption_kwh_100km = kwh;
    if(range) car.range_wltp_km = range;
    if(battery) car.battery_kwh = battery;
    return car;
  }

  function selectedEvSafe(){
    try {
      if(typeof selectedEv === 'function') return enrichEv(selectedEv());
    } catch(e) {}
    try {
      const id = byId('evSelect')?.value;
      if(id && Array.isArray(EV)) return enrichEv(EV.find(c => c && c.id === id));
    } catch(e) {}
    return null;
  }

  function enrichAllEv(){
    try { if(Array.isArray(EV)) EV.forEach(enrichEv); } catch(e) {}
  }

  function fmt(n){ return Number(n).toLocaleString('it-IT', { maximumFractionDigits: 1 }); }

  function ensureStyles(){
    if(byId(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.motornet-spec-chips,.motornet-runtime-spec-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.motornet-spec-chips span,.motornet-runtime-spec-chips span{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:rgba(8,55,39,.08);border:1px solid rgba(8,55,39,.12);font-weight:800;font-size:.82rem;color:#083727}.motornet-spec-chips i,.motornet-runtime-spec-chips i{font-size:.8rem}@media(max-width:760px){.motornet-spec-chips,.motornet-runtime-spec-chips{gap:6px}.motornet-spec-chips span,.motornet-runtime-spec-chips span{font-size:.78rem;padding:6px 9px}}';
    document.head.appendChild(style);
  }

  function renderRuntimeChips(){
    ensureStyles();
    const car = selectedEvSafe();
    const box = byId('evVisual');
    if(!box || !car) return;
    box.querySelectorAll('.' + RUNTIME_CLASS).forEach(el => el.remove());

    const existing = norm(box.textContent);
    const chips = [];
    const kwh = validKwh100(car.consumption_kwh_100km) || kwh100FromCar(car);
    const range = validRange(car.range_wltp_km) || rangeFromCar(car);
    const battery = validBattery(car.battery_kwh) || batteryFromNameOrSpecs(car) || (range && kwh ? validBattery(range * kwh / 100) : undefined);

    if(kwh && !existing.includes('kwh/100')) chips.push('<span><i class="fa-solid fa-bolt"></i> '+fmt(kwh)+' kWh/100 km</span>');
    if(range && !existing.includes('wltp')) chips.push('<span><i class="fa-solid fa-road"></i> '+fmt(range)+' km WLTP</span>');
    if(battery && !existing.includes('batteria')) chips.push('<span><i class="fa-solid fa-car-battery"></i> '+fmt(battery)+' kWh batteria</span>');
    if(!chips.length) return;

    const target = box.children && box.children.length ? box.children[box.children.length - 1] : box;
    target.insertAdjacentHTML('beforeend', '<div class="'+RUNTIME_CLASS+'">'+chips.join('')+'</div>');
  }

  function patchCalculation(){
    if(window.__motornetEvCalculationGuardPatched) return;
    window.__motornetEvCalculationGuardPatched = true;

    try {
      const originalSelectedEv = selectedEv;
      selectedEv = function(){ return enrichEv(originalSelectedEv()); };
    } catch(e) {}

    try {
      const originalCalculate = calculate;
      calculate = function(){
        enrichAllEv();
        selectedEvSafe();
        const ret = originalCalculate.apply(this, arguments);
        setTimeout(renderRuntimeChips, 0);
        return ret;
      };
    } catch(e) {}

    try {
      const originalSetAutoFields = setAutoFields;
      setAutoFields = function(){
        enrichAllEv();
        selectedEvSafe();
        const ret = originalSetAutoFields.apply(this, arguments);
        setTimeout(renderRuntimeChips, 0);
        return ret;
      };
    } catch(e) {}

    try {
      const originalRenderCarVisual = renderCarVisual;
      renderCarVisual = function(id, car, type){
        if(type === 'ev') enrichEv(car);
        const ret = originalRenderCarVisual.apply(this, arguments);
        if(type === 'ev') setTimeout(renderRuntimeChips, 0);
        return ret;
      };
    } catch(e) {}
  }

  function run(){
    patchCalculation();
    enrichAllEv();
    selectedEvSafe();
    renderRuntimeChips();
    try { if(typeof calculate === 'function') calculate(); } catch(e) {}
  }

  patchCalculation();
  window.addEventListener('DOMContentLoaded', () => setTimeout(run, 200));
  window.addEventListener('load', () => {
    setTimeout(run, 1000);
    setTimeout(run, 2500);
    setTimeout(run, 5000);
  });
})();