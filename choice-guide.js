(function(){
  if(window.__choiceGuideLoaded) return;
  window.__choiceGuideLoaded = true;

  let flowStep = 0;
  let state = {
    budgetMin: 20000,
    budgetMax: 35000,
    km: 15000,
    years: 5,
    home: 80,
    priority: "risparmio"
  };
  let evItems = [];
  let iceItems = [];
  let chosenEv = null;
  let chosenIce = null;

  const flowSteps = ["Budget", "Percorrenza", "Ricarica", "Priorità", "Scelta"];
  const euro0 = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const euro2 = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function byId(id){ return document.getElementById(id); }
  function clean(v){ return String(v || "").replace(/\s+/g, " ").trim(); }
  function esc(v){
    return clean(v).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }
  function num(v, fallback){
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  }
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function globalList(name){
    try{
      const value = eval(name);
      return Array.isArray(value) ? value : [];
    }catch(e){
      return [];
    }
  }
  function callGlobal(name){
    try{
      const fn = eval(name);
      if(typeof fn === "function") return fn();
    }catch(e){}
  }

  function price(car){ return num(car && car.price_eur, 0); }
  function kw(car){ return num(car && car.power_kw, 0); }
  function carName(car){ return [clean(car && car.brand), clean(car && car.model)].filter(Boolean).join(" "); }
  function carVersion(car){ return clean(car && (car.version || car.powertrain)); }
  function isElectric(car){ return clean(car && car.category) === "electric" || /elettr/i.test(clean(car && car.fuel)); }
  function fuelKey(fuel){
    fuel = clean(fuel).toLowerCase();
    if(fuel.includes("diesel")) return "gasolio";
    if(fuel.includes("benzina")) return "benzina";
    if(fuel.includes("gpl")) return "gpl";
    if(fuel.includes("metano")) return "metano";
    return fuel;
  }
  function inBudget(car){
    const p = price(car);
    const min = Math.min(state.budgetMin, state.budgetMax);
    const max = Math.max(state.budgetMin, state.budgetMax);
    return p > 0 && p >= min && p <= max;
  }

  async function loadJson(path, fallback){
    try{
      const r = await fetch(path, { cache: "no-store" });
      return r.ok ? await r.json() : fallback;
    }catch(e){
      return fallback;
    }
  }

  function fuelPrice(fuel, prices){
    const key = fuelKey(fuel);
    const table = prices && prices.fuel ? prices.fuel : {};
    const fallback = key === "metano" ? 1.55 : key === "gpl" ? 0.78 : key === "gasolio" ? 1.75 : 1.85;
    return num(table[key], fallback);
  }

  function baseTax(car){
    const power = kw(car);
    if(!power) return 0;
    const bollo = power <= 100 ? power * 2.58 : 100 * 2.58 + (power - 100) * 3.87;
    const superbollo = power > 185 ? (power - 185) * 20 : 0;
    return bollo + superbollo;
  }

  function evCost100(car, settings, prices, charging){
    const consumption = num(car && car.consumption_kwh_100km, 16);
    const homePrice = num(prices && prices.electricity && prices.electricity.home, 0.30);
    const publicPrice = num(charging && charging.market_average && charging.market_average.public_mixed, 0.74);
    const homeShare = clamp(settings.home / 100, 0, 1);
    return consumption * (homePrice * homeShare + publicPrice * (1 - homeShare));
  }

  function iceCost100(car, prices){
    const key = fuelKey(car && car.fuel);
    const consumption = num((car && car.consumption_kg_100km) || (car && car.consumption_l_100km), key === "metano" ? 4 : 6);
    return consumption * fuelPrice(car && car.fuel, prices);
  }

  function evTco(car, settings, prices, charging){
    const km = settings.km * settings.years;
    return price(car) + evCost100(car, settings, prices, charging) * km / 100 + 250 * settings.years + (settings.years > 5 ? (settings.years - 5) * 65 : 0);
  }

  function iceTco(car, settings, prices){
    const km = settings.km * settings.years;
    return price(car) + iceCost100(car, prices) * km / 100 + 600 * settings.years + baseTax(car) * settings.years;
  }

  function score(item, priority){
    if(priority === "prezzo") return item.price;
    if(priority === "autonomia") return -num(item.car.range_wltp_km, 0) + item.tco / 100000;
    if(priority === "prestazioni") return -kw(item.car) + item.tco / 100000;
    return item.tco;
  }

  function readInputs(){
    const min = byId("cgBudgetMin");
    const max = byId("cgBudgetMax");
    const km = byId("cgKm");
    const years = byId("cgYears");
    const home = byId("cgHome");
    const priority = byId("cgPriority");
    if(min) state.budgetMin = num(min.value, state.budgetMin);
    if(max) state.budgetMax = num(max.value, state.budgetMax);
    if(km) state.km = num(km.value, state.km);
    if(years) state.years = clamp(num(years.value, state.years), 1, 20);
    if(home) state.home = clamp(num(home.value, state.home), 0, 100);
    if(priority) state.priority = clean(priority.value) || state.priority;
  }

  function askCatalog(){
    try{
      if(typeof window.__motornetRequestCatalogLoad === "function") window.__motornetRequestCatalogLoad();
    }catch(e){}
    return new Promise(function(resolve){
      let ticks = 0;
      const timer = setInterval(function(){
        ticks++;
        if((globalList("EV").length && globalList("IC").length) || ticks > 40){
          clearInterval(timer);
          resolve();
        }
      }, 250);
    });
  }

  function installCss(){
    if(byId("choiceGuideFullscreenStyle")) return;
    const style = document.createElement("style");
    style.id = "choiceGuideFullscreenStyle";
    style.textContent = `
      body.choice-guide-fullscreen-open{overflow:hidden}
      .cg-entry{margin-top:24px;padding:18px;border-radius:22px;background:rgba(255,255,255,.78);border:1px solid rgba(24,62,49,.12)}
      .cg-entry h3{margin:0 0 6px}.cg-entry p,.cg-muted{color:#64746d}.cg-actions{display:flex;gap:10px;flex-wrap:wrap}
      .cg-page{position:fixed;inset:0;z-index:10000;display:none;overflow:auto;background:linear-gradient(180deg,#f7fbf7,#edf7f1)}
      .cg-page.open{display:block}.cg-shell{max-width:1120px;margin:0 auto;padding:24px}
      .cg-top{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:16px}
      .cg-progress{height:8px;border-radius:999px;background:#dfeae3;overflow:hidden}.cg-bar{height:100%;background:#2fc56f;width:20%}
      .cg-body{background:#fff;border-radius:26px;padding:24px;margin:18px 0;box-shadow:0 20px 60px rgba(20,50,40,.10)}
      .cg-body h1{margin:4px 0 8px}.cg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px}
      .cg-grid label{font-size:.86rem;color:#50625b}.cg-grid input,.cg-grid select{width:100%;margin-top:6px}
      .cg-budget-hint{margin-top:12px;padding:12px 14px;border-radius:16px;background:#f2f8f4;color:#50625b;font-size:.9rem}
      .cg-bottom{display:flex;justify-content:space-between;gap:12px;margin-top:18px}
      .cg-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cg-card{display:block;width:100%;text-align:left;padding:14px;border-radius:18px;border:1px solid #dfe8e2;background:#fbfdfb;margin-bottom:10px}
      .cg-card.active{border-color:#20b764;box-shadow:0 0 0 3px rgba(32,183,100,.14)}
      .cg-card small{display:block;color:#6c7c75;text-transform:uppercase;font-size:.7rem}.cg-card b{display:block}.cg-card em{display:block;color:#64746d;font-size:.83rem}
      .cg-card div{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.cg-card span{font-size:.76rem;background:#eef4ef;border-radius:999px;padding:5px 8px}
      .cg-verdict{padding:14px 16px;border-radius:18px;background:#eef8f1;margin:14px 0}
      @media(max-width:760px){.cg-shell{padding:14px}.cg-grid,.cg-cols{grid-template-columns:1fr}.cg-bottom{position:sticky;bottom:0;background:#edf7f1;padding:10px 0}.cg-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensurePage(){
    if(byId("choiceGuidePage")) return;
    const page = document.createElement("div");
    page.id = "choiceGuidePage";
    page.className = "cg-page";
    page.innerHTML = `
      <div class="cg-shell">
        <div class="cg-top">
          <div><b>Scelta guidata</b><div class="cg-muted"><span id="cgStepLabel">1 di 5</span> · <span id="cgStepName">Budget</span></div></div>
          <button id="cgClose" class="ghost" type="button">Torna al comparatore</button>
        </div>
        <div class="cg-progress"><div id="cgProgress" class="cg-bar"></div></div>
        <div id="cgBody" class="cg-body"></div>
        <div class="cg-bottom">
          <button id="cgPrev" class="ghost" type="button">Indietro</button>
          <button id="cgNext" type="button">Avanti</button>
        </div>
      </div>
    `;
    document.body.appendChild(page);
    byId("cgClose").onclick = closeGuide;
    byId("cgPrev").onclick = function(){ readInputs(); setFlowStep(flowStep - 1); };
    byId("cgNext").onclick = function(){
      readInputs();
      if(flowStep === flowSteps.length - 1) finishToReport();
      else setFlowStep(flowStep + 1);
    };
  }

  function openGuide(){
    flowStep = 0;
    const page = byId("choiceGuidePage");
    if(!page) return;
    page.classList.add("open");
    document.body.classList.add("choice-guide-fullscreen-open");
    renderStep();
  }

  function closeGuide(){
    const page = byId("choiceGuidePage");
    if(!page) return;
    page.classList.remove("open");
    document.body.classList.remove("choice-guide-fullscreen-open");
  }

  function setFlowStep(next){
    flowStep = clamp(next, 0, flowSteps.length - 1);
    renderStep();
  }

  function updateTop(){
    const label = byId("cgStepLabel");
    const name = byId("cgStepName");
    const bar = byId("cgProgress");
    const prev = byId("cgPrev");
    const next = byId("cgNext");
    if(label) label.textContent = (flowStep + 1) + " di " + flowSteps.length;
    if(name) name.textContent = flowSteps[flowStep];
    if(bar) bar.style.width = ((flowStep + 1) / flowSteps.length * 100) + "%";
    if(prev) prev.disabled = flowStep === 0;
    if(next) next.innerHTML = flowStep === flowSteps.length - 1 ? 'Usa queste auto e vai al report <i class="fa-solid fa-flag-checkered"></i>' : 'Avanti <i class="fa-solid fa-arrow-right"></i>';
  }

  function renderStep(){
    updateTop();
    const body = byId("cgBody");
    if(!body) return;

    if(flowStep === 0){
      const min = Math.min(state.budgetMin, state.budgetMax);
      const max = Math.max(state.budgetMin, state.budgetMax);
      body.innerHTML = '<p class="eyebrow">Budget</p><h1>Che fascia di prezzo vuoi considerare?</h1><p class="lead">Imposta un budget minimo e massimo. Così evitiamo di proporti auto troppo economiche o fuori target.</p><div class="cg-grid"><label>Budget minimo €<input id="cgBudgetMin" type="number" value="'+min+'" step="1000"></label><label>Budget massimo €<input id="cgBudgetMax" type="number" value="'+max+'" step="1000"></label></div><div class="cg-budget-hint">Esempio: da 25.000 € a 40.000 €. Il sito cercherà solo auto dentro questa fascia.</div>';
      return;
    }

    if(flowStep === 1){
      body.innerHTML = '<p class="eyebrow">Percorrenza</p><h1>Per quanti anni e quanti km?</h1><p class="lead">Questi dati determinano il costo totale reale nel tempo.</p><div class="cg-grid"><label>Km annui<input id="cgKm" type="number" value="'+state.km+'" step="1000"></label><label>Anni di possesso<input id="cgYears" type="number" value="'+state.years+'" min="1" max="20"></label></div>';
      return;
    }

    if(flowStep === 2){
      body.innerHTML = '<p class="eyebrow">Ricarica</p><h1>Come caricheresti l’elettrica?</h1><p class="lead">Più ricarichi a casa, più l’elettrica tende ad avere senso economico.</p><div class="cg-grid"><label>Ricarica a casa %<input id="cgHome" type="number" value="'+state.home+'" min="0" max="100" step="5"></label><label>Scenario rapido<select id="cgHomePreset"><option value="80">Box o presa a casa</option><option value="50">Metà casa, metà colonnine</option><option value="20">Quasi solo colonnine</option></select></label></div>';
      setTimeout(function(){
        const preset = byId("cgHomePreset");
        if(preset) preset.oninput = function(){ if(byId("cgHome")) byId("cgHome").value = preset.value; };
      },0);
      return;
    }

    if(flowStep === 3){
      body.innerHTML = '<p class="eyebrow">Priorità</p><h1>Cosa vuoi ottimizzare?</h1><p class="lead">Il sito ordina le proposte in base a questa priorità.</p><div class="cg-grid"><label>Priorità<select id="cgPriority"><option value="risparmio">Risparmio totale</option><option value="prezzo">Prezzo d’acquisto basso</option><option value="autonomia">Autonomia elettrica</option><option value="prestazioni">Prestazioni</option></select></label></div>';
      setTimeout(function(){ if(byId("cgPriority")) byId("cgPriority").value = state.priority; },0);
      return;
    }

    renderChoices();
  }

  function renderCard(item, kind){
    const car = item.car;
    const selected = kind === "ev" ? chosenEv : chosenIce;
    const active = selected && selected.id === car.id ? " active" : "";
    const extra = isElectric(car) && car.range_wltp_km ? '<span>'+Math.round(car.range_wltp_km)+' km WLTP</span>' : '';
    return '<button type="button" class="cg-card '+kind+active+'" data-kind="'+kind+'" data-id="'+esc(car.id)+'"><small>'+(kind==="ev"?"Elettrica":"Termica")+'</small><b>'+esc(carName(car))+'</b>'+(carVersion(car)?'<em>'+esc(carVersion(car))+'</em>':'')+'<div><span>Prezzo '+euro0.format(item.price)+'</span><span>TCO '+euro0.format(item.tco)+'</span><span>'+euro2.format(item.cost100)+'/100 km</span>'+extra+'</div></button>';
  }

  async function renderChoices(){
    const body = byId("cgBody");
    if(!body) return;
    body.innerHTML = '<p class="eyebrow">Proposte</p><h1>Carico il catalogo…</h1><p class="cg-muted">Un attimo.</p>';
    await askCatalog();

    const prices = await loadJson("data/prices.json", {fuel:{benzina:1.85,gasolio:1.75,gpl:.78,metano:1.55}, electricity:{home:.30}});
    const charging = await loadJson("data/charging.json", {market_average:{public_mixed:.74}});

    evItems = globalList("EV").filter(function(c){ return isElectric(c) && inBudget(c); })
      .map(function(c){ return {car:c, price:price(c), cost100:evCost100(c,state,prices,charging), tco:evTco(c,state,prices,charging)}; })
      .sort(function(a,b){ return score(a,state.priority) - score(b,state.priority); }).slice(0,6);

    iceItems = globalList("IC").filter(function(c){ return !isElectric(c) && inBudget(c); })
      .map(function(c){ return {car:c, price:price(c), cost100:iceCost100(c,prices), tco:iceTco(c,state,prices)}; })
      .sort(function(a,b){ return score(a,state.priority) - score(b,state.priority); }).slice(0,6);

    chosenEv = chosenEv || (evItems[0] && evItems[0].car) || null;
    chosenIce = chosenIce || (iceItems[0] && iceItems[0].car) || null;

    const min = Math.min(state.budgetMin, state.budgetMax);
    const max = Math.max(state.budgetMin, state.budgetMax);

    if(!evItems.length && !iceItems.length){
      body.innerHTML = '<p class="eyebrow">Proposte</p><h1>Nessuna auto trovata nella fascia scelta.</h1><p class="lead">Fascia usata: '+euro0.format(min)+' - '+euro0.format(max)+'. Allarga il budget o torna al comparatore classico.</p>';
      return;
    }

    let verdict = "";
    if(evItems[0] && iceItems[0]){
      const diff = iceItems[0].tco - evItems[0].tco;
      verdict = '<div class="cg-verdict"><b>'+(diff >= 0 ? "La migliore elettrica costa meno nel periodo indicato." : "La migliore termica costa meno nel periodo indicato.")+'</b><span>Differenza stimata: '+euro0.format(Math.abs(diff))+' in '+state.years+' anni.</span></div>';
    }

    body.innerHTML = '<p class="eyebrow">Scelta</p><h1>Scegli una coppia da confrontare.</h1><p class="lead">Fascia budget: '+euro0.format(min)+' - '+euro0.format(max)+'. Dopo il finish arrivi allo stesso report del comparatore classico.</p>'+verdict+'<div class="cg-cols"><section><h3>Elettriche</h3>'+evItems.map(function(i){return renderCard(i,"ev");}).join("")+'</section><section><h3>Termiche</h3>'+iceItems.map(function(i){return renderCard(i,"ice");}).join("")+'</section></div>';

    body.querySelectorAll(".cg-card").forEach(function(btn){
      btn.onclick = function(){
        const kind = btn.dataset.kind;
        const id = btn.dataset.id;
        const src = kind === "ev" ? evItems : iceItems;
        const found = src.find(function(i){ return i.car.id === id; });
        if(found){
          if(kind === "ev") chosenEv = found.car;
          else chosenIce = found.car;
          renderChoices();
        }
      };
    });
  }

  function setCheck(id, val){ const e = byId(id); if(e) e.checked = !!val; }
  function setVal(id, val){ const e = byId(id); if(e) e.value = val; }
  function setHiddenSelect(id, val){
    const e = byId(id);
    if(!e) return;
    e.innerHTML = '<option value="'+esc(val)+'" selected>'+esc(val)+'</option>';
    e.value = val;
  }

  function finishToReport(){
    if(!chosenEv || !chosenIce){
      alert("Scegli una elettrica e una termica.");
      return;
    }

    setCheck("manualEvMode", false);
    setCheck("manualIceMode", false);
    setHiddenSelect("evSelect", chosenEv.id);
    setHiddenSelect("iceSelect", chosenIce.id);
    setVal("evModelSearch", carName(chosenEv));
    setVal("iceModelSearch", carName(chosenIce));
    setVal("years", state.years);
    setVal("annualKm", state.km);
    setVal("homeShare", state.home);

    ["overrideEvPurchase","overridePurchase","overrideFuelPrice","overridePublicCharge","overrideConsumption","overrideEvMaintenance","overrideIceMaintenance","overrideIceTax","overrideEvTax"].forEach(function(id){ setCheck(id, false); });

    callGlobal("setAutoFields");
    callGlobal("calculate");
    callGlobal("drawSummary");
    closeGuide();
    try{ eval("setStep")(7); }catch(e){}
  }

  function injectEntry(){
    installCss();
    ensurePage();
    const hero = document.querySelector('.screen[data-step="0"] .hero-card');
    if(!hero || byId("choiceGuideEntry")) return;

    const entry = document.createElement("div");
    entry.id = "choiceGuideEntry";
    entry.className = "cg-entry";
    entry.innerHTML = '<h3>Non hai ancora deciso che auto comprare?</h3><p>Usa una seconda esperienza full-screen: fascia budget, km annui, anni di possesso e abitudini di ricarica. Alla fine arrivi allo stesso report.</p><div class="cg-actions"><button id="cgOpen" type="button">Aiutami a scegliere</button><button id="cgClassic" class="ghost" type="button">Ho già due auto in mente</button></div>';
    hero.appendChild(entry);
    byId("cgOpen").onclick = openGuide;
    byId("cgClassic").onclick = function(){ const next = byId("nextStep"); if(next) next.click(); };
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectEntry);
  else injectEntry();
  window.addEventListener("load", injectEntry);
})();