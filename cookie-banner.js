(function(){
  const STORAGE_KEY='eot_cookie_choice';
  const START_YEAR=2026;
  const SITE_NAME='Elettrica o Termica';
  const SITE_URL='elettricaotermica.it';

  function saveChoice(choice){
    try{localStorage.setItem(STORAGE_KEY,choice)}catch(e){}
    const banner=document.getElementById('cookieBanner');
    if(banner) banner.classList.remove('is-visible');
    if(choice==='accepted' && typeof window.EOT_ENABLE_ANALYTICS==='function') window.EOT_ENABLE_ANALYTICS();
  }
  function readChoice(){try{return localStorage.getItem(STORAGE_KEY)}catch(e){return null}}
  function showBanner(){
    if(document.getElementById('cookieBanner')) return;
    const banner=document.createElement('div');
    banner.id='cookieBanner';
    banner.className='cookie-banner';
    banner.setAttribute('role','dialog');
    banner.setAttribute('aria-label','Preferenze cookie');
    banner.innerHTML='<p><b>Cookie e analytics</b>Usiamo solo cookie tecnici e, se accetti, analytics aggregati. <a href="/privacy.html">Leggi privacy e cookie</a>.</p><div class="cookie-actions"><button type="button" class="ghost" data-cookie-choice="rejected">Rifiuta</button><button type="button" data-cookie-choice="accepted">Accetta analytics</button></div>';
    document.body.appendChild(banner);
    banner.addEventListener('click',function(ev){const btn=ev.target.closest('[data-cookie-choice]'); if(btn) saveChoice(btn.getAttribute('data-cookie-choice'))});
    setTimeout(function(){banner.classList.add('is-visible')},250);
  }

  function byId(id){return document.getElementById(id)}
  function clean(v){return String(v||'').replace(/\s+/g,' ').trim()}
  function money(v){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(v)||0)}
  function text(sel,fallback){const el=document.querySelector(sel);return clean(el&&el.textContent)||fallback||''}
  function currentYearLabel(){const y=new Date().getFullYear();return y<=START_YEAR?String(START_YEAR):START_YEAR+'-'+y}

  function installFooter(){
    const shell=document.querySelector('.app-shell');
    if(!shell || document.querySelector('.site-footer')) return;
    const footer=document.createElement('footer');
    footer.className='site-footer';
    footer.innerHTML='<div class="footer-brand"><span class="copyright-icon">©</span><span><span data-footer-years>'+currentYearLabel()+'</span> '+SITE_NAME+' · '+SITE_URL+'</span></div><div class="footer-links"><a href="/">Calcolatore</a><a href="/guida.html">Guida</a><a href="/metodologia.html">Metodologia</a><a href="/privacy.html">Privacy</a></div>';
    shell.appendChild(footer);
  }

  async function loadGuideCatalog(){
    if(window.EV && window.IC && window.EV.length && window.IC.length) return;
    try{
      const r=await fetch('/data/cars_motornet.json',{cache:'no-store'});
      if(!r.ok) return;
      const payload=await r.json();
      const cars=(payload.cars||[]).filter(function(c){return c&&clean(c.id)&&clean(c.brand)&&clean(c.model)});
      const seenEv=new Set(),seenIc=new Set();
      window.EV=cars.filter(function(c){const ok=clean(c.category)==='electric'&&!seenEv.has(c.id); if(ok)seenEv.add(c.id); return ok;});
      window.IC=cars.filter(function(c){const ok=clean(c.category)!=='electric'&&!seenIc.has(c.id); if(ok)seenIc.add(c.id); return ok;});
      window.__eotGuideCatalogReady=true;
    }catch(e){}
  }

  function imageToJpegDataUrl(src){
    return new Promise(function(resolve){
      if(!src) return resolve(null);
      const img=new Image();
      img.crossOrigin='anonymous';
      img.onload=function(){
        try{
          const canvas=document.createElement('canvas');
          const maxW=720;
          const ratio=Math.min(1,maxW/img.naturalWidth);
          canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
          canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
          const ctx=canvas.getContext('2d');
          ctx.fillStyle='#f7faf8';
          ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL('image/jpeg',0.88));
        }catch(e){resolve(null)}
      };
      img.onerror=function(){resolve(null)};
      try{img.src=new URL(src,location.href).href}catch(e){resolve(null)}
    });
  }

  function addWrappedText(doc,value,x,y,maxWidth,lineHeight){
    const lines=doc.splitTextToSize(String(value||''),maxWidth);
    lines.forEach(function(line){doc.text(line,x,y);y+=lineHeight});
    return y;
  }

  async function enhancedPdf(){
    const jsPDF=window.jspdf&&window.jspdf.jsPDF;
    if(!jsPDF){alert('Libreria PDF non disponibile.');return}
    const saving=text('#savingTotal','-');
    if(!saving || saving==='-'){alert('Genera prima il risultato finale.');return}

    const evName=text('#reportEvVisual b','Auto elettrica scelta');
    const iceName=text('#reportIceVisual b','Auto termica scelta');
    const evImg=document.querySelector('#reportEvVisual img.car-photo');
    const iceImg=document.querySelector('#reportIceVisual img.car-photo');
    const logo=await imageToJpegDataUrl('/assets/logopippo.png');
    const evPhoto=await imageToJpegDataUrl(evImg&&evImg.getAttribute('src'));
    const icePhoto=await imageToJpegDataUrl(iceImg&&iceImg.getAttribute('src'));

    const doc=new jsPDF({unit:'mm',format:'a4'});
    doc.setFillColor(7,17,14);doc.rect(0,0,210,64,'F');
    doc.setFillColor(12,59,40);doc.roundedRect(10,10,190,44,8,8,'F');
    if(logo) doc.addImage(logo,'JPEG',16,15,20,20);
    doc.setTextColor(245,255,249);doc.setFont('helvetica','bold');doc.setFontSize(24);doc.text('Elettrica o Termica',42,23);
    doc.setFont('helvetica','normal');doc.setFontSize(11);doc.setTextColor(205,232,220);doc.text('Report confronto costo reale auto · '+SITE_URL,42,31);
    doc.setFont('helvetica','bold');doc.setTextColor(66,245,147);doc.setFontSize(26);doc.text(saving,42,45);
    doc.setFontSize(10);doc.setTextColor(205,232,220);doc.text('Risparmio stimato nel periodo selezionato',104,44);

    function card(x,y,w,h,title,value,sub,photo,type){
      doc.setFillColor(247,250,248);doc.roundedRect(x,y,w,h,6,6,'F');doc.setDrawColor(223,231,226);doc.roundedRect(x,y,w,h,6,6,'S');
      if(photo){doc.addImage(photo,'JPEG',x+4,y+5,w-8,32)}else{doc.setFillColor(type==='ev'?236:239,type==='ev'?248:244,type==='ev'?242:240);doc.roundedRect(x+4,y+5,w-8,32,5,5,'F')}
      doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(type==='ev'?17:95,type==='ev'?184:90,type==='ev'?112:70);doc.text(title,x+5,y+44);
      doc.setFontSize(12);doc.setTextColor(16,24,23);doc.text(String(value),x+5,y+53,{maxWidth:w-10});
      if(sub){doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(100,115,110);doc.text(String(sub),x+5,y+62,{maxWidth:w-10})}
    }
    let y=72;
    card(14,y,88,70,'AUTO ELETTRICA',evName,text('#evPer100','')+' / 100 km',evPhoto,'ev');
    card(108,y,88,70,'AUTO TERMICA',iceName,text('#icePer100','')+' / 100 km',icePhoto,'ice');
    y+=82;
    doc.setFillColor(236,248,242);doc.roundedRect(14,y,182,32,6,6,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(16,24,23);doc.text('Sintesi del confronto',20,y+10);
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(65,85,76);
    doc.text('Elettrica €/100 km: '+text('#evPer100','-')+' · Termica €/100 km: '+text('#icePer100','-')+' · Break-even: '+text('#breakEven','-'),20,y+20,{maxWidth:170});
    y+=46;
    doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(16,24,23);doc.text('Dettaglio generato dal calcolatore',14,y);y+=8;
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(65,85,76);
    y=addWrappedText(doc,text('#explainBox','Il confronto usa i dati inseriti nel calcolatore, inclusi carburante, ricarica, manutenzione, bollo e anni di possesso.'),14,y,182,5);
    y+=4;
    doc.setDrawColor(223,231,226);doc.line(14,y,196,y);y+=8;
    doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(16,24,23);doc.text('Nota metodologica',14,y);y+=7;
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(65,85,76);
    y=addWrappedText(doc,'Il report è una stima indicativa. Prezzi di acquisto, valore residuo, assicurazione, manutenzione, bollo, superbollo, tariffe energia e carburanti possono variare. Verifica sempre dati reali e condizioni locali prima di decidere.',14,y,182,5);

    doc.setFillColor(7,17,14);doc.roundedRect(14,268,182,14,5,5,'F');
    doc.setTextColor(245,255,249);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('Generato dal sito '+SITE_URL,20,277);
    doc.setTextColor(66,245,147);doc.text('© '+currentYearLabel()+' '+SITE_NAME,143,277);
    doc.save('report-elettricaotermica.pdf');
  }

  function patchPdfButton(){
    const btn=byId('downloadPdf');
    if(!btn || btn.dataset.eotPdfEnhanced==='1') return;
    btn.dataset.eotPdfEnhanced='1';
    btn.onclick=function(ev){if(ev)ev.preventDefault(); enhancedPdf(); return false};
  }

  window.EOT_RESET_COOKIE_CHOICE=function(){try{localStorage.removeItem(STORAGE_KEY)}catch(e){} showBanner()};

  document.addEventListener('DOMContentLoaded',function(){
    const choice=readChoice();
    if(!choice) showBanner();
    else if(choice==='accepted' && typeof window.EOT_ENABLE_ANALYTICS==='function') window.EOT_ENABLE_ANALYTICS();
    const reset=document.getElementById('resetCookieChoice');
    if(reset) reset.addEventListener('click',window.EOT_RESET_COOKIE_CHOICE);
    installFooter();
    loadGuideCatalog();
    patchPdfButton();
    setTimeout(patchPdfButton,1200);
    setTimeout(patchPdfButton,3000);
  });
  window.addEventListener('load',function(){installFooter();loadGuideCatalog();patchPdfButton();});
  window.addEventListener('motornet:catalog-ready',function(){loadGuideCatalog();patchPdfButton();});
})();
