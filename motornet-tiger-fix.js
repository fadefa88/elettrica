(function(){
  let lastSignature = '';

  function clean(value){
    return String(value || '').replace(/\bundefined\b/gi, '').replace(/\s+/g, ' ').trim();
  }

  function getList(name){
    try{
      const value = eval(name);
      return Array.isArray(value) ? value : [];
    }catch(e){
      return [];
    }
  }

  function carCode(car){
    const text = [
      car && car.source_url,
      car && car.motornet_detail_url,
      car && car.image_source_url,
      car && car.image_local_path,
      car && car.id
    ].join(' ');
    const match = text.match(/(?:allestimento\/|\/auto\/)(TIG[A-Z0-9]*)/i) || text.match(/\b(TIG[A-Z0-9]*)\b/i);
    return match ? match[1].toUpperCase() : '';
  }

  function isTiger(car){
    if(!car) return false;
    const rawBrand = clean(car.brand).toUpperCase();
    const code = carCode(car);
    return rawBrand === 'TIG' || code.startsWith('TIG') || /^TIG\s*er\b/i.test(clean(car.model || car.version || car.powertrain));
  }

  function fixTigerText(value){
    let text = clean(value);
    if(!text) return text;
    text = text.replace(/^TIG\s*er\b/i, 'Tiger');
    text = text.replace(/^TIGer\b/i, 'Tiger');
    text = text.replace(/^TIG\b/i, 'Tiger');
    text = text.replace(/^er\b/i, 'Tiger');
    return clean(text);
  }

  function fixCar(car){
    if(!isTiger(car)) return false;
    const before = [car.brand, car.model, car.version, car.powertrain].join('|');
    car.brand = 'Tiger';
    car.model = fixTigerText(car.model || car.version || car.powertrain) || 'Tiger';
    car.version = fixTigerText(car.version || car.model) || car.model;
    car.powertrain = fixTigerText(car.powertrain || car.version || car.model) || car.version;
    if(clean(car.model).toLowerCase() === 'er') car.model = 'Tiger';
    if(clean(car.version).toLowerCase() === 'er') car.version = car.model;
    if(clean(car.powertrain).toLowerCase() === 'er') car.powertrain = car.version;
    const after = [car.brand, car.model, car.version, car.powertrain].join('|');
    return before !== after;
  }

  function signature(){
    const ev = getList('EV');
    const ic = getList('IC');
    return [
      ev.length,
      ic.length,
      ev[0] && ev[0].id || '',
      ev[ev.length - 1] && ev[ev.length - 1].id || '',
      ic[0] && ic[0].id || '',
      ic[ic.length - 1] && ic[ic.length - 1].id || '',
      ic.filter(function(car){ return clean(car.brand).toUpperCase() === 'TIG' || /^TIG\s*er\b/i.test(clean(car.model)); }).length
    ].join('|');
  }

  function refresh(){
    const sig = signature();
    if(sig === lastSignature) return;
    lastSignature = sig;

    let changed = false;
    getList('EV').forEach(function(car){ changed = fixCar(car) || changed; });
    getList('IC').forEach(function(car){ changed = fixCar(car) || changed; });

    if(changed){
      try{ if(typeof fillEvSelect === 'function') fillEvSelect(); }catch(e){}
      try{ if(typeof fillIceSelect === 'function') fillIceSelect(); }catch(e){}
      try{ if(typeof setAutoFields === 'function') setAutoFields(); }catch(e){}
      try{ if(typeof calculate === 'function') calculate(); }catch(e){}
      try{ if(typeof updateNavigation === 'function') updateNavigation(); }catch(e){}
    }
  }

  window.addEventListener('load', function(){
    let ticks = 0;
    const timer = setInterval(function(){
      refresh();
      ticks += 1;
      if(ticks >= 40) clearInterval(timer);
    }, 500);
  });
})();

(function(){
  if(window.__italianSuperbolloPatchLoaded) return;
  window.__italianSuperbolloPatchLoaded = true;

  const SUPERBOLLO_THRESHOLD_KW = 185;
  const SUPERBOLLO_EUR_PER_KW = 20;
  const euro0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  function byId(id){ return document.getElementById(id); }
  function valueNumber(id){ return Number(byId(id)?.value || 0); }
  function checked(id){ return !!byId(id)?.checked; }

  function readPowerKw(car){
    const direct = Number(car && car.power_kw);
    if(Number.isFinite(direct) && direct > 0) return Math.floor(direct);
    const manual = Number(byId('manualIceKw') && byId('manualIceKw').value);
    if(checked('manualIceMode') && Number.isFinite(manual) && manual > 0) return Math.floor(manual);
    return 0;
  }

  function carAgeYears(car){
    const currentYear = new Date().getFullYear();
    const year = Number(car && car.year);
    if(!Number.isFinite(year) || year < 1980 || year > currentYear + 1) return 0;
    return Math.max(0, currentYear - year);
  }

  function superbolloFactorByAge(age){
    if(age >= 20) return 0;
    if(age >= 15) return 0.15;
    if(age >= 10) return 0.30;
    if(age >= 5) return 0.60;
    return 1;
  }

  function superbolloForCar(car){
    const kw = readPowerKw(car);
    if(kw <= SUPERBOLLO_THRESHOLD_KW) return 0;
    const raw = (kw - SUPERBOLLO_THRESHOLD_KW) * SUPERBOLLO_EUR_PER_KW;
    return Math.round(raw * superbolloFactorByAge(carAgeYears(car)));
  }

  function fallbackBaseBollo(car){
    const kw = readPowerKw(car);
    if(!kw) return valueNumber('iceTax') || 0;
    return Math.round(kw <= 100 ? kw * 2.58 : 100 * 2.58 + (kw - 100) * 3.87);
  }

  function selectedThermalCar(){
    try{ if(typeof selectedIce === 'function') return selectedIce(); }catch(e){}
    try{
      const id = byId('iceSelect') && byId('iceSelect').value;
      if(id && Array.isArray(IC)) return IC.find(function(car){ return car && car.id === id; }) || null;
    }catch(e){}
    return null;
  }

  const originalEstimateIceTax = (typeof estimateIceTax === 'function') ? estimateIceTax : null;

  function baseBolloForCar(car){
    let base = originalEstimateIceTax ? Number(originalEstimateIceTax(car)) : fallbackBaseBollo(car);
    if(!Number.isFinite(base) || base < 0) base = fallbackBaseBollo(car);
    return Math.round(base);
  }

  function totalTaxForCar(car){
    const base = baseBolloForCar(car);
    const extra = superbolloForCar(car);
    if(car){
      car.__base_bollo_tax_eur = base;
      car.__superbollo_tax_eur = extra;
      car.__total_bollo_tax_eur = base + extra;
    }
    return Math.round(base + extra);
  }

  function patchedEstimateIceTax(car){
    return totalTaxForCar(car);
  }

  try{
    estimateIceTax = patchedEstimateIceTax;
    window.estimateIceTax = patchedEstimateIceTax;
  }catch(e){
    window.estimateIceTax = patchedEstimateIceTax;
  }

  function updateIceTaxLabel(){
    const checkbox = byId('overrideIceTax');
    if(!checkbox) return;
    const span = checkbox.closest('span');
    if(!span) return;
    const car = selectedThermalCar();
    const extra = superbolloForCar(car);
    span.childNodes.forEach(function(node){
      if(node.nodeType === Node.TEXT_NODE){
        node.nodeValue = extra > 0 ? ' Override bollo + superbollo termica' : ' Override bollo termica';
      }
    });
  }

  function updateIceTaxField(){
    const car = selectedThermalCar();
    const input = byId('iceTax');
    if(!input || !car) return;
    updateIceTaxLabel();
    if(!checked('overrideIceTax')){
      input.value = String(totalTaxForCar(car));
      input.readOnly = true;
      input.classList.add('readonly');
    }
  }

  function updateSummaryText(){
    const grid = byId('summaryGrid');
    const car = selectedThermalCar();
    if(!grid || !car) return;
    const extra = superbolloForCar(car);
    const total = valueNumber('iceTax');
    const base = Math.max(0, total - extra);

    grid.querySelectorAll('div').forEach(function(row){
      const label = row.querySelector('small');
      const value = row.querySelector('b');
      if(!label || !value) return;
      if(/bollo\s+elettrica/i.test(label.textContent || '')){
        const ev = value.textContent.split('/')[0].trim();
        const ice = extra > 0
          ? euro0.format(total) + ' all’anno (bollo ' + euro0.format(base) + ' + superbollo ' + euro0.format(extra) + ')'
          : euro0.format(total) + ' all’anno';
        value.textContent = ev + ' / ' + ice;
      }
    });
  }

  function updateFootnote(){
    const note = byId('costsFootnote');
    const car = selectedThermalCar();
    if(!note || !car) return;
    const extra = superbolloForCar(car);
    if(extra > 0){
      const kw = readPowerKw(car);
      note.textContent = '* Manutenzione e bollo sono stime da verificare. Per questa termica è incluso anche il superbollo: ' + euro0.format(extra) + ' annui stimati perché supera ' + SUPERBOLLO_THRESHOLD_KW + ' kW.';
    }
  }

  function run(){
    updateIceTaxField();
    updateSummaryText();
    updateFootnote();
  }

  if(typeof setAutoFields === 'function'){
    const originalSetAutoFields = setAutoFields;
    setAutoFields = function(){
      const result = originalSetAutoFields.apply(this, arguments);
      run();
      return result;
    };
    window.setAutoFields = setAutoFields;
  }

  if(typeof calculate === 'function'){
    const originalCalculate = calculate;
    calculate = function(){
      updateIceTaxField();
      const result = originalCalculate.apply(this, arguments);
      run();
      return result;
    };
    window.calculate = calculate;
  }

  if(typeof drawSummary === 'function'){
    const originalDrawSummary = drawSummary;
    drawSummary = function(){
      const result = originalDrawSummary.apply(this, arguments);
      run();
      return result;
    };
    window.drawSummary = drawSummary;
  }

  document.addEventListener('change', function(event){
    if(['iceSelect','manualIceMode','manualIceKw','manualIceFuel','overrideIceTax','years'].includes(event.target && event.target.id)){
      setTimeout(function(){
        run();
        try{ if(typeof calculate === 'function') calculate(); }catch(e){}
      }, 0);
    }
  }, true);

  document.addEventListener('input', function(event){
    if(['manualIceKw','overrideIceTax','iceTax'].includes(event.target && event.target.id)){
      setTimeout(function(){
        run();
        try{ if(typeof calculate === 'function') calculate(); }catch(e){}
      }, 0);
    }
  }, true);

  window.addEventListener('load', function(){
    run();
    let count = 0;
    const timer = setInterval(function(){
      run();
      count += 1;
      if(count >= 20) clearInterval(timer);
    }, 300);
  });
})();
