(function(){
  const STYLE_ID = 'motornetRuntimeChipStyles';
  const RUNTIME_CLASS = 'motornet-runtime-spec-chips';

  function byId(id){ return document.getElementById(id); }
  function text(value){ return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim(); }
  function num(value){
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  function fmt(value){ return Number(value).toLocaleString('it-IT', { maximumFractionDigits: 1 }); }

  function selectedEvSafe(){
    try { if(typeof selectedEv === 'function') return selectedEv(); } catch(e) {}
    try {
      const id = byId('evSelect') && byId('evSelect').value;
      if(id && Array.isArray(EV)) return EV.find(function(car){ return car && car.id === id; });
    } catch(e) {}
    return null;
  }

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
    box.querySelectorAll('.' + RUNTIME_CLASS).forEach(function(el){ el.remove(); });

    // Passive renderer only: show direct values already present in data/cars_motornet.json.
    // Do not infer, calculate or mutate consumption/range/battery in the frontend.
    const kwh = num(car.consumption_kwh_100km);
    const range = num(car.range_wltp_km);
    const battery = num(car.battery_kwh);
    const chips = [];

    if(kwh) chips.push('<span><i class="fa-solid fa-bolt"></i> ' + fmt(kwh) + ' kWh/100 km</span>');
    if(range) chips.push('<span><i class="fa-solid fa-road"></i> ' + fmt(range) + ' km WLTP</span>');
    if(battery) chips.push('<span><i class="fa-solid fa-car-battery"></i> ' + fmt(battery) + ' kWh batteria</span>');
    if(!chips.length) return;

    const target = box.children && box.children.length ? box.children[box.children.length - 1] : box;
    target.insertAdjacentHTML('beforeend', '<div class="' + RUNTIME_CLASS + '">' + chips.join('') + '</div>');
  }

  function patchPassiveRendering(){
    if(window.__motornetPassiveChipRendererPatched) return;
    window.__motornetPassiveChipRendererPatched = true;
    try {
      const originalSetAutoFields = setAutoFields;
      setAutoFields = function(){
        const ret = originalSetAutoFields.apply(this, arguments);
        setTimeout(renderRuntimeChips, 0);
        return ret;
      };
    } catch(e) {}
    try {
      const originalRenderCarVisual = renderCarVisual;
      renderCarVisual = function(id, car, type){
        const ret = originalRenderCarVisual.apply(this, arguments);
        if(type === 'ev') setTimeout(renderRuntimeChips, 0);
        return ret;
      };
    } catch(e) {}
  }

  function run(){
    patchPassiveRendering();
    renderRuntimeChips();
  }

  patchPassiveRendering();
  window.addEventListener('DOMContentLoaded', function(){ setTimeout(run, 200); });
  window.addEventListener('load', function(){
    setTimeout(run, 1000);
    setTimeout(run, 2500);
    setTimeout(run, 5000);
  });
})();
