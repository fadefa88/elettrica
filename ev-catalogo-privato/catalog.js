(function(){
  var statusEl = document.getElementById('status');
  function setStatus(msg, err){ statusEl.textContent = msg; statusEl.className = err ? 'status error' : 'status'; }
  setStatus('Script esterno avviato. Carico il catalogo...');

  var money = new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0});
  var num = new Intl.NumberFormat('it-IT',{maximumFractionDigits:1});
  var cars = [];
  var filtered = [];
  var page = 1;
  var loadedUrl = '';
  var paths = ['/data/cars_motornet.json','../data/cars_motornet.json','https://raw.githubusercontent.com/fadefa88/elettrica/main/data/cars_motornet.json'];

  function $(id){ return document.getElementById(id); }
  function txt(v){ return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function low(v){ return txt(v).toLowerCase(); }
  function esc(v){ return txt(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function toNum(v){
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = txt(v).replace(/[^0-9,.-]/g,'');
    if (!s) return 0;
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
    else if (s.indexOf(',') >= 0) s = s.replace(',','.');
    else if (s.indexOf('.') >= 0) { var p=s.split('.'); if (p.length>1 && p[p.length-1].length===3) s=p.join(''); }
    var n = Number(s); return isFinite(n) ? n : 0;
  }
  function val(id){ return toNum($(id).value); }
  function isEv(c){ var s = low([c.category,c.fuel,c.alimentazione,c.version,c.model].join(' ')); return s.indexOf('electric')>=0 || s.indexOf('elettric')>=0 || s.indexOf('bev')>=0; }
  function name(c){ return txt((c.brand||'')+' '+(c.model||'')) || 'Auto elettrica'; }
  function price(c){ return toNum(c.price_eur || c.price || c.prezzo); }
  function cons(c){ return toNum(c.consumption_kwh_100km || c.consumo_kwh_100km || c.consumption); }
  function range(c){ return toNum(c.range_wltp_km || c.autonomia_wltp_km || c.range); }
  function batt(c){ return toNum(c.battery_kwh || c.batteria_kwh || c.battery); }
  function power(c){ return toNum(c.power_kw || c.potenza_kw || c.kw); }
  function source(c){ return txt(c.source_url || c.url || c.model_url || ''); }

  function findArray(payload){
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.cars)) return payload.cars;
    if (payload && Array.isArray(payload.items)) return payload.items;
    if (payload && Array.isArray(payload.data)) return payload.data;
    return [];
  }

  function fetchPath(i){
    if (i >= paths.length) return Promise.reject(new Error('non trovo data/cars_motornet.json'));
    var u = paths[i] + '?v=' + Date.now();
    setStatus('Provo a caricare: ' + paths[i]);
    return fetch(u,{cache:'no-store'}).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      loadedUrl = paths[i];
      return r.json();
    }).catch(function(){ return fetchPath(i+1); });
  }

  function fillBrand(){
    var seen = {}, list = [];
    cars.forEach(function(c){ var b=txt(c.brand); if(b && !seen[b]){seen[b]=1; list.push(b);} });
    list.sort(function(a,b){return a.localeCompare(b,'it');});
    $('brand').innerHTML = '<option value="all">Tutte</option>' + list.map(function(b){return '<option value="'+esc(b)+'">'+esc(b)+'</option>';}).join('');
  }

  function apply(){
    var q = low($('q').value);
    var br = $('brand').value;
    var pmax = val('priceMax');
    var rmin = val('rangeMin');
    var cmax = val('consMax');
    var bmin = val('batteryMin');
    filtered = cars.filter(function(c){
      if (br !== 'all' && txt(c.brand) !== br) return false;
      if (q && low([c.brand,c.model,c.version,c.powertrain].join(' ')).indexOf(q) < 0) return false;
      if (pmax && (!price(c) || price(c) > pmax)) return false;
      if (rmin && range(c) < rmin) return false;
      if (cmax && (!cons(c) || cons(c) > cmax)) return false;
      if (bmin && batt(c) < bmin) return false;
      if ($('complete').value === 'yes' && (!price(c) || !cons(c) || !range(c))) return false;
      if ($('extreme').value === 'hide') {
        if (price(c) && (price(c)<5000 || price(c)>600000)) return false;
        if (cons(c) && (cons(c)<7 || cons(c)>40)) return false;
        if (range(c) && (range(c)<30 || range(c)>1000)) return false;
      }
      return true;
    });
    var sort = $('sortBy').value;
    filtered.sort(function(a,b){
      if (sort === 'priceAsc') return (price(a)||999999999)-(price(b)||999999999);
      if (sort === 'priceDesc') return (price(b)||0)-(price(a)||0);
      if (sort === 'consAsc') return (cons(a)||999999999)-(cons(b)||999999999);
      if (sort === 'rangeDesc') return (range(b)||0)-(range(a)||0);
      if (sort === 'batteryDesc') return (batt(b)||0)-(batt(a)||0);
      return name(a).localeCompare(name(b),'it');
    });
    page = 1;
    render();
  }

  function render(){
    var psRaw = $('pageSize').value;
    var ps = psRaw === 'all' ? filtered.length || 1 : Number(psRaw || 100);
    var pages = Math.max(1, Math.ceil(filtered.length / ps));
    if (page > pages) page = pages;
    var start = psRaw === 'all' ? 0 : (page-1)*ps;
    var visible = psRaw === 'all' ? filtered : filtered.slice(start,start+ps);
    var html = visible.map(function(c){
      var src = source(c);
      return '<tr>'+
        '<td><b>'+esc(name(c))+'</b><br><small>'+esc(c.version || c.powertrain || '')+'</small></td>'+
        '<td><span class="pill">'+(price(c)?money.format(price(c)):'-')+'</span></td>'+
        '<td>'+(cons(c)?num.format(cons(c))+' kWh/100 km':'-')+'</td>'+
        '<td>'+(range(c)?num.format(range(c))+' km':'-')+'</td>'+
        '<td>'+(batt(c)?num.format(batt(c))+' kWh':'-')+'</td>'+
        '<td>'+(power(c)?num.format(power(c))+' kW':'-')+'</td>'+
        '<td>'+(src ? '<a class="src" target="_blank" rel="noopener" href="'+esc(src)+'">Motornet</a>' : '-')+'</td>'+
      '</tr>';
    }).join('');
    $('rows').innerHTML = html;
    $('empty').hidden = visible.length > 0;
    $('statTotal').textContent = cars.length.toLocaleString('it-IT');
    $('statShown').textContent = filtered.length.toLocaleString('it-IT');
    var prices = filtered.map(price).filter(Boolean);
    var ranges = filtered.map(range).filter(Boolean);
    $('statMinPrice').textContent = prices.length ? money.format(Math.min.apply(Math,prices)) : '-';
    $('statMaxRange').textContent = ranges.length ? Math.max.apply(Math,ranges).toLocaleString('it-IT')+' km' : '-';
    $('pageLabel').textContent = psRaw === 'all' ? 'Tutte' : 'Pagina '+page+' / '+pages;
    $('prev').disabled = page <= 1 || psRaw === 'all';
    $('next').disabled = page >= pages || psRaw === 'all';
    $('sourceInfo').textContent = 'Origine: '+loadedUrl;
    setStatus('Caricate '+cars.length.toLocaleString('it-IT')+' elettriche. Visibili: '+filtered.length.toLocaleString('it-IT')+'.');
  }

  function bind(){
    ['q','brand','priceMax','rangeMin','consMax','batteryMin','sortBy','pageSize','complete','extreme'].forEach(function(id){
      $(id).addEventListener(id === 'q' ? 'input' : 'change', apply);
    });
    $('prev').onclick = function(){ page--; render(); };
    $('next').onclick = function(){ page++; render(); };
  }

  fetchPath(0).then(function(payload){
    var arr = findArray(payload);
    var seen = {};
    cars = arr.filter(function(c){
      if (!c || typeof c !== 'object' || !isEv(c)) return false;
      var k = txt(c.id) || name(c)+'|'+txt(c.version);
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
    if (!cars.length) throw new Error('JSON letto, ma 0 elettriche riconosciute su '+arr.length+' righe');
    fillBrand();
    bind();
    filtered = cars.slice();
    apply();
  }).catch(function(e){
    setStatus('Errore: '+e.message, true);
    $('empty').hidden = false;
  });
})();
