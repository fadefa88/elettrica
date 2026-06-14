const $ = id => document.getElementById(id);
const money0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const num1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

let P = {}, EV = [], IC = [], T = {}, currentStep = 0, lastResult = null;
const stepNames = ['Benvenuto', 'Auto elettrica', 'Auto termica', 'Tempo e km', 'Costi veicolo', 'Uso elettrico', 'Controllo', 'Risultato'];
const totalSteps = stepNames.length;
const evFiles = ['data/cars_ev.json','data/cars_ev_2.json','data/cars_ev_3.json','data/cars_ev_4.json','data/cars_ev_5.json','data/cars_ev_6.json','data/cars_ev_7.json','data/cars_ev_8.json'];
const iceFiles = ['data/ice_cars_seed.json','data/ice_cars_2.json','data/ice_cars_diesel.json'];
const UNKNOWN_PV_DEFAULT = 35;

async function j(path) { const res = await fetch(path + '?v=' + Date.now()); if (!res.ok) throw new Error(path); return res.json(); }
async function oj(path) { try { return await j(path); } catch { return { cars: [] }; } }
function n(id) { return +($(id)?.value || 0); }
function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }
function fuelKey(f) { return f === 'diesel' ? 'gasolio' : f; }
function fuelLabel(f) { return ({ benzina:'Benzina', diesel:'Diesel', gasolio:'Diesel', gpl:'GPL', metano:'Metano' }[f] || f); }
function unit(f) { return f === 'metano' ? 'kg' : 'l'; }
function uniq(arr) { return [...new Set(arr.filter(Boolean))].sort(); }
function optionList(arr, allLabel = 'Tutte') { return '<option value="all">' + allLabel + '</option>' + arr.map(x => '<option value="' + x + '">' + x + '</option>').join(''); }
function isChecked(id) { return !!$(id)?.checked; }
function selectedEv() { return EV.find(c => c.id === $('evSelect')?.value) || EV[0]; }
function selectedIce() { return IC.find(c => c.id === $('iceSelect')?.value) || IC[0]; }
function iceConsumption(c) { return c?.consumption_kg_100km || c?.consumption_l_100km || n('iceConsumption'); }
function baseFuelPrice(f) { const key = fuelKey(f); const fuel = P.fuel || {}; return fuel[key] || ({ benzina:1.82, diesel:1.70, gpl:.73, metano:1.45 }[f] || 1.82); }
function fuelPrice(f) { return isChecked('overrideFuelPrice') ? n('fuelCostPrice') : baseFuelPrice(f); }
function publicKwh() { return isChecked('overridePublicCharge') ? n('publicChargePrice') : (n('publicChargePrice') || T.market_average?.public_mixed || .74); }
function solarShareValue() { if (isChecked('noPv')) return 0; if (isChecked('unknownPv')) return UNKNOWN_PV_DEFAULT; return clamp(n('solarShare'), 0, 100); }
function blendedKwh() { const home = clamp(n('homeShare') / 100, 0, 1); const solar = solarShareValue() / 100; const homeCost = n('homePrice') * (1 - solar) + n('solarPrice') * solar; return home * homeCost + (1 - home) * publicKwh(); }
function powerKw(c) { if (c?.power_kw) return +c.power_kw; const price = c?.price_eur || 30000; if (c?.fuel === 'diesel') return price > 45000 ? 140 : price > 32000 ? 110 : 85; if (c?.fuel === 'gpl' || c?.fuel === 'metano') return 74; return price > 45000 ? 130 : price > 30000 ? 100 : 75; }
function estimateIceTax(c) { const kw = powerKw(c); return Math.round(kw <= 100 ? kw * 2.58 : 100 * 2.58 + (kw - 100) * 3.87); }
function estimateIceMaintenance(c) { let base = (c?.price_eur || 30000) * .018; if (c?.fuel === 'diesel') base += 100; if (c?.fuel === 'gpl' || c?.fuel === 'metano') base += 80; return Math.round(clamp(base, 350, 1300) / 10) * 10; }
function estimateEvMaintenance(c) { return Math.round(clamp((c?.price_eur || 35000) * .006, 180, 550) / 10) * 10; }
function estimateEvTax(c) { return Math.round(clamp(((c?.power_kw || 90) * 2.58) * .25, 45, 160) / 5) * 5; }

function setLock(inputId, checkboxId) { const el = $(inputId); if (!el) return; const editable = isChecked(checkboxId); el.readOnly = !editable; if (el.tagName === 'SELECT') el.disabled = !editable; el.classList.toggle('readonly', !editable); }
function refreshLocks() {
  [['evPurchase','overrideEvPurchase'],['icePurchase','overridePurchase'],['fuelCostPrice','overrideFuelPrice'],['publicChargePrice','overridePublicCharge'],['iceConsumption','overrideConsumption'],['evMaintenance','overrideEvMaintenance'],['iceMaintenance','overrideIceMaintenance'],['iceTax','overrideIceTax'],['evTaxAfter5','overrideEvTax']].forEach(x => setLock(x[0], x[1]));
  const noPv = isChecked('noPv'), unknownPv = isChecked('unknownPv');
  if ($('solarShare')) {
    $('solarShare').readOnly = noPv || unknownPv;
    $('solarShare').classList.toggle('readonly', noPv || unknownPv);
    if (noPv) $('solarShare').value = 0;
    if (unknownPv) $('solarShare').value = UNKNOWN_PV_DEFAULT;
  }
  if ($('solarPrice')) {
    $('solarPrice').readOnly = noPv;
    $('solarPrice').classList.toggle('readonly', noPv);
  }
}
function handlePvMode(mode) {
  if (mode === 'none' && isChecked('noPv')) $('unknownPv').checked = false;
  if (mode === 'unknown' && isChecked('unknownPv')) $('noPv').checked = false;
  refreshLocks();
  calculate();
}
function fillEvSelect() {
  const brand = $('evBrandPick').value;
  const current = $('evSelect').value;
  const arr = EV.filter(c => brand === 'all' || c.brand === brand);
  $('evSelect').innerHTML = arr.map(c => '<option value="' + c.id + '">' + c.brand + ' ' + c.model + '</option>').join('');
  if (arr.some(c => c.id === current)) $('evSelect').value = current; else if (arr[0]) $('evSelect').value = arr[0].id;
  $('evChoiceHint').textContent = '';
  setAutoFields(); calculate();
}
function fillIceSelect() {
  const fuel = $('iceFuelPick').value;
  const brand = $('iceBrandPick').value;
  const current = $('iceSelect').value;
  const arr = IC.filter(c => (fuel === 'all' || c.fuel === fuel) && (brand === 'all' || c.brand === brand));
  $('iceSelect').innerHTML = arr.map(c => '<option value="' + c.id + '">' + c.brand + ' ' + c.model + ' ' + (c.year || '') + '</option>').join('');
  if (arr.some(c => c.id === current)) $('iceSelect').value = current; else if (arr[0]) $('iceSelect').value = arr[0].id;
  $('iceChoiceHint').textContent = '';
  setAutoFields(); calculate();
}
function setAutoFields() {
  const e = selectedEv(); const i = selectedIce(); if (!e || !i) return;
  const rates = T.market_average || {};
  if (!isChecked('overrideEvPurchase')) $('evPurchase').value = e.price_eur || 35000;
  if (!isChecked('overridePurchase')) $('icePurchase').value = i.price_eur || 30000;
  if (!isChecked('overrideFuelPrice')) $('fuelCostPrice').value = baseFuelPrice(i.fuel).toFixed(3);
  if (!isChecked('overridePublicCharge')) $('publicChargePrice').value = (e.brand === 'Tesla' ? (rates.tesla_supercharger_owner || .50) : (rates.public_mixed || .74)).toFixed(2);
  if (!isChecked('overrideConsumption')) $('iceConsumption').value = iceConsumption(i);
  $('iceType').value = i.fuel;
  if (!isChecked('overrideEvMaintenance')) $('evMaintenance').value = estimateEvMaintenance(e);
  if (!isChecked('overrideIceMaintenance')) $('iceMaintenance').value = estimateIceMaintenance(i);
  if (!isChecked('overrideIceTax')) $('iceTax').value = estimateIceTax(i);
  if (!isChecked('overrideEvTax')) $('evTaxAfter5').value = estimateEvTax(e);
  refreshLocks(); drawCostCards();
}
function drawCostCards() {
  const e = selectedEv(); const i = selectedIce(); if (!e || !i) return;
  $('selectedFuelLabel').textContent = fuelLabel(i.fuel) + ' usato dalla termica';
  $('selectedFuelPrice').textContent = money2.format(fuelPrice(i.fuel)) + '/' + unit(i.fuel);
  $('selectedPublicLabel').textContent = e.brand === 'Tesla' ? 'Colonnine Tesla' : 'Colonnine pubbliche';
  $('selectedPublicPrice').textContent = money2.format(publicKwh()) + '/kWh';
  const fuelSource = P.fuel?.source ? 'fonte MIMIT/API carburanti (' + (P.fuel.frequency || 'aggiornamento disponibile') + ')' : 'valore seed MIMIT di fallback';
  $('costsFootnote').textContent = '* Il costo ' + fuelLabel(i.fuel).toLowerCase() + ' è preso da ' + fuelSource + '. Il costo colonnine è una stima media in data/charging.json; per Tesla viene usata una tariffa Supercharger indicativa. Manutenzione e bollo sono stimati in base a prezzo, potenza kW e carburante, poi modificabili con override.';
}
function drawSummary() {
  const e = selectedEv(), i = selectedIce(); if (!e || !i || !$('summaryGrid')) return;
  const rows = [['EV', e.brand + ' ' + e.model], ['Prezzo EV', money0.format(n('evPurchase'))], ['Termica', i.brand + ' ' + i.model], ['Prezzo termica', money0.format(n('icePurchase'))], ['Anni / km annui', n('years') + ' anni · ' + n('annualKm') + ' km'], ['Ricarica casa', n('homeShare') + '%'], ['Fotovoltaico', isChecked('noPv') ? 'No impianto' : isChecked('unknownPv') ? UNKNOWN_PV_DEFAULT + '% stimato' : solarShareValue() + '%'], ['Carburante', fuelLabel(i.fuel) + ' ' + money2.format(fuelPrice(i.fuel)) + '/' + unit(i.fuel)], ['Colonnine', money2.format(publicKwh()) + '/kWh'], ['Manutenzione EV / termica', money0.format(n('evMaintenance')) + ' / ' + money0.format(n('iceMaintenance')) + ' anno'], ['Bollo EV / termica', money0.format(n('evTaxAfter5')) + ' dopo 5 anni / ' + money0.format(n('iceTax')) + ' anno']];
  $('summaryGrid').innerHTML = rows.map(r => '<div><small>' + r[0] + '</small><b>' + r[1] + '</b></div>').join('');
}
function calculate() {
  const e = selectedEv(); const i = selectedIce(); if (!e || !i) return;
  const years = n('years'); const km = n('annualKm') * years;
  const evPer100 = e.consumption_kwh_100km * blendedKwh() / (T.charging_efficiency?.mixed || .90);
  const icePer100 = n('iceConsumption') * fuelPrice(i.fuel);
  const evTotal = n('evPurchase') + km / 100 * evPer100 + years * n('evMaintenance') + Math.max(0, years - 5) * n('evTaxAfter5');
  const iceTotal = n('icePurchase') + km / 100 * icePer100 + years * n('iceMaintenance') + years * n('iceTax');
  const saving = iceTotal - evTotal;
  const yearlyGain = n('annualKm') / 100 * (icePer100 - evPer100) + n('iceMaintenance') - n('evMaintenance') + n('iceTax');
  const upfrontDiff = n('evPurchase') - n('icePurchase');
  const breakEven = upfrontDiff <= 0 ? 'subito' : yearlyGain <= 0 ? 'mai' : upfrontDiff / yearlyGain > 30 ? '>30 anni' : num1.format(upfrontDiff / yearlyGain) + ' anni';
  lastResult = { e, i, years, kmAnnui:n('annualKm'), evPer100, icePer100, evTotal, iceTotal, saving, breakEven };
  $('savingTotal').textContent = (saving >= 0 ? '+' : '-') + money0.format(Math.abs(saving));
  $('evPer100').textContent = money2.format(evPer100);
  $('icePer100').textContent = money2.format(icePer100);
  $('breakEven').textContent = breakEven;
  $('explainBox').innerHTML = '<b>' + e.brand + ' ' + e.model + '</b> contro <b>' + i.brand + ' ' + i.model + '</b>. Colonnine: ' + money2.format(publicKwh()) + '/kWh ' + (e.brand === 'Tesla' ? '(tariffa Tesla indicativa)' : '') + '. Termica: ' + num1.format(n('iceConsumption')) + ' ' + unit(i.fuel) + '/100 km, carburante ' + money2.format(fuelPrice(i.fuel)) + '/' + unit(i.fuel) + '. Manutenzione e bollo sono stimati automaticamente, salvo override.';
  drawCostCards(); drawSummary(); updateShareLinks();
}
function shareText() { const r = lastResult; if (!r) return 'Ho confrontato elettrica e termica con Elettrica.'; return 'Confronto Elettrica: ' + r.e.brand + ' ' + r.e.model + ' vs ' + r.i.brand + ' ' + r.i.model + '. Risparmio stimato: ' + (r.saving >= 0 ? '+' : '-') + money0.format(Math.abs(r.saving)) + ' in ' + r.years + ' anni. Break-even: ' + r.breakEven + '.'; }
function updateShareLinks() { const text = encodeURIComponent(shareText()); const url = encodeURIComponent(location.href.split('#')[0]); $('shareWhatsapp').href = 'https://wa.me/?text=' + text + '%20' + url; $('shareFacebook').href = 'https://www.facebook.com/sharer/sharer.php?u=' + url; $('shareX').href = 'https://twitter.com/intent/tweet?text=' + text + '&url=' + url; $('shareLinkedin').href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + url; }
function downloadPdf() {
  const r = lastResult; if (!r) return;
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) { alert('Libreria PDF non disponibile. Puoi usare Copia riepilogo.'); return; }
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  doc.setFillColor(7,17,14); doc.rect(0,0,210,55,'F');
  doc.setFillColor(66,245,147); doc.roundedRect(14,13,15,15,4,4,'F');
  doc.setTextColor(245,255,249); doc.setFont('helvetica','bold'); doc.setFontSize(24); doc.text('Elettrica',36,22);
  doc.setFontSize(13); doc.setFont('helvetica','normal'); doc.text('Report confronto costo reale auto',36,31);
  doc.setTextColor(66,245,147); doc.setFont('helvetica','bold'); doc.setFontSize(28); doc.text((r.saving >= 0 ? '+' : '-') + money0.format(Math.abs(r.saving)),14,47);
  doc.setTextColor(245,255,249); doc.setFontSize(11); doc.text('Risparmio stimato in ' + r.years + ' anni',90,46);
  doc.setTextColor(16,24,23);
  function card(x,y,w,h,title,value,sub){ doc.setFillColor(247,250,248); doc.roundedRect(x,y,w,h,5,5,'F'); doc.setDrawColor(223,231,226); doc.roundedRect(x,y,w,h,5,5,'S'); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(100,115,110); doc.text(title,x+5,y+8); doc.setTextColor(16,24,23); doc.setFontSize(14); doc.text(String(value),x+5,y+18); if(sub){ doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(100,115,110); doc.text(String(sub),x+5,y+27,{maxWidth:w-10}); } }
  let y = 64;
  card(14,y,88,34,'AUTO ELETTRICA',r.e.brand + ' ' + r.e.model,'Prezzo: ' + money0.format(n('evPurchase')) + ' · ' + (r.e.year || 2026));
  card(108,y,88,34,'AUTO TERMICA',r.i.brand + ' ' + r.i.model,'Prezzo: ' + money0.format(n('icePurchase')) + ' · ' + (r.i.year || '-'));
  y += 42;
  card(14,y,56,30,'EV €/100 KM',money2.format(r.evPer100),'Ricarica mista');
  card(77,y,56,30,'TERMICA €/100 KM',money2.format(r.icePer100),fuelLabel(r.i.fuel));
  card(140,y,56,30,'BREAK-EVEN',r.breakEven,'Punto di pareggio');
  y += 40;
  card(14,y,88,36,'TCO EV',money0.format(r.evTotal),'Manutenzione: ' + money0.format(n('evMaintenance')) + '/anno');
  card(108,y,88,36,'TCO TERMICA',money0.format(r.iceTotal),'Manutenzione: ' + money0.format(n('iceMaintenance')) + '/anno');
  y += 46;
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(16,24,23); doc.text('Parametri usati',14,y);
  doc.setFont('helvetica','normal'); doc.setFontSize(10); y += 8;
  const lines = ['Km annui: ' + r.kmAnnui + ' · Anni: ' + r.years, 'Ricarica casa: ' + n('homeShare') + '% · Fotovoltaico: ' + (isChecked('noPv') ? 'no impianto' : isChecked('unknownPv') ? UNKNOWN_PV_DEFAULT + '% stimato' : solarShareValue() + '%'), 'Casa: ' + money2.format(n('homePrice')) + '/kWh · Colonnine: ' + money2.format(publicKwh()) + '/kWh', fuelLabel(r.i.fuel) + ': ' + money2.format(fuelPrice(r.i.fuel)) + '/' + unit(r.i.fuel) + ' · Consumo termica: ' + num1.format(n('iceConsumption')) + ' ' + unit(r.i.fuel) + '/100 km', 'Nota: prezzi auto, ricarica pubblica, manutenzione e bollo sono stime da verificare.'];
  lines.forEach(line => { doc.text(line,14,y,{maxWidth:180}); y += 7; });
  doc.setFillColor(236,248,242); doc.roundedRect(14,267,182,15,4,4,'F'); doc.setTextColor(65,85,76); doc.setFontSize(9); doc.text('Generato con Elettrica · confronto indicativo basato sui dati inseriti dall’utente',19,276);
  doc.save('report-confronto-elettrica.pdf');
}
async function shareNative() { const text = shareText(); if (navigator.share) { try { await navigator.share({ title:'Confronto Elettrica', text, url:location.href.split('#')[0] }); } catch {} } else { await navigator.clipboard?.writeText(text + ' ' + location.href.split('#')[0]); alert('Riepilogo copiato negli appunti.'); } }
async function copySummary() { await navigator.clipboard?.writeText(shareText()); alert('Riepilogo copiato.'); }
function setStep(step) { currentStep = clamp(step, 0, totalSteps - 1); document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', +s.dataset.step === currentStep)); $('progressBar').style.width = ((currentStep + 1) / totalSteps * 100) + '%'; $('stepLabel').textContent = (currentStep + 1) + ' di ' + totalSteps; $('stepTitleSmall').textContent = stepNames[currentStep]; $('prevStep').disabled = currentStep === 0; $('nextStep').innerHTML = currentStep === totalSteps - 1 ? 'Ricomincia <i class="fa-solid fa-rotate-left"></i>' : 'Avanti <i class="fa-solid fa-arrow-right"></i>'; calculate(); }
function bind() {
  $('prevStep').onclick = () => setStep(currentStep - 1);
  $('nextStep').onclick = () => currentStep === totalSteps - 1 ? setStep(0) : setStep(currentStep + 1);
  $('downloadPdf').onclick = downloadPdf; $('nativeShare').onclick = shareNative; $('btnShareTop').onclick = shareNative; $('copySummary').onclick = copySummary;
  $('evBrandPick').oninput = fillEvSelect; $('evSelect').oninput = () => { setAutoFields(); calculate(); };
  ['iceFuelPick','iceBrandPick'].forEach(id => $(id).oninput = fillIceSelect); $('iceSelect').oninput = () => { setAutoFields(); calculate(); };
  ['overrideEvPurchase','overridePurchase','overrideFuelPrice','overridePublicCharge','overrideConsumption','overrideEvMaintenance','overrideIceMaintenance','overrideIceTax','overrideEvTax'].forEach(id => $(id).oninput = () => { refreshLocks(); setAutoFields(); calculate(); });
  $('noPv').oninput = () => handlePvMode('none'); $('unknownPv').oninput = () => handlePvMode('unknown');
  document.querySelectorAll('input,select').forEach(el => { const skip = ['evBrandPick','evSelect','iceFuelPick','iceBrandPick','iceSelect','overrideEvPurchase','overridePurchase','overrideFuelPrice','overridePublicCharge','overrideConsumption','overrideEvMaintenance','overrideIceMaintenance','overrideIceTax','overrideEvTax','noPv','unknownPv']; if (!skip.includes(el.id)) el.oninput = calculate; });
}
async function init() {
  const data = await Promise.all([j('data/prices.json'), j('data/charging.json'), ...evFiles.map(oj), ...iceFiles.map(oj)]);
  P = data[0]; T = data[1]; EV = data.slice(2, 2 + evFiles.length).flatMap(x => x.cars || []); IC = data.slice(2 + evFiles.length).flatMap(x => x.cars || []);
  const seenEv = new Set(); EV = EV.filter(c => c.id && !seenEv.has(c.id) && seenEv.add(c.id)).sort((a,b) => a.price_eur - b.price_eur);
  const seenIce = new Set(); IC = IC.filter(c => c.id && !seenIce.has(c.id) && seenIce.add(c.id)).sort((a,b) => a.price_eur - b.price_eur);
  $('evBrandPick').innerHTML = optionList(uniq(EV.map(c => c.brand)), 'Tutte'); $('iceBrandPick').innerHTML = optionList(uniq(IC.map(c => c.brand)), 'Tutte'); $('homePrice').value = P.electricity?.home || .30;
  bind(); fillEvSelect(); fillIceSelect(); setStep(0);
}
init().catch(e => document.body.insertAdjacentHTML('afterbegin', '<div style="background:#ffdede;color:#4a0000;padding:12px;text-align:center">Errore dati: ' + e.message + '</div>'));
