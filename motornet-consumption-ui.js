(function(){
  const RAW_URL = 'data/cars_motornet.json';
  const MAX_ATTEMPTS = 20;
  let rawById = new Map();
  let patched = false;

  function byId(id){ return document.getElementById(id); }

  function toNumber(value){
    if(value === null || value === undefined) return undefined;
    let text = String(value).trim();
    if(!text) return undefined;
    text = text.replace(/\s+/g,'').replace(',', '.');
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if(!match) return undefined;
    const n = Number(match[0]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function toMoney(value){
    if(value === null || value === undefined) return undefined;
    let text = String(value).trim();
    if(!text) return undefined;
    const match = text.match(/\d{1,3}(?:[\.\s]\d{3})+(?:,\d+)?|\d{4,7}(?:,\d+)?/);
    if(!match) return undefined;
    let raw = match[0].replace(/\s+/g,'');
    if(raw.includes(',')) raw = raw.split(',')[0];
    raw = raw.replace(/\./g,'');
    const n = Number(raw);
    return Number.isFinite(n) && n >= 5000 && n <= 1000000 ? n : undefined;
  }

  function specValue(car, matchers){
    const raw = car && car.specs_raw;
    if(!raw || typeof raw !== 'object') return undefined;
    for(const [key, value] of Object.entries(raw)){
      const k = String(key || '').toLowerCase().replace(/\s+/g,' ');
      if(matchers.some(rx => rx.test(k))){
        const s = String(value || '').trim();
        if(s) return s;
      }
    }
    return undefined;
  }

  function specNumber(car, matchers){
    const value = specValue(car, matchers);
    return value ? toNumber(value) : undefined;
  }

  function specMoney(car, matchers){
    const value = specValue(car, matchers);
    return value ? toMoney(value) : undefined;
  }

  function motornetKwh100(rawCar){
    return specNumber(rawCar, [
      /kw\/?h\s*100\s*km/i,
      /kwh\s*\/\s*100\s*km/i,
      /kwh\s*100\s*km/i
    ]) || toNumber(rawCar && rawCar.consumption_kwh_100km);
  }

  function motornetL100(rawCar){
    const fromSpec = specNumber(rawCar, [
      /^consumo\s+combinato$/i,
      /consumo\s+misto/i,
      /consumo\s+extraurb/i,
      /consumo\s+urb/i
    ]);
    if(fromSpec) return fromSpec;
    return toNumber(rawCar && rawCar.consumption_l_100km);
  }

  function motornetKg100(rawCar){
    return specNumber(rawCar, [
      /^consumo\s+gas\s+combinato$/i,
      /consumo\s+metano/i,
      /kg\s*\/\s*100/i
    ]) || toNumber(rawCar && rawCar.consumption_kg_100km);
  }

  function motornetPrice(rawCar){
    return specMoney(rawCar, [
      /^prezzo$/i,
      /prezzo\s+listino/i,
      /prezzo\s+di\s+listino/i,
      /^listino$/i
    ]) || toMoney(rawCar && rawCar.price_eur);
  }

  function motornetRange(rawCar){
    return toNumber(rawCar && rawCar.range_wltp_km) || specNumber(rawCar, [
      /auto(?:no|mo)mia.*elettrico.*combinato/i,
      /autonomia.*elettrico.*combinato/i,
      /autonomia.*combinato/i
    ]);
  }

  function motornetCo2(rawCar){
    return specNumber(rawCar, [
      /^co2\s*combinato$/i,
      /co2\s+gas\s+combinato/i,
      /emissioni.*co2/i
    ]) || toNumber(rawCar && rawCar.emissions_g_km);
  }

  function formatNumber(n){
    return Number(n).toLocaleString('it-IT', { maximumFractionDigits: 1 });
  }

  function loadRawCatalog(){
    return fetch(RAW_URL + '?v=' + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(payload => {
        rawById = new Map();
        (payload && payload.cars || []).forEach(car => {
          if(car && car.id) rawById.set(car.id, car);
        });
      })
      .catch(() => {});
  }

  function enrichCar(car){
    if(!car || !car.id) return car;
    const raw = rawById.get(car.id);
    if(!raw) return car;

    const fuel = String(car.fuel || raw.fuel || '').toLowerCase();
    const isElectric = fuel.includes('elettr');

    const price = motornetPrice(raw);
    if(price){
      car.price_eur = price;
      car.price_source = 'motornet_technical_sheet';
    }

    if(isElectric){
      const kwh = motornetKwh100(raw);
      if(kwh){
        car.consumption_kwh_100km = kwh;
        car.consumption_kwh_100km_estimated = false;
        car.consumption_source = 'motornet_technical_sheet';
      }
      const range = motornetRange(raw);
      if(range) car.range_wltp_km = range;
    } else {
      const kg100 = motornetKg100(raw);
      const l100 = motornetL100(raw);
      if(kg100 && (fuel.includes('metano') || fuel.includes('gas'))){
        car.consumption_kg_100km = kg100;
        delete car.consumption_l_100km;
      } else if(l100){
        car.consumption_l_100km = l100;
      }
    }

    const co2 = motornetCo2(raw);
    if(co2) car.emissions_g_km = co2;

    return car;
  }

  function enrichLoadedCatalog(){
    try{
      if(Array.isArray(EV)) EV.forEach(enrichCar);
      if(Array.isArray(IC)) IC.forEach(enrichCar);
    }catch(e){}
  }

  function chipsFor(c, type){
    if(!c) return '';
    const chips = [];
    if(type === 'ev'){
      const kwh = toNumber(c.consumption_kwh_100km);
      if(kwh){
        chips.push('<span><i class="fa-solid fa-bolt"></i> '+formatNumber(kwh)+' kWh/100 km'+(c.consumption_kwh_100km_estimated ? ' stimati' : '')+'</span>');
      }
      const range = toNumber(c.range_wltp_km);
      if(range) chips.push('<span><i class="fa-solid fa-road"></i> '+formatNumber(range)+' km WLTP</span>');
      const battery = toNumber(c.battery_kwh);
      if(battery) chips.push('<span><i class="fa-solid fa-car-battery"></i> '+formatNumber(battery)+' kWh batteria</span>');
    } else {
      const l100 = toNumber(c.consumption_l_100km);
      const kg100 = toNumber(c.consumption_kg_100km);
      if(l100) chips.push('<span><i class="fa-solid fa-gas-pump"></i> '+formatNumber(l100)+' l/100 km</span>');
      if(kg100) chips.push('<span><i class="fa-solid fa-gauge-high"></i> '+formatNumber(kg100)+' kg/100 km</span>');
      const co2 = toNumber(c.emissions_g_km);
      if(co2) chips.push('<span><i class="fa-solid fa-smog"></i> '+formatNumber(co2)+' g/km CO₂</span>');
    }
    if(!chips.length) return '';
    return '<div class="motornet-spec-chips">'+chips.join('')+'</div>';
  }

  function injectStyles(){
    if(byId('motornetConsumptionStyles')) return;
    const style = document.createElement('style');
    style.id = 'motornetConsumptionStyles';
    style.textContent = '.motornet-spec-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.motornet-spec-chips span{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;background:rgba(8,55,39,.08);border:1px solid rgba(8,55,39,.12);font-weight:800;font-size:.82rem;color:#083727}.motornet-spec-chips i{font-size:.8rem}@media(max-width:760px){.motornet-spec-chips{gap:6px}.motornet-spec-chips span{font-size:.78rem;padding:6px 9px}}';
    document.head.appendChild(style);
  }

  function patchRender(){
    if(patched || typeof renderCarVisual !== 'function') return;
    patched = true;
    const original = renderCarVisual;
    renderCarVisual = function(id, car, type){
      if(car) enrichCar(car);
      original(id, car, type);
      const box = byId(id);
      if(!box || !car) return;
      box.querySelectorAll('.motornet-spec-chips').forEach(el => el.remove());
      const target = box.children && box.children.length ? box.children[box.children.length - 1] : box;
      const html = chipsFor(car, type);
      if(html) target.insertAdjacentHTML('beforeend', html);
    };
  }

  function refresh(attempt){
    attempt = attempt || 1;
    injectStyles();
    patchRender();
    enrichLoadedCatalog();
    try{
      if(typeof setAutoFields === 'function') setAutoFields();
      if(typeof calculate === 'function') calculate();
      if(typeof updateNavigation === 'function') updateNavigation();
    }catch(e){}
    if(attempt < MAX_ATTEMPTS) setTimeout(() => refresh(attempt + 1), 500);
  }

  window.addEventListener('load', () => {
    loadRawCatalog().then(() => setTimeout(() => refresh(1), 900));
  });
})();
