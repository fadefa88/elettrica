(function(){
  const MAX_ATTEMPTS = 24;
  let rawById = new Map();
  let patched = false;
  let enrichedOnce = false;

  function byId(id){ return document.getElementById(id); }
  function normalizeKey(value){ return String(value || '').toLowerCase().replace(/\s+/g,' ').trim(); }
  function toText(value){ return String(value === null || value === undefined ? '' : value).replace(/\s+/g,' ').trim(); }

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

  function round1(n){ return Math.round(Number(n) * 10) / 10; }

  function validBatteryKwh(value){
    const n = toNumber(value);
    return n && n >= 5 && n <= 250 ? round1(n) : undefined;
  }

  function validRangeKm(value){
    const n = toNumber(value);
    return n && n >= 30 && n <= 1500 ? Math.round(n) : undefined;
  }

  function validKwh100(value){
    const n = toNumber(value);
    return n && n >= 5 && n <= 60 ? round1(n) : undefined;
  }

  function batteryFromText(){
    const text = Array.from(arguments)
      .flat()
      .filter(v => v !== null && v !== undefined)
      .map(v => String(v))
      .join(' · ');
    if(!text) return undefined;

    // Do not parse consumption values such as "15 kWh/100 km" as battery size.
    const cleaned = text.replace(/\d+(?:[\.,]\d+)?\s*k\s*w\s*h\s*\/?\s*100\s*km/gi, ' ');
    const matches = cleaned.matchAll(/(?:^|[^\d])([1-9]\d{0,2}(?:[\.,]\d{1,2})?)\s*k\s*w\s*h\b/gi);
    for(const match of matches){
      const n = validBatteryKwh(match[1]);
      if(n) return n;
    }
    return undefined;
  }

  function textFields(car){
    if(!car || typeof car !== 'object') return [];
    return [
      car.display_name,
      car.title,
      car.name,
      car.brand,
      car.model,
      car.version,
      car.powertrain,
      car.motor,
      car.battery_kwh,
      car.fuel_original,
      car.source_url,
      car.motornet_detail_url
    ];
  }

  function rawSpecs(car){
    const raw = car && car.specs_raw;
    return raw && typeof raw === 'object' ? raw : {};
  }

  function specEntries(car){
    const out = [];
    const seen = new Set();

    function add(key, value){
      const k = toText(key);
      const v = toText(value);
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
        return;
      }
      if(Array.isArray(node)){
        node.forEach(item => walk(item, path));
        return;
      }

      // Common shapes: {label, value}, {name, value}, {key, value}.
      const label = node.label || node.name || node.key || node.title;
      const value = node.value || node.val || node.text;
      if(label !== undefined && value !== undefined){
        add(path.concat([label]).join(' '), value);
      }

      Object.entries(node).forEach(([key, value]) => {
        if(['label','name','key','title','value','val','text'].includes(key) && typeof value !== 'object') return;
        if(value && typeof value === 'object'){
          walk(value, path.concat([key]));
        } else {
          add(path.concat([key]).join(' '), value);
          add(key, value);
        }
      });
    }

    walk(rawSpecs(car), []);
    return out;
  }

  function specValue(car, matchers, opts){
    opts = opts || {};
    const entries = specEntries(car);
    for(const [key, value] of entries){
      const k = normalizeKey(key);
      if(opts.exclude && opts.exclude.some(rx => rx.test(k))) continue;
      if(matchers.some(rx => rx.test(k))){
        const s = String(value || '').trim();
        if(s) return s;
      }
    }
    return undefined;
  }

  function specExactValue(car, wantedKey){
    const wanted = normalizeKey(wantedKey);
    for(const [key, value] of specEntries(car)){
      if(normalizeKey(key) === wanted){
        const s = String(value || '').trim();
        return {found:true, value:s || undefined};
      }
    }
    return {found:false, value:undefined};
  }

  function specNumber(car, matchers, opts){
    const value = specValue(car, matchers, opts);
    return value ? toNumber(value) : undefined;
  }

  function specExactNumber(car, wantedKey){
    const hit = specExactValue(car, wantedKey);
    return {found: hit.found, number: hit.value ? toNumber(hit.value) : undefined};
  }

  function specMoney(car, matchers){
    const value = specValue(car, matchers);
    return value ? toMoney(value) : undefined;
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

  function motornetKwh100(rawCar, visualCar){
    return validKwh100(rawCar && rawCar.consumption_kwh_100km) || validKwh100(visualCar && visualCar.consumption_kwh_100km) || specNumber(rawCar, [
      /kw\/?h\s*100\s*km/i,
      /kwh\s*\/\s*100\s*km/i,
      /kwh\s*100\s*km/i,
      /consumo.*elettric.*combinato/i,
      /consumo.*combinato/i
    ], {exclude:[/max/i]});
  }

  function motornetL100(rawCar){
    const combined = specExactNumber(rawCar, 'Consumo Combinato');
    if(combined.number) return combined.number;
    if(combined.found) return undefined;
    return toNumber(rawCar && rawCar.consumption_l_100km);
  }

  function motornetKg100(rawCar){
    const gasCombined = specExactNumber(rawCar, 'Consumo Gas Combinato');
    if(gasCombined.number) return gasCombined.number;
    if(gasCombined.found) return undefined;
    return toNumber(rawCar && rawCar.consumption_kg_100km);
  }

  function motornetPrice(rawCar){
    return specMoney(rawCar, [
      /^prezzo$/i,
      /prezzo\s+listino/i,
      /prezzo\s+di\s+listino/i,
      /^listino$/i
    ]) || toMoney(rawCar && rawCar.price_eur);
  }

  function motornetRange(rawCar, visualCar){
    const direct = validRangeKm(rawCar && rawCar.range_wltp_km) || validRangeKm(visualCar && visualCar.range_wltp_km);
    if(direct) return direct;
    return specNumber(rawCar, [
      /autonomia.*solo.*elettric.*combinato/i,
      /autonomia.*elettric.*combinato/i,
      /autonomia.*wltp.*combinato/i,
      /autonomia.*combinato/i,
      /^autonomia\s+wltp/i,
      /autonomia.*solo.*elettric/i,
      /autonomia.*elettric/i,
      /^autonomia\b/i
    ], {exclude:[/urbano/i, /max/i]});
  }

  function estimatedBatteryFromRange(rawCar, visualCar){
    const range = motornetRange(rawCar, visualCar);
    const kwh100 = motornetKwh100(rawCar, visualCar);
    if(!range || !kwh100) return undefined;
    return validBatteryKwh((range * kwh100) / 100);
  }

  function motornetBattery(rawCar, visualCar){
    const direct = validBatteryKwh(rawCar && rawCar.battery_kwh) || validBatteryKwh(visualCar && visualCar.battery_kwh);
    if(direct) return direct;

    const fromSpecs = specNumber(rawCar, [
      /capac.*batter/i,
      /cap\.?\s*batter/i,
      /batter.*capac/i,
      /^batteria$/i,
      /batteria.*kwh/i,
      /batteria.*utile/i,
      /batteria.*netta/i,
      /batteria.*lorda/i,
      /accumulatore/i,
      /capac.*accumulator/i,
      /energia.*batter/i,
      /battery.*capacity/i
    ]);
    const validSpec = validBatteryKwh(fromSpecs);
    if(validSpec) return validSpec;

    const fromText = batteryFromText(textFields(visualCar), textFields(rawCar));
    if(fromText) return fromText;

    return estimatedBatteryFromRange(rawCar, visualCar);
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

  function loadedCars(){
    const out = [];
    try { if(Array.isArray(EV)) out.push(...EV); } catch(e) {}
    try { if(Array.isArray(IC)) out.push(...IC); } catch(e) {}
    return out;
  }

  function rebuildRawById(){
    rawById = new Map();
    loadedCars().forEach(car => { if(car && car.id) rawById.set(car.id, car); });
  }

  function enrichCar(car){
    if(!car || !car.id) return car;
    const raw = rawById.get(car.id) || car;
    const fuel = String(car.fuel || raw.fuel || '').toLowerCase();
    const isElectric = fuel.includes('elettr');

    const price = motornetPrice(raw);
    if(price){
      car.price_eur = price;
      car.price_source = 'motornet_technical_sheet';
    }

    if(isElectric){
      const kwh = motornetKwh100(raw, car);
      if(kwh){
        car.consumption_kwh_100km = kwh;
        car.consumption_kwh_100km_estimated = false;
        car.consumption_source = 'motornet_technical_sheet';
      }
      const range = motornetRange(raw, car);
      if(range) car.range_wltp_km = range;
      const battery = motornetBattery(raw, car);
      if(battery){
        car.battery_kwh = battery;
        car.battery_source = raw && raw.battery_kwh ? 'motornet_technical_sheet' : 'motornet_derived';
      }
    } else {
      const kg100 = motornetKg100(raw);
      const l100 = motornetL100(raw);
      if(kg100 && (fuel.includes('metano') || fuel.includes('gas'))){
        car.consumption_kg_100km = kg100;
        car.consumption_source = 'motornet_specs_raw_consumo_gas_combinato';
        delete car.consumption_l_100km;
      } else if(l100){
        car.consumption_l_100km = l100;
        car.consumption_source = 'motornet_specs_raw_consumo_combinato';
        delete car.consumption_kg_100km;
      }
    }

    const co2 = motornetCo2(raw);
    if(co2) car.emissions_g_km = co2;

    return car;
  }

  function enrichLoadedCatalog(){
    if(enrichedOnce) return;
    rebuildRawById();
    try{
      if(Array.isArray(EV)) EV.forEach(enrichCar);
      if(Array.isArray(IC)) IC.forEach(enrichCar);
      enrichedOnce = true;
    }catch(e){}
  }

  function chipsFor(c, type){
    if(!c) return '';
    const raw = c.id ? (rawById.get(c.id) || c) : c;
    const chips = [];
    if(type === 'ev'){
      const kwh = motornetKwh100(raw, c);
      if(kwh){
        c.consumption_kwh_100km = kwh;
        chips.push('<span><i class="fa-solid fa-bolt"></i> '+formatNumber(kwh)+' kWh/100 km</span>');
      }
      const range = motornetRange(raw, c);
      if(range){
        c.range_wltp_km = range;
        chips.push('<span><i class="fa-solid fa-road"></i> '+formatNumber(range)+' km WLTP</span>');
      }
      const battery = motornetBattery(raw, c);
      if(battery){
        c.battery_kwh = battery;
        chips.push('<span><i class="fa-solid fa-car-battery"></i> '+formatNumber(battery)+' kWh batteria</span>');
      }
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
    window.__motornetSpecChipsPatched = true;
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

  function runOnce(){
    injectStyles();
    patchRender();
    enrichLoadedCatalog();
    try{
      if(typeof setAutoFields === 'function') setAutoFields();
      if(typeof calculate === 'function') calculate();
      if(typeof updateNavigation === 'function') updateNavigation();
    }catch(e){}
  }

  function waitForCatalog(attempt){
    attempt = attempt || 1;
    const cars = loadedCars();
    if(cars.length || attempt >= MAX_ATTEMPTS){
      runOnce();
      return;
    }
    setTimeout(() => waitForCatalog(attempt + 1), 250);
  }

  window.addEventListener('load', () => setTimeout(() => waitForCatalog(1), 900));
})();
