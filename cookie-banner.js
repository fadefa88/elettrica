(function(){
  const STORAGE_KEY='eot_cookie_choice';
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
  window.EOT_RESET_COOKIE_CHOICE=function(){try{localStorage.removeItem(STORAGE_KEY)}catch(e){} showBanner()};
  document.addEventListener('DOMContentLoaded',function(){
    const choice=readChoice();
    if(!choice) showBanner();
    else if(choice==='accepted' && typeof window.EOT_ENABLE_ANALYTICS==='function') window.EOT_ENABLE_ANALYTICS();
    const reset=document.getElementById('resetCookieChoice');
    if(reset) reset.addEventListener('click',window.EOT_RESET_COOKIE_CHOICE);
  });
})();
