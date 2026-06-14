(function(){
  const BRAND_BY_CODE = {
    ABA:'Abarth', ALF:'Alfa Romeo', AST:'Aston Martin', AUD:'Audi', BMW:'BMW', BYD:'BYD', CAD:'Cadillac', CHE:'Chevrolet', CHC:'Chrysler', CIR:'Citroën', CIT:'Citroën', CUP:'Cupra', DAC:'Dacia', DOD:'Dodge', DR:'DR', DS:'DS', EVO:'EVO', FER:'Ferrari', FIA:'Fiat', FOR:'Ford', GMC:'GMC', HON:'Honda', HYU:'Hyundai', INE:'Ineos', JAG:'Jaguar', JEE:'Jeep', KIA:'Kia', LAN:'Lancia', LND:'Land Rover', LEX:'Lexus', LOT:'Lotus', MAS:'Maserati', MAZ:'Mazda', MCL:'McLaren', MER:'Mercedes', MG:'MG', MIL:'Mini', MIN:'Mini', MIT:'Mitsubishi', NIS:'Nissan', OPE:'Opel', PEU:'Peugeot', POL:'Polestar', POR:'Porsche', REN:'Renault', ROL:'Rolls-Royce', SEA:'Seat', SKO:'Skoda', SMA:'Smart', SUB:'Subaru', SUZ:'Suzuki', TES:'Tesla', TOY:'Toyota', VLV:'Volvo', VLK:'Volkswagen', VOL:'Volvo'
  };

  const KNOWN_BRANDS = Object.values(BRAND_BY_CODE)
    .concat(['Alfa Romeo','Mercedes-Benz','Rolls-Royce','Land Rover','Aston Martin'])
    .filter((v,i,a)=>a.indexOf(v)===i)
    .sort((a,b)=>b.length-a.length);

  function byId(id){ return document.getElementById(id); }
  function clean(value){
    return String(value || '')
      .replace(/\bundefined\b/gi,'')
      .replace(/^\s*e\s+listini\s+del\s+nuovo\s*/i,'')
      .replace(/^\s*listini\s+del\s+nuovo\s*/i,'')
      .replace(/^\s*modelli\s+/i,'')
      .replace(/^\s*modello\s+/i,'')
      .replace(/\s+/g,' ')
      .trim();
  }
  function badBrand(value){
    const text = String(value || '').trim().toLowerCase();
    return !text || text === 'e listini del nuovo' || text.includes('listini del nuovo') || text === 'motornet' || text === 'auto';
  }
  function codeFromCar(car){
    const joined = [car?.source_url, car?.motornet_detail_url, car?.image_source_url, car?.image_local_path].filter(Boolean).join(' ');
    let match = joined.match(/allestimento\/([A-Z]{2,4})/i);
    if(match) return match[1].slice(0,3).toUpperCase();
    match = joined.match(/\/img\/modelli\/auto\/([A-Z]{2,4})\//i);
    if(match) return match[1].slice(0,3).toUpperCase();
    return '';
  }
  function brandFromText(text){
    const cleaned = clean(text);
    const lower = cleaned.toLowerCase();
    return KNOWN_BRANDS.find(b => lower === b.toLowerCase() || lower.startsWith(b.toLowerCase() + ' ')) || '';
  }
  function resolveBrand(car){
    const code = codeFromCar(car);
    const codeBrand = BRAND_BY_CODE[code];
    if(codeBrand) return codeBrand;
    const fromVersion = brandFromText([car?.version, car?.model, car?.powertrain].filter(Boolean).join(' '));
    if(fromVersion) return fromVersion;
    return badBrand(car?.brand) ? 'Motornet' : clean(car?.brand);
  }
  function stripBrand(text, brand){
    let out = clean(text);
    if(!out) return out;
    const variants = [brand, brand === 'Mercedes' ? 'Mercedes-Benz' : '', brand === 'Mercedes-Benz' ? 'Mercedes' : ''].filter(Boolean);
    variants.forEach(b => {
      const rx = new RegExp('^' + b.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\s+', 'i');
      while(rx.test(out)) out = out.replace(rx,'').trim();
    });
    return out;
  }
  function resolveModel(car, brand){
    const candidates = [car?.model, car?.version, car?.powertrain].map(clean).filter(Boolean);
    for(const candidate of candidates){
      let m = stripBrand(candidate, brand);
      if(m && !badBrand(m) && m.toLowerCase() !== brand.toLowerCase()) return m;
    }
    return 'Modello';
  }
  function fixCar(car){
    if(!car) return;
    const brand = resolveBrand(car);
    const model = resolveModel(car, brand);
    car.brand = brand;
    car.model = model;
    car.powertrain = stripBrand(car.powertrain || car.version || '', brand) || car.powertrain || car.version || '';
  }
  function uniq(values){ return [...new Set(values.filter(Boolean))].sort(); }
  function opt(values,label){ return '<option value="all">'+label+'</option>'+values.map(v=>'<option value="'+String(v).replace(/"/g,'&quot;')+'">'+v+'</option>').join(''); }
  function rebuildControls(){
    try{
      if(Array.isArray(EV)) EV.forEach(fixCar);
      if(Array.isArray(IC)) IC.forEach(fixCar);
    }catch(e){ return; }

    const evFuel = byId('evFuelPick')?.value || 'elettrica';
    const evBrand = byId('evBrandPick');
    if(evBrand){
      const current = evBrand.value || 'all';
      const brands = uniq(EV.filter(c => !evFuel || c.fuel === evFuel).map(c=>c.brand));
      evBrand.innerHTML = opt(brands, 'Tutte');
      evBrand.value = brands.includes(current) ? current : 'all';
    }

    const iceBrand = byId('iceBrandPick');
    if(iceBrand){
      const current = iceBrand.value || 'all';
      const brands = uniq(IC.map(c=>c.brand));
      iceBrand.innerHTML = opt(brands, 'Tutte');
      iceBrand.value = brands.includes(current) ? current : 'all';
    }

    try{ if(typeof fillEvSelect === 'function') fillEvSelect(); }catch(e){}
    try{ if(typeof fillIceSelect === 'function') fillIceSelect(); }catch(e){}
    try{ if(typeof setAutoFields === 'function') setAutoFields(); }catch(e){}
    try{ if(typeof calculate === 'function') calculate(); }catch(e){}
    try{ if(typeof updateNavigation === 'function') updateNavigation(); }catch(e){}
  }
  function start(attempt){
    attempt = attempt || 1;
    rebuildControls();
    if(attempt < 20) setTimeout(()=>start(attempt+1), 500);
  }
  window.addEventListener('load', () => setTimeout(()=>start(1), 1200));
})();
