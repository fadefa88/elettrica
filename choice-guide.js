(function(){
  if(window.__choiceGuideLoaded) return;
  window.__choiceGuideLoaded = true;

  const eur0 = new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR', maximumFractionDigits:0 });
  const eur2 = new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR', minimumFractionDigits:2, maximumFractionDigits:2 });

  function el(id){ return document.getElementById(id); }
  function n(v,d){ const x=Number(v); return Number.isFinite(x)?x:d; }
  function txt(v){ return String(v||'').replace(/\s+/g,' ').trim(); }
  function esc(v){ return txt(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
  function cars(name){ const v = window[name]; return Array.isArray(v) ? v : []; }
  function isEv(c){ return txt(c.category)==='electric' || /elettr/i.test(txt(c.fuel)); }
  function price(c){ return n(c.price_eur,0); }
  function title(c){ return [txt(c.brand),txt(c.model)].filter(Boolean).join(' '); }
  function ver(c){ return txt(c.version || c.powertrain); }
  function kw(c){ return n(c.power_kw,0); }
  function fuelKey(f){ f=txt(f).toLowerCase(); if(f.includes('diesel')) return 'gasolio'; if(f.includes('benzina')) return 'benzina'; if(f.includes('gpl')) return 'gpl'; if(f.includes('metano')) return 'metano'; return f; }

  async function json(path, fallback){ try{ const r=await fetch(path,{cache:'no-store'}); return r.ok ? await r.json() : fallback; }catch(e){ return fallback; } }
  function bollo(c){ const p=kw(c); return p<=0?0:(p<=100?p*2.58:100*2.58+(p-100)*3.87) + (p>185?(p-185)*20:0); }
  function ev100(c,s,p,ch){ const cons=n(c.consumption_kwh_100km,16); const home=n(p.electricity&&p.electricity.home,.30); const pub=n(ch.market_average&&ch.market_average.public_mixed,.74); const h=clamp(s.home/100,0,1); return cons*(home*h+pub*(1-h)); }
  function ice100(c,p){ const key=fuelKey(c.fuel); const fp=n(p.fuel&&p.fuel[key], key==='metano'?1.55:1.85); const cons=n(c.consumption_kg_100km || c.consumption_l_100km, key==='metano'?4:6); return cons*fp; }
  function evTco(c,s,p,ch){ return price(c)+ev100(c,s,p,ch)*s.km*s.years/100+250*s.years+(s.years>5?(s.years-5)*65:0); }
  function iceTco(c,s,p){ return price(c)+ice100(c,p)*s.km*s.years/100+600*s.years+bollo(c)*s.years; }
  function score(item,priority){ if(priority==='prezzo') return item.price; if(priority==='autonomia') return -n(item.car.range_wltp_km,0)+item.tco/100000; if(priority==='prestazioni') return -kw(item.car)+item.tco/100000; return item.tco; }

  function card(i,type){
    const extra = isEv(i.car)&&i.car.range_wltp_km ? '<span>'+Math.round(i.car.range_wltp_km)+' km WLTP</span>' : '';
    return '<article class="cg-card '+type+'"><small>'+(type==='ev'?'Elettrica':'Termica')+'</small><b>'+esc(title(i.car))+'</b>'+(ver(i.car)?'<em>'+esc(ver(i.car))+'</em>':'')+'<div><span>Prezzo '+eur0.format(i.price)+'</span><span>TCO '+eur0.format(i.tco)+'</span><span>'+eur2.format(i.cost100)+'/100 km</span>'+extra+'</div></article>';
  }

  async function run(){
    const out=el('cgResults'); if(!out) return;
    out.innerHTML='<p class="cg-muted">Calcolo in corso…</p>';
    const s={budget:n(el('cgBudget').value,35000), km:n(el('cgKm').value,15000), years:clamp(n(el('cgYears').value,5),1,20), home:clamp(n(el('cgHome').value,80),0,100), priority:txt(el('cgPriority').value||'risparmio')};
    const p=await json('data/prices.json',{fuel:{benzina:1.85,gasolio:1.75,gpl:.78,metano:1.55},electricity:{home:.30}});
    const ch=await json('data/charging.json',{market_average:{public_mixed:.74}});
    const evs=cars('EV').filter(c=>isEv(c)&&price(c)>0&&price(c)<=s.budget).map(c=>({car:c,price:price(c),cost100:ev100(c,s,p,ch),tco:evTco(c,s,p,ch)})).sort((a,b)=>score(a,s.priority)-score(b,s.priority)).slice(0,5);
    const ics=cars('IC').filter(c=>!isEv(c)&&price(c)>0&&price(c)<=s.budget).map(c=>({car:c,price:price(c),cost100:ice100(c,p),tco:iceTco(c,s,p)})).sort((a,b)=>score(a,s.priority)-score(b,s.priority)).slice(0,5);
    if(!evs.length&&!ics.length){ out.innerHTML='<p class="cg-muted">Nessuna auto trovata entro questo budget.</p>'; return; }
    let v=''; if(evs[0]&&ics[0]){ const d=ics[0].tco-evs[0].tco; v='<div class="cg-verdict"><b>'+(d>=0?'Elettrica più conveniente nel periodo indicato.':'Termica più conveniente nel periodo indicato.')+'</b><span>Differenza stimata: '+eur0.format(Math.abs(d))+' in '+s.years+' anni.</span></div>'; }
    out.innerHTML=v+'<div class="cg-cols"><section><h4>Elettriche sensate</h4>'+(evs.length?evs.map(i=>card(i,'ev')).join(''):'<p class="cg-muted">Nessuna elettrica nel budget.</p>')+'</section><section><h4>Alternative termiche</h4>'+(ics.length?ics.map(i=>card(i,'ice')).join(''):'<p class="cg-muted">Nessuna termica nel budget.</p>')+'</section></div><p class="cg-muted">Stima orientativa. Per il confronto preciso usa il flusso principale.</p>';
  }

  function style(){ if(el('choiceGuideStyle')) return; const s=document.createElement('style'); s.id='choiceGuideStyle'; s.textContent='.cg-entry{margin-top:24px;padding:18px;border-radius:22px;background:rgba(255,255,255,.78);border:1px solid rgba(24,62,49,.12)}.cg-entry h3{margin:0 0 6px}.cg-entry p,.cg-muted{color:#64746d}.cg-actions{display:flex;gap:10px;flex-wrap:wrap}.cg-modal{position:fixed;inset:0;z-index:10000;background:rgba(8,18,15,.54);display:none;align-items:flex-end;justify-content:center;padding:16px}.cg-modal.open{display:flex}.cg-panel{width:min(980px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:26px;padding:22px}.cg-head{display:flex;justify-content:space-between;gap:12px}.cg-close{border:0;border-radius:999px;width:38px;height:38px}.cg-form{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:18px 0}.cg-form label{font-size:.82rem;color:#50625b}.cg-form input,.cg-form select{width:100%;margin-top:6px}.cg-verdict{padding:14px 16px;border-radius:18px;background:#eef8f1;margin-bottom:16px}.cg-verdict b,.cg-verdict span{display:block}.cg-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cg-card{padding:14px;border:1px solid #e3ebe5;border-radius:18px;margin-bottom:10px;background:#fbfdfb}.cg-card small{display:block;color:#6c7c75;text-transform:uppercase;font-size:.7rem}.cg-card b{display:block}.cg-card em{display:block;color:#64746d;font-size:.83rem}.cg-card div{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.cg-card span{font-size:.76rem;background:#eef4ef;border-radius:999px;padding:5px 8px}@media(max-width:760px){.cg-modal{align-items:stretch;padding:10px}.cg-form,.cg-cols{grid-template-columns:1fr}.cg-actions button{width:100%}}'; document.head.appendChild(s); }
  function modal(){ if(el('choiceGuideModal')) return; const m=document.createElement('div'); m.id='choiceGuideModal'; m.className='cg-modal'; m.innerHTML='<div class="cg-panel"><div class="cg-head"><div><p class="eyebrow">Scelta guidata</p><h3>Non sai ancora che auto comprare?</h3><p class="muted">Parti da budget, km, anni e ricarica casa. Il comparatore principale resta invariato.</p></div><button class="cg-close" type="button">×</button></div><div class="cg-form"><label>Budget €<input id="cgBudget" type="number" value="35000" step="1000"></label><label>Km annui<input id="cgKm" type="number" value="15000" step="1000"></label><label>Anni<input id="cgYears" type="number" value="5" min="1" max="20"></label><label>Ricarica casa %<input id="cgHome" type="number" value="80" min="0" max="100" step="5"></label><label>Priorità<select id="cgPriority"><option value="risparmio">Risparmio totale</option><option value="prezzo">Prezzo basso</option><option value="autonomia">Autonomia</option><option value="prestazioni">Prestazioni</option></select></label><button id="cgRun" type="button">Mostra proposte</button></div><div id="cgResults"></div></div>'; document.body.appendChild(m); m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open')}); m.querySelector('.cg-close').addEventListener('click',()=>m.classList.remove('open')); el('cgRun').addEventListener('click',run); }
  function entry(){ style(); modal(); const hero=document.querySelector('.screen[data-step="0"] .hero-card'); if(!hero||el('choiceGuideEntry')) return; const d=document.createElement('div'); d.id='choiceGuideEntry'; d.className='cg-entry'; d.innerHTML='<h3>Non hai ancora deciso che auto comprare?</h3><p>Puoi partire da budget, km annui, anni di possesso e abitudini di ricarica per vedere quali elettriche e termiche hanno più senso.</p><div class="cg-actions"><button id="cgOpen" type="button">Aiutami a scegliere</button><button id="cgCompare" class="ghost" type="button">Ho già due auto in mente</button></div>'; hero.appendChild(d); el('cgOpen').addEventListener('click',()=>el('choiceGuideModal').classList.add('open')); el('cgCompare').addEventListener('click',()=>{const n=el('nextStep'); if(n)n.click();}); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',entry); else entry(); window.addEventListener('load',entry);
})();
