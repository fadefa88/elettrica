(function(){
  let patched = false;

  function byId(id){ return document.getElementById(id); }
  function clean(v){ return String(v || '').replace(/\s+/g, ' ').trim(); }
  function norm(v){ return clean(v).toLowerCase(); }
  function num(v){
    if(v === null || v === undefined) return undefined;
    const m = String(v).replace(/\s+/g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    if(!m) return undefined;
    const n = Number(m[0]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  function round1(n){ return Math.round(Number(n) * 10) / 10; }
  function format(n){ return Number(n).toLocaleString('it-IT', {maximumFractionDigits: 1}); }
  function validRange(v){ const n = num(v); return n && n >= 30 && n <= 1500 ? Math.round(n) : undefined; }
  function validKwh100(v){ const n = num(v); return n && n >= 5 && n <= 60 ? round1(n) : undefined; }
  function validBattery(v){ const n = num(v); return n && n >= 5 && n <= 250 ? round1(n) : undefined; }

  function rawSpecs(car){
    return car && typeof car.specs_raw === 'object' && car.specs_raw ? car.specs_raw : {};
  }
  function specEntries(car){ return Object.entries(rawSpecs(car)); }

  function bestSpecNumber(car, tests, validator){
    const entries = specEntries(car);
    for(const test of tests){
      for(const [key, value] of entries){
        const k = norm(key);
        if(test(k, value)){
          const n = validator(value);
          if(n) return n;
        }
      }
    }
    return undefined;
  }

  function batteryFromText(car){
    const text = [car && car.display_name, car && car.title, car && car.name, car && car.brand, car && car.model, car && car.version, car && car.powertrain]
      .map(clean).filter(Boolean).join(' · ');
    if(!text) return undefined;
    const withoutConsumption = text.replace(/\d+(?:[\.,]\d+)?\s*k\s*w\s*h\s*\/?\s*100\s*km/gi, ' ');
    const matches = withoutConsumption.matchAll(/(?:^|[^\d])([1-9]\d{0,2}(?:[\.,]\d{1,2})?)\s*k\s*w\s*h\b/gi);
    for(const m of matches){
      const n = validBattery(m[1]);
      if(n) return n;
    }
    return undefined;
  }

  function evConsumption(car){
    return validKwh100(car && car.consumption_kwh_100km) || bestSpecNumber(car, [
      k => /kw\/?h\s*100\s*km/i.test(k) && !/max/i.test(k),
      k => /kwh\s*\/\s*100\s*km/i.test(k),
      k => /kwh\s*100\s*km/i.test(k) && !/max/i.test(k),
      k => /consumo.*elettric.*combinato/i.test(k),
      k => /consumo.*combinato/i.test(k) && /kwh/i.test(k)
    ], validKwh100);
  }

  function evRange(car){
    return validRange(car && car.range_wltp_km) || bestSpecNumber(car, [
      k => /autonomia.*solo.*elettric.*combinato/i.test(k),
      k => /autonomia.*elettric.*combinato/i.test(k),
      k => /autonomia.*wltp.*combinato/i.test(k),
      k => /autonomia.*combinato/i.test(k),
      k => /autonomia.*wltp/i.test(k),
      k => /^autonomia\b/i.test(k)
    ], validRange);
  }

  function evBattery(car){
    const direct = validBattery(car && car.battery_kwh);
    if(direct) return direct;

    const fromSpecs = bestSpecNumber(car, [
      k => /capac.*batter/i.test(k),
      k => /batter.*capac/i.test(k),
      k => /batteria.*kwh/i.test(k),
      k => /batteria.*utile/i.test(k),
      k => /batteria.*netta/i.test(k),
      k => /batteria.*lorda/i.test(k),
      k => /accumulatore/i.test(k),
      k => /energia.*batter/i.test(k)
    ], validBattery);
    if(fromSpecs) return fromSpecs;

    const fromText = batteryFromText(car);
    if(fromText) return fromText;

    const range = evRange(car);
    const kwh100 = evConsumption(car);
    if(range && kwh100) return validBattery((range * kwh100) / 100);
    return undefined;
  }

  function enrichEv(car){
    if(!car) return car;
    const fuel = norm(car.fuel || car.fuel_original || car.powertrain);
    if(!fuel.includes('elettr')) return car;

    const kwh100 = evConsumption(car);
    const range = evRange(car);
    const battery = evBattery(car);
    if(kwh100) car.consumption_kwh_100km = kwh100;
    if(range) car.range_wltp_km = range;
    if(battery) car.battery_kwh = battery;
    return car;
  }

  function chips(car, type){
    if(!car || type !== 'ev') return '';
    enrichEv(car);
    const parts = [];
    const kwh100 = validKwh100(car.consumption_kwh_100km);
    const range = validRange(car.range_wltp_km);
    const battery = validBattery(car.battery_kwh);
    if(kwh100) parts.push('<span><i class="fa-solid fa-bolt"></i> '+format(kwh100)+' kWh/100 km</span>');
    if(range) parts.push('<span><i class="fa-solid fa-road"></i> '+format(range)+' km WLTP</span>');
    if(battery) parts.push('<span><i class="fa-solid fa-car-battery"></i> '+format(battery)+' kWh batteria</span>');
    return parts.length ? '<div class="motornet-spec-chips">'+parts.join('')+'</div>' : '';
  }

  function patch(){
    if(patched || typeof renderCarVisual !== 'function') return;
    patched = true;
    const previous = renderCarVisual;
    renderCarVisual = function(id, car, type){
      if(type === 'ev' && car) enrichEv(car);
      previous(id, car, type);
      if(type !== 'ev' || !car) return;
      const box = byId(id);
      if(!box) return;
      box.querySelectorAll('.motornet-spec-chips').forEach(el => el.remove());
      const target = box.children && box.children.length ? box.children[box.children.length - 1] : box;
      const html = chips(car, type);
      if(html) target.insertAdjacentHTML('beforeend', html);
    };
  }

  function enrichLoaded(){
    try { if(Array.isArray(EV)) EV.forEach(enrichEv); } catch(e) {}
  }

  function run(){
    patch();
    enrichLoaded();
    try { if(typeof setAutoFields === 'function') setAutoFields(); } catch(e) {}
  }

  window.addEventListener('load', function(){
    run();
    setTimeout(run, 900);
    setTimeout(run, 1800);
  });
})();
