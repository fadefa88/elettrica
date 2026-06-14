const $ = id => document.getElementById(id);
const money0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const num1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

let P = {}, EV = [], IC = [], T = {}, currentStep = 0, lastResult = null;
const stepNames = ['Benvenuto', 'Auto elettrica', 'Auto termica', 'Costi attuali', 'Parametri', 'Risultato'];
const evFiles = ['data/cars_ev.json','data/cars_ev_2.json','data/cars_ev_3.json','data/cars_ev_4.json','data/cars_ev_5.json','data/cars_ev_6.json','data/cars_ev_7.json','data/cars_ev_8.json'];
const iceFiles = ['data/ice_cars_seed.json','data/ice_cars_2.json'];

async function j(path) {
  const res = await fetch(path + '?v=' + Date.now());
  if (!res.ok) throw new Error(path);
  return res.json();
}
async function oj(path) {
  try { return await j(path); } catch { return { cars: [] }; }
}
function n(id) { return +($(id)?.value || 0); }
function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }
function fuelKey(f) { return f === 'diesel' ? 'gasolio' : f; }
function unit(f) { return f === 'metano' ? 'kg' : 'l'; }
function uniq(arr) { return [...new Set(arr.filter(Boolean))].sort(); }
function optionList(arr, allLabel = 'Tutte') {
  return '<option value="all">' + allLabel + '</option>' + arr.map(x => '<option value="' + x + '">' + x + '</option>').join('');
}
function isChecked(id) { return !!$(id)?.checked; }
function selectedEv() { return EV.find(c => c.id === $('evSelect').value) || EV[0]; }
function selectedIce() { return IC.find(c => c.id === $('iceSelect').value) || IC[0]; }
function iceConsumption(c) { return c?.consumption_kg_100km || c?.consumption_l_100km || n('iceConsumption'); }
function fuelPrice(f) {
  const key = fuelKey(f);
  const fuel = P.fuel || {};
  return fuel[key] || ({ benzina: 1.82, diesel: 1.70, gpl: 0.73, metano: 1.45 }[f] || 1.82);
}
function publicKwh() { return n('publicChargePrice') || T.market_average?.public_mixed || 0.74; }
function blendedKwh() {
  const home = clamp(n('homeShare') / 100, 0, 1);
  const solar = clamp(n('solarShare') / 100, 0, 1);
  const homeCost = n('homePrice') * (1 - solar) + n('solarPrice') * solar;
  return home * homeCost + (1 - home) * publicKwh();
}
function powerKw(c) {
  if (c?.power_kw) return +c.power_kw;
  const price = c?.price_eur || 30000;
  if (c?.fuel === 'diesel') return price > 45000 ? 140 : price > 32000 ? 110 : 85;
  if (c?.fuel === 'gpl' || c?.fuel === 'metano') return 74;
  return price > 45000 ? 130 : price > 30000 ? 100 : 75;
}
function estimateIceTax(c) {
  const kw = powerKw(c);
  return Math.round(kw <= 100 ? kw * 2.58 : 100 * 2.58 + (kw - 100) * 3.87);
}
function estimateIceMaintenance(c) {
  let base = (c?.price_eur || 30000) * 0.018;
  if (c?.fuel === 'diesel') base += 100;
  if (c?.fuel === 'gpl' || c?.fuel === 'metano') base += 80;
  return Math.round(clamp(base, 350, 1300) / 10) * 10;
}
function estimateEvMaintenance(c) { return Math.round(clamp((c?.price_eur || 35000) * 0.006, 180, 550) / 10) * 10; }
function estimateEvTax(c) { return Math.round(clamp(((c?.power_kw || 90) * 2.58) * 0.25, 45, 160) / 5) * 5; }

function setLock(inputId, checkboxId) {
  const el = $(inputId);
  if (!el) return;
  const editable = isChecked(checkboxId);
  el.readOnly = !editable;
  if (el.tagName === 'SELECT') el.disabled = !editable;
  el.classList.toggle('readonly', !editable);
}
function refreshLocks() {
  [['publicChargePrice','overridePublicCharge'],['iceType','overrideFuel'],['iceConsumption','overrideConsumption'],['icePurchase','overridePurchase'],['evMaintenance','overrideEvMaintenance'],['iceMaintenance','overrideIceMaintenance'],['iceTax','overrideIceTax'],['evTaxAfter5','overrideEvTax']].forEach(x => setLock(x[0], x[1]));
}
function fillEvSelect() {
  const brand = $('evBrandPick').value;
  const current = $('evSelect').value;
  const arr = EV.filter(c => brand === 'all' || c.brand === brand);
  $('evSelect').innerHTML = arr.map(c => '<option value="' + c.id + '">' + c.brand + ' ' + c.model + ' - ' + money0.format(c.price_eur) + '</option>').join('');
  if (arr.some(c => c.id === current)) $('evSelect').value = current;
  else if (arr[0]) $('evSelect').value = arr[0].id;
  $('evChoiceHint').textContent = arr.length + ' elettriche disponibili nel catalogo';
  setAutoFields();
  calculate();
}
function fillIceSelect() {
  const fuel = $('iceFuelPick').value;
  const brand = $('iceBrandPick').value;
  const current = $('iceSelect').value;
  const arr = IC.filter(c => (fuel === 'all' || c.fuel === fuel) && (brand === 'all' || c.brand === brand));
  $('iceSelect').innerHTML = arr.map(c => '<option value="' + c.id + '">' + c.brand + ' ' + c.model + ' ' + (c.year || '') + ' - da ' + money0.format(c.price_eur) + '</option>').join('');
  if (arr.some(c => c.id === current)) $('iceSelect').value = current;
  else if (arr[0]) $('iceSelect').value = arr[0].id;
  $('iceChoiceHint').textContent = arr.length + ' termiche disponibili nel catalogo';
  setAutoFields();
  calculate();
}
function drawMeta() {
  const e = selectedEv();
  const i = selectedIce();
  if (e) $('evMeta').innerHTML = '<b>Dati EV</b><br>Anno: ' + (e.year || 2026) + ' · Motorizzazione: ' + (e.powertrain || e.motor || 'elettrica') + ' · Prezzo: ' + money0.format(e.price_eur) + '<br><small>' + (e.price_source || e.price_note || 'Prezzo indicativo da verificare con configuratore/listino ufficiale') + '</small>';
  if (i) $('iceMeta').innerHTML = '<b>Dati termica</b><br>Anno: ' + (i.year || '-') + ' · Motorizzazione: ' + (i.powertrain || i.engine || i.model) + ' · Potenza: ' + (i.power_kw ? i.power_kw + ' kW' : 'stimata') + ' · Prezzo: ' + money0.format(i.price_eur) + '<br><small>' + (i.price_source || i.price_note || 'Prezzo indicativo da verificare con configuratore/listino ufficiale') + '</small>';
}
function setAutoFields() {
  const e = selectedEv();
  const i = selectedIce();
  if (!e || !i) return;
  const rates = T.market_average || {};
  if (!isChecked('overridePublicCharge')) $('publicChargePrice').value = (e.brand === 'Tesla' ? (rates.tesla_supercharger_owner || 0.50) : (rates.public_mixed || 0.74)).toFixed(2);
  if (!isChecked('overrideFuel')) $('iceType').value = i.fuel;
  if (!isChecked('overrideConsumption')) $('iceConsumption').value = iceConsumption(i);
  if (!isChecked('overridePurchase')) $('icePurchase').value = i.price_eur || 30000;
  if (!isChecked('overrideEvMaintenance')) $('evMaintenance').value = estimateEvMaintenance(e);
  if (!isChecked('overrideIceMaintenance')) $('iceMaintenance').value = estimateIceMaintenance(i);
  if (!isChecked('overrideIceTax')) $('iceTax').value = estimateIceTax(i);
  if (!isChecked('overrideEvTax')) $('evTaxAfter5').value = estimateEvTax(e);
  refreshLocks();
  drawMeta();
}
function drawCostCards() {
  $('priceGasoline').textContent = money2.format(fuelPrice('benzina')) + '/l';
  $('priceDiesel').textContent = money2.format(fuelPrice('diesel')) + '/l';
  $('priceGpl').textContent = money2.format(fuelPrice('gpl')) + '/l';
  $('priceMetano').textContent = money2.format(fuelPrice('metano')) + '/kg';
  $('priceHome').textContent = money2.format(n('homePrice')) + '/kWh';
  $('pricePublic').textContent = money2.format(publicKwh()) + '/kWh';
}
function calculate() {
  const e = selectedEv();
  const i = selectedIce();
  if (!e || !i) return;
  const years = n('years');
  const km = n('annualKm') * years;
  const evPer100 = e.consumption_kwh_100km * blendedKwh() / (T.charging_efficiency?.mixed || 0.90);
  const icePer100 = n('iceConsumption') * fuelPrice($('iceType').value);
  const evTotal = e.price_eur + km / 100 * evPer100 + years * n('evMaintenance') + Math.max(0, years - 5) * n('evTaxAfter5');
  const iceTotal = n('icePurchase') + km / 100 * icePer100 + years * n('iceMaintenance') + years * n('iceTax');
  const saving = iceTotal - evTotal;
  const yearlyGain = n('annualKm') / 100 * (icePer100 - evPer100) + n('iceMaintenance') - n('evMaintenance') + n('iceTax');
  const upfrontDiff = e.price_eur - n('icePurchase');
  const breakEven = upfrontDiff <= 0 ? 'subito' : yearlyGain <= 0 ? 'mai' : upfrontDiff / yearlyGain > 30 ? '>30 anni' : num1.format(upfrontDiff / yearlyGain) + ' anni';
  lastResult = { e, i, years, kmAnnui: n('annualKm'), evPer100, icePer100, evTotal, iceTotal, saving, breakEven };
  $('savingTotal').textContent = (saving >= 0 ? '+' : '-') + money0.format(Math.abs(saving));
  $('evPer100').textContent = money2.format(evPer100);
  $('icePer100').textContent = money2.format(icePer100);
  $('breakEven').textContent = breakEven;
  $('explainBox').innerHTML = '<b>' + e.brand + ' ' + e.model + '</b> contro <b>' + i.brand + ' ' + i.model + '</b>. Colonnine: ' + money2.format(publicKwh()) + '/kWh ' + (e.brand === 'Tesla' ? '(tariffa Tesla indicativa)' : '') + '. Termica: ' + num1.format(n('iceConsumption')) + ' ' + unit($('iceType').value) + '/100 km, carburante ' + money2.format(fuelPrice($('iceType').value)) + '/' + unit($('iceType').value) + '. Manutenzione e bollo sono stimati automaticamente, salvo override.';
  drawCostCards();
  updateShareLinks();
}
function shareText() {
  const r = lastResult;
  if (!r) return 'Ho confrontato elettrica e termica con Elettrica.';
  return 'Confronto Elettrica: ' + r.e.brand + ' ' + r.e.model + ' vs ' + r.i.brand + ' ' + r.i.model + '. Risparmio stimato: ' + (r.saving >= 0 ? '+' : '-') + money0.format(Math.abs(r.saving)) + ' in ' + r.years + ' anni. Break-even: ' + r.breakEven + '.';
}
function updateShareLinks() {
  const text = encodeURIComponent(shareText());
  const url = encodeURIComponent(location.href.split('#')[0]);
  $('shareWhatsapp').href = 'https://wa.me/?text=' + text + '%20' + url;
  $('shareFacebook').href = 'https://www.facebook.com/sharer/sharer.php?u=' + url;
  $('shareX').href = 'https://twitter.com/intent/tweet?text=' + text + '&url=' + url;
  $('shareLinkedin').href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + url;
}
function downloadPdf() {
  const r = lastResult;
  if (!r) return;
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) { alert('Libreria PDF non disponibile. Puoi usare Copia riepilogo.'); return; }
  const doc = new jsPDF();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Report confronto Elettrica', 14, 18);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  const lines = [
    'Auto elettrica: ' + r.e.brand + ' ' + r.e.model + ' (' + (r.e.year || 2026) + ')',
    'Auto termica: ' + r.i.brand + ' ' + r.i.model + ' (' + (r.i.year || '-') + ')',
    'Periodo: ' + r.years + ' anni - Km annui: ' + r.kmAnnui,
    'Risparmio stimato: ' + (r.saving >= 0 ? '+' : '-') + money0.format(Math.abs(r.saving)),
    'Break-even: ' + r.breakEven,
    'EV €/100 km: ' + money2.format(r.evPer100),
    'Termica €/100 km: ' + money2.format(r.icePer100),
    'TCO EV: ' + money0.format(r.evTotal),
    'TCO termica: ' + money0.format(r.iceTotal),
    'Ricarica casa: ' + n('homeShare') + '% - Fotovoltaico su casa: ' + n('solarShare') + '%',
    'Costo casa: ' + money2.format(n('homePrice')) + '/kWh - Colonnine: ' + money2.format(publicKwh()) + '/kWh',
    'Carburante: ' + money2.format(fuelPrice($('iceType').value)) + '/' + unit($('iceType').value),
    '',
    'Nota: prezzi auto, manutenzione, bollo e ricarica pubblica sono stime indicative da verificare.'
  ];
  let y = 34;
  lines.forEach(line => { doc.text(line, 14, y); y += 8; });
  doc.save('report-confronto-elettrica.pdf');
}
async function shareNative() {
  const text = shareText();
  if (navigator.share) {
    try { await navigator.share({ title: 'Confronto Elettrica', text, url: location.href.split('#')[0] }); } catch {}
  } else {
    await navigator.clipboard?.writeText(text + ' ' + location.href.split('#')[0]);
    alert('Riepilogo copiato negli appunti.');
  }
}
async function copySummary() {
  await navigator.clipboard?.writeText(shareText());
  alert('Riepilogo copiato.');
}
function setStep(step) {
  currentStep = clamp(step, 0, 5);
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', +s.dataset.step === currentStep));
  $('progressBar').style.width = ((currentStep + 1) / 6 * 100) + '%';
  $('stepLabel').textContent = (currentStep + 1) + ' di 6';
  $('stepTitleSmall').textContent = stepNames[currentStep];
  $('prevStep').disabled = currentStep === 0;
  $('nextStep').innerHTML = currentStep === 5 ? 'Ricomincia <i class="fa-solid fa-rotate-left"></i>' : 'Avanti <i class="fa-solid fa-arrow-right"></i>';
  calculate();
}
function bind() {
  $('prevStep').onclick = () => setStep(currentStep - 1);
  $('nextStep').onclick = () => currentStep === 5 ? setStep(0) : setStep(currentStep + 1);
  $('downloadPdf').onclick = downloadPdf;
  $('nativeShare').onclick = shareNative;
  $('btnShareTop').onclick = shareNative;
  $('copySummary').onclick = copySummary;
  $('evBrandPick').oninput = fillEvSelect;
  $('evSelect').oninput = () => { setAutoFields(); calculate(); };
  ['iceFuelPick','iceBrandPick'].forEach(id => $(id).oninput = fillIceSelect);
  $('iceSelect').oninput = () => { setAutoFields(); calculate(); };
  ['overridePublicCharge','overrideFuel','overrideConsumption','overridePurchase','overrideEvMaintenance','overrideIceMaintenance','overrideIceTax','overrideEvTax'].forEach(id => $(id).oninput = () => { refreshLocks(); setAutoFields(); calculate(); });
  document.querySelectorAll('input,select').forEach(el => {
    const skip = ['evBrandPick','evSelect','iceFuelPick','iceBrandPick','iceSelect','overridePublicCharge','overrideFuel','overrideConsumption','overridePurchase','overrideEvMaintenance','overrideIceMaintenance','overrideIceTax','overrideEvTax'];
    if (!skip.includes(el.id)) el.oninput = calculate;
  });
}
async function init() {
  const data = await Promise.all([j('data/prices.json'), j('data/charging.json'), ...evFiles.map(oj), ...iceFiles.map(oj)]);
  P = data[0];
  T = data[1];
  EV = data.slice(2, 2 + evFiles.length).flatMap(x => x.cars || []);
  IC = data.slice(2 + evFiles.length).flatMap(x => x.cars || []);
  const seenEv = new Set();
  EV = EV.filter(c => c.id && !seenEv.has(c.id) && seenEv.add(c.id)).sort((a,b) => a.price_eur - b.price_eur);
  const seenIce = new Set();
  IC = IC.filter(c => c.id && !seenIce.has(c.id) && seenIce.add(c.id)).sort((a,b) => a.price_eur - b.price_eur);
  $('evBrandPick').innerHTML = optionList(uniq(EV.map(c => c.brand)), 'Tutte');
  $('iceBrandPick').innerHTML = optionList(uniq(IC.map(c => c.brand)), 'Tutte');
  $('homePrice').value = P.electricity?.home || 0.30;
  $('updatedAt').textContent = 'Aggiornamento: ' + (P.updated_at || '-') + ' · ' + (P.status || '-');
  bind();
  fillEvSelect();
  fillIceSelect();
  setStep(0);
}
init().catch(e => document.body.insertAdjacentHTML('afterbegin', '<div style="background:#ffdede;color:#4a0000;padding:12px;text-align:center">Errore dati: ' + e.message + '</div>'));
