(function(){
  const BRAND_BY_CODE = {
    ABA:'Abarth', ALF:'Alfa Romeo', ALP:'Alpine', AST:'Aston Martin', AUD:'Audi', BEN:'Bentley', BNT:'Bentley', BMW:'BMW', BYD:'BYD', FER:'Ferrari', FIA:'Fiat', FOR:'Ford', HON:'Honda', HYU:'Hyundai', JAG:'Jaguar', JEE:'Jeep', KIA:'Kia', LAN:'Lancia', LND:'Land Rover', LEX:'Lexus', MAS:'Maserati', MAZ:'Mazda', MCL:'McLaren', MER:'Mercedes', MG:'MG', MIN:'Mini', MIL:'Mini', NIS:'Nissan', OPE:'Opel', PEU:'Peugeot', POR:'Porsche', REN:'Renault', ROL:'Rolls-Royce', SEA:'Seat', SKO:'Skoda', SMA:'Smart', SUB:'Subaru', SUZ:'Suzuki', TES:'Tesla', TOY:'Toyota', VLK:'Volkswagen', VLV:'Volvo', VOL:'Volvo'
  };
  const KNOWN = Array.from(new Set(Object.values(BRAND_BY_CODE).concat(['Bentley','Alfa Romeo','Rolls-Royce','Aston Martin','Land Rover','Mercedes-Benz']))).sort(function(a,b){return b.length-a.length;});

  function byId(id){ return document.getElementById(id); }
  function tidy(v){
    let s = String(v || '').trim();
    const prefixes = ['e listini del nuovo ', 'listini del nuovo ', 'Motornet ', 'motornet ', 'Modelli ', 'Modello ', 'modelli ', 'modello '];
    let changed = true;
    while(changed){
      changed = false;
      for(const p of prefixes){
        if(s.toLowerCase().startsWith(p.toLowerCase())){
          s = s.slice(p.length).trim();
          changed = true;
        }
      }
    }
    while(s.endsWith('-')) s = s.slice(0, -1).trim();
    return s.split('  ').join(' ').trim();
  }
  function codeFromUrl(text){
    const s = String(text || '');
    let i = s.indexOf('allestimento/');
    if(i >= 0) return s.slice(i + 13, i + 16).toUpperCase();
    i = s.indexOf('/img/modelli/auto/');
    if(i >= 0) return s.slice(i + 18, i + 21).toUpperCase();
    return '';
  }
  function codeFromCar(c){
    return codeFromUrl([c.source_url, c.motornet_detail_url, c.image_source_url, c.image_local_path].join(' '));
  }
  function brandFromText(text){
    const s = tidy(text).toLowerCase();
    for(const b of KNOWN){
      const bl = b.toLowerCase();
      if(s === bl || s.startsWith(bl + ' ') || s.indexOf(' ' + bl + ' ') >= 0) return b;
    }
    return '';
  }
  function stripBrand(text, brand){
    let s = tidy(text);
    const variants = [brand];
    if(brand === 'Mercedes') variants.push('Mercedes-Benz');
    if(brand === 'Mercedes-Benz') variants.push('Mercedes');
    for(const b of variants){
      while(s.toLowerCase().startsWith(b.toLowerCase() + ' ')){
        s = s.slice(b.length).trim();
      }
    }
    while(s.endsWith('-')) s = s.slice(0, -1).trim();
    return s;
  }
  function dedupe(s){
    s = tidy(s);
    const parts = s.split(' ');
    if(parts.length > 1 && parts[0].toLowerCase() === parts[1].toLowerCase()) return parts.slice(1).join(' ');
    return s;
  }
  function fixCar(c){
    if(!c) return;
    const code = codeFromCar(c);
    let brand = BRAND_BY_CODE[code] || brandFromText([c.brand, c.model, c.version, c.powertrain].join(' ')) || tidy(c.brand) || 'Motornet';
    if(brand.toLowerCase() === 'motornet') brand = brandFromText([c.model, c.version, c.powertrain].join(' ')) || brand;
    let model = '';
    for(const v of [c.model, c.version, c.powertrain]){
      model = dedupe(stripBrand(v, brand));
      if(model && model.toLowerCase() !== brand.toLowerCase() && model.toLowerCase() !== 'motornet') break;
    }
    c.brand = brand;
    c.model = model || 'Modello';
    c.powertrain = dedupe(stripBrand(c.powertrain || c.version || c.model, brand)) || c.model;
  }
  function options(values,label){ return '<option value="all">'+label+'</option>' + values.map(function(v){return '<option value="'+String(v).replaceAll('"','&quot;')+'">'+v+'</option>';}).join(''); }
  function unique(values){ return Array.from(new Set(values.filter(Boolean))).sort(); }
  function apply(){
    try{
      if(Array.isArray(EV)) EV.forEach(fixCar);
      if(Array.isArray(IC)) IC.forEach(fixCar);
    }catch(e){ return; }
    const evBrand = byId('evBrandPick');
    const evFuel = byId('evFuelPick') ? byId('evFuelPick').value : 'elettrica';
    if(evBrand && Array.isArray(EV)){
      const current = evBrand.value || 'all';
      const brands = unique(EV.filter(function(c){return !evFuel || c.fuel === evFuel;}).map(function(c){return c.brand;}));
      evBrand.innerHTML = options(brands, 'Tutte');
      evBrand.value = brands.indexOf(current) >= 0 ? current : 'all';
    }
    const iceBrand = byId('iceBrandPick');
    if(iceBrand && Array.isArray(IC)){
      const current = iceBrand.value || 'all';
      const brands = unique(IC.map(function(c){return c.brand;}));
      iceBrand.innerHTML = options(brands, 'Tutte');
      iceBrand.value = brands.indexOf(current) >= 0 ? current : 'all';
    }
    try{ if(typeof fillEvSelect === 'function') fillEvSelect(); }catch(e){}
    try{ if(typeof fillIceSelect === 'function') fillIceSelect(); }catch(e){}
    try{ if(typeof setAutoFields === 'function') setAutoFields(); }catch(e){}
    try{ if(typeof calculate === 'function') calculate(); }catch(e){}
    try{ if(typeof updateNavigation === 'function') updateNavigation(); }catch(e){}
  }
  window.addEventListener('load', function(){
    let n = 0;
    const t = setInterval(function(){ apply(); n++; if(n >= 20) clearInterval(t); }, 500);
  });
})();
