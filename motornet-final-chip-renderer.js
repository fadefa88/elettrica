(function(){
  const STYLE_ID = 'motornetFinalChipRendererStyles';
  let rendering = false;

  function byId(id){ return document.getElementById(id); }
  function txt(value){ return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim(); }
  function norm(value){ return txt(value).toLowerCase(); }
  function num(value){
    if(value === null || value === undefined) return undefined;
    const m = String(value).replace(/\s+/g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    if(!m) return undefined;
    const n = Number(m[0]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  function round1(value){ return Math.round(Number(value) * 10) / 10; }
  function fmt(value){ return Number(value).toLocaleString('it-IT', { maximumFractionDigits: 1 }); }
  function validKwh100(value){ const n = num(value); return n && n >= 5 && n <= 60 ? round1(n) : undefined; }
  function validRange(value){ const n = num(value); return n && n >= 30 && n <= 1500 ? Math.round(n) : undefined; }
  function validBattery(value){ const n = num(value); return n && n >= 5 && n <= 250 ? round1(n) : undefined; }

  function isObject(value){ return value && typeof value === 'object'; }
  function specEntries(car){
    const out = [];
    const seen = new Set();
    function add(key, value){
      const k = txt(key);
      const v = txt(value);
      if(!k || !v || v === '[object Object]') return;
      const sig = k + '\u0000' + v;
      if(seen.has(sig)) return;
      seen.add(sig);
      out.push([k, v]);
    }
    function walk(node, path){
      if(node === null || node === undefined) return;
      if(!isObject(node)){ add(path.join(' '), node); return; }
      if(Array.isArray(node)){ node.forEach(item => walk(item, path)); return; }
      const label = node.label || node.name || node.key || node.title;
      const value = node.value || node.val || node.text;
      if(label !== undefined && value !== undefined) add(path.concat([label]).join(' '), value);
      Object.entries(node).forEach(([key, value]) => {
        if(['label','name','key','title','value','val','text'].includes(key) && !isObject(value)) return;
        if(isObject(value)) walk(value, path.concat([key]));
        else { add(path.concat([key]).join(' '), value); add(key, value); }
      });
    }
    if(car && isObject(car.specs_raw)) walk(car.specs_raw, []);
    return out;
  }
  function specValue(car, matchers, excludes){
    for(const [key, value] of specEntries(car)){
      const k = norm(key);
      if(excludes && excludes.some(rx => rx.test(k))) continue;
      if(matchers.some(rx => rx.test(k))) return value;
    }
    return undefined;
  }
  function textBattery(car){
    const text = [car && car.display_name, car && car.name, car && car.title, car && car.brand, car && car.model, car && car.version, car && car.powertrain].map(txt).join(' · ');
    const cleaned = text.replace(/\d+(?:[\.,]\d+)?\s*k\s*w\s*h\s*\/?\s*100\s*km/gi, ' ');
    const matches = cleaned.matchAll(/(?:^|[^\d])([1-9]\d{0,2}(?:[\.,]\d{1,2})?)\s*k\s*w\s*h\b/gi);
    for(const match of matches){
      const b = validBattery(match[1]);
      if(b) return b;
    }
    return undefined;
  }
  function kwh100(car){
    return validKwh100(car && car.consumption_kwh_100km) || validKwh100(specValue(car, [
      /kw\/?h\s*100\s*km/i,
      /kwh\s*\/\s*100\s*km/i,
      /kwh\s*100\s*km/i,
      /consumo.*elettric.*combinato/i,
      /consumo.*combinato/i
    ], [/max/i]));
  }
  function rangeWltp(car){
    return validRange(car && car.range_wltp_km) || validRange(specValue(car, [
      /autonomia.*solo.*elettric.*combinato/i,
      /autonomia.*elettric.*combinato/i,
      /autonomia.*wltp.*combinato/i,
      /autonomia.*combinato/i,
      /^autonomia\s+wltp/i,
      /autonomia.*solo.*elettric/i,
      /autonomia.*elettric/i,
      /^autonomia\b/i
    ], [/urbano/i, /max/i]));
  }
  function battery(car){
    const direct = validBattery(car && car.battery_kwh);
    if(direct) return direct;
    const fromSpecs = validBattery(specValue(car, [
      /capac.*batter/i,
      /batter.*capac/i,
      /^batteria$/i,
      /batteria.*kwh/i,
      /batteria.*utile/i,
      /batteria.*netta/i,
      /batteria.*lorda/i,
      /accumulatore/i,
      /energia.*batter/i,
      /battery.*capacity/i
    ]));
    if(fromSpecs) return fromSpecs;
    const fromText = textBattery(car);
    if(fromText) return fromText;
    const r = rangeWltp(car);
    const k = kwh100(car);
    return r && k ? validBattery((r * k) / 100) : undefined;
  }
  function co2(car){ return num(car && car.emissions_g_km); }
  function l100(car){ return num(car && car.consumption_l_100km); }
  function kg100(car){ return num(car && car.consumption_kg_100km); }

  function injectStyle(){
    if(byId(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.motornet-spec-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.motornet-spec-chips span{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:rgba(8,55,39,.08);border:1px solid rgba(8,55,39,.12);font-weight:800;font-size:.82rem;color:#083727}.motornet-spec-chips i{font-size:.8rem}@media(max-width:760px){.motornet-spec-chips{gap:6px}.motornet-spec-chips span{font-size:.78rem;padding:6px 9px}}';
    document.head.appendChild(style);
  }
  function chip(icon, text){ return '<span><i class="fa-solid '+icon+'"></i> '+text+'</span>'; }
  function chipsHtml(car, type){
    if(!car) return '';
    const chips = [];
    if(type === 'ev'){
      const k = kwh100(car);
      const r = rangeWltp(car);
      const b = battery(car);
      if(k) chips.push(chip('fa-bolt', fmt(k) + ' kWh/100 km'));
      if(r) chips.push(chip('fa-road', fmt(r) + ' km WLTP'));
      if(b) chips.push(chip('fa-car-battery', fmt(b) + ' kWh batteria'));
      if(k) car.consumption_kwh_100km = k;
      if(r) car.range_wltp_km = r;
      if(b) car.battery_kwh = b;
    } else {
      const l = l100(car);
      const kg = kg100(car);
      const c = co2(car);
      if(l) chips.push(chip('fa-gas-pump', fmt(l) + ' l/100 km'));
      if(kg) chips.push(chip('fa-gauge-high', fmt(kg) + ' kg/100 km'));
      if(c) chips.push(chip('fa-smog', fmt(c) + ' g/km CO₂'));
    }
    return chips.length ? '<div class="motornet-spec-chips">' + chips.join('') + '</div>' : '';
  }
  function selected(type){
    try{
      if(type === 'ev' && typeof selectedEv === 'function') return selectedEv();
      if(type === 'ice' && typeof selectedIce === 'function') return selectedIce();
    }catch(e){}
    return null;
  }
  function renderOne(id, type){
    const box = byId(id);
    const car = selected(type);
    if(!box || !car) return;
    box.querySelectorAll('.motornet-spec-chips').forEach(el => el.remove());
    const html = chipsHtml(car, type);
    if(!html) return;
    const info = box.querySelector(':scope > div:last-child') || box;
    info.insertAdjacentHTML('beforeend', html);
  }
  function renderAll(){
    if(rendering) return;
    rendering = true;
    setTimeout(function(){
      injectStyle();
      renderOne('evVisual', 'ev');
      renderOne('iceVisual', 'ice');
      rendering = false;
    }, 0);
  }
  function observe(){
    ['evVisual','iceVisual'].forEach(id => {
      const box = byId(id);
      if(!box || box.__motornetFinalChipObserver) return;
      const obs = new MutationObserver(function(){ renderAll(); });
      obs.observe(box, {childList:true, subtree:false});
      box.__motornetFinalChipObserver = obs;
    });
  }
  window.renderMotornetSpecChips = renderAll;
  window.addEventListener('load', function(){
    injectStyle();
    observe();
    renderAll();
    ['evSelect','iceSelect','evTrimSelect','iceTrimSelect','evBrandPick','iceBrandPick','evFuelPick','iceFuelPick'].forEach(id => {
      const el = byId(id);
      if(el && !el.__motornetFinalChipBound){
        el.addEventListener('input', renderAll);
        el.addEventListener('change', renderAll);
        el.__motornetFinalChipBound = true;
      }
    });
  });
})();
