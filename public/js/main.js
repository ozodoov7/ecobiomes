// ECOBIOME Laboratory — shared behaviour
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        closeSubmenus();
        link.blur();
      });
    });
  }

  // Research submenu (desktop dropdown + mobile accordion)
  var subItems = document.querySelectorAll('.main-nav .has-sub');

  function closeSubmenus(except) {
    subItems.forEach(function (item) {
      if (item === except) return;
      item.classList.remove('open');
      var btn = item.querySelector('.sub-toggle');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  subItems.forEach(function (item) {
    var btn = item.querySelector('.sub-toggle');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      closeSubmenus(item);
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.has-sub')) closeSubmenus();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSubmenus();
  });

  // Mark active nav link based on current page
  function pageOf(pathname) {
    if (/^\/news\/[^/]+\.html$/.test(pathname)) return 'news.html';
    return pathname.split('/').pop() || 'index.html';
  }
  var path = pageOf(window.location.pathname);
  document.querySelectorAll('.main-nav a').forEach(function (link) {
    if (link.hash || link.origin !== window.location.origin) return;
    if (pageOf(link.pathname) === path) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });

  // Publications search/filter (publications.html)
  var searchInput = document.getElementById('pub-search');
  var yearFilter = document.getElementById('pub-year-filter');
  var areaFilter = document.getElementById('pub-area-filter');
  var pubItems = document.querySelectorAll('.pub-item');
  var yearGroups = document.querySelectorAll('.pub-year-group');

  // Case-, accent- and apostrophe-insensitive (o' = oʻ = o‘), every word must match (any order)
  function normText(s) {
    s = String(s || '').replace(/[\u2018\u2019\u02BB\u02BC\u0060\u00B4]/g, "'");
    if (s.normalize) s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    return s.toLowerCase();
  }
  var pubTexts = [];
  pubItems.forEach(function (item, i) { pubTexts[i] = normText(item.textContent); });
  var pubCount = document.getElementById('pub-count');

  function filterPublications() {
    if (!pubItems.length) return;
    // "exact phrase" in quotes stays together; numbers match whole numbers only (7 ≠ 1997)
    var raw = normText(searchInput && searchInput.value || '');
    var words = [];
    raw = raw.replace(/"([^"]+)"/g, function (m, ph) { words.push(ph.trim()); return ' '; });
    words = words.concat(raw.split(/[\s,;"]+/).filter(Boolean));
    var tests = words.map(function (w) {
      if (/^\d+$/.test(w)) { var re = new RegExp('(^|\\D)' + w + '(\\D|$)'); return function (t) { return re.test(t); }; }
      return function (t) { return t.indexOf(w) !== -1; };
    });
    var year = yearFilter && yearFilter.value || 'all';
    var area = areaFilter && areaFilter.value || 'all';
    var shown = 0;

    pubItems.forEach(function (item, i) {
      var text = pubTexts[i];
      var itemYear = item.getAttribute('data-year');
      var itemArea = item.getAttribute('data-area');
      var matches = tests.every(function (fn) { return fn(text); }) &&
        (year === 'all' || itemYear === year) &&
        (area === 'all' || itemArea === area);
      item.style.display = matches ? '' : 'none';
      if (matches) shown++;
    });
    if (pubCount) pubCount.textContent = (pubCount.getAttribute('data-template') || '{n} / {total}').replace('{n}', shown).replace('{total}', pubItems.length);

    yearGroups.forEach(function (group) {
      var visible = group.querySelectorAll('.pub-item:not([style*="display: none"])').length;
      group.style.display = visible ? '' : 'none';
    });
  }

  [searchInput, yearFilter, areaFilter].forEach(function (el) {
    if (el) el.addEventListener('input', filterPublications);
  });
  if (searchInput && window.URLSearchParams) {
    var preset = new URLSearchParams(window.location.search).get('q');
    if (preset) searchInput.value = preset;
  }
  filterPublications();

  // Contact form — sends to /contact (stored in the admin panel's Messages)
  var form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = document.getElementById('form-status');
      var button = form.querySelector('button[type="submit"]');
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      if (button) button.disabled = true;
      fetch(form.getAttribute('action') || '/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(data)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) { return { ok: r.ok, body: body }; });
      }).then(function (res) {
        if (status) {
          status.textContent = res.ok ? (form.getAttribute('data-success') || 'Thank you — your message has been sent.') : (res.body.error || 'Something went wrong. Please try again.');
          status.style.color = res.ok ? '' : '#b42318';
          status.style.display = 'block';
        }
        if (res.ok) form.reset();
      }).catch(function () {
        if (status) { status.textContent = 'Network error. Please try again.'; status.style.color = '#b42318'; status.style.display = 'block'; }
      }).then(function () { if (button) button.disabled = false; });
    });
  }

  // Hero slideshow (home page)
  var slideshow = document.getElementById('hero-slideshow');
  if (slideshow && slideshow.querySelectorAll('.slide').length > 1) {
    var slides = Array.prototype.slice.call(slideshow.querySelectorAll('.slide'));
    var dots = Array.prototype.slice.call(slideshow.querySelectorAll('.hero-dots button'));
    var eyebrowEl = document.getElementById('hero-eyebrow');
    var titleEl = document.getElementById('hero-title');
    var current = 0;
    var timer = null;
    var SLIDE_DURATION = Math.max(300, parseInt(slideshow.getAttribute('data-interval'), 10) || 10000);
    var actions = slideshow.querySelector('.hero-actions');
    var actionLinks = actions ? actions.querySelectorAll('a') : [];

    function setButton(n, slideEl) {
      var a = actionLinks[n - 1];
      if (!a) return;
      var label = slideEl.getAttribute('data-btn' + n + '-label') || actions.getAttribute('data-default-btn' + n + '-label');
      var url = slideEl.getAttribute('data-btn' + n + '-label') ? slideEl.getAttribute('data-btn' + n + '-url') : actions.getAttribute('data-default-btn' + n + '-url');
      if (label) a.textContent = label;
      if (url) a.setAttribute('href', url);
    }

    function showSlide(index) {
      slides[current].classList.remove('active');
      dots[current].classList.remove('active');
      dots[current].setAttribute('aria-selected', 'false');

      current = (index + slides.length) % slides.length;

      slides[current].classList.add('active');
      dots[current].classList.add('active');
      dots[current].setAttribute('aria-selected', 'true');

      var slideEl = slides[current];
      if (eyebrowEl) eyebrowEl.textContent = slideEl.getAttribute('data-eyebrow');
      if (titleEl) titleEl.textContent = slideEl.getAttribute('data-title');
      setButton(1, slideEl);
      setButton(2, slideEl);

      var activeImg = slideEl.querySelector('img');
      if (activeImg) activeImg.loading = 'eager';
    }

    function startTimer() {
      if (timer) clearInterval(timer);
      timer = setInterval(function () {
        showSlide(current + 1);
      }, SLIDE_DURATION);
    }

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        showSlide(i);
        startTimer();
      });
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (timer) clearInterval(timer);
      } else {
        startTimer();
      }
    });

    startTimer();
  }

  // Section tabs (research.html): highlight the tab for the section in view
  var tabLinks = Array.prototype.slice.call(document.querySelectorAll('.section-tabs a[href^="#"]'));
  if (tabLinks.length) {
    var tabTargets = tabLinks.map(function (a) {
      return document.getElementById(a.getAttribute('href').slice(1));
    });

    function updateTabs() {
      var offset = 150;
      var activeIndex = 0;
      tabTargets.forEach(function (target, i) {
        if (target && target.getBoundingClientRect().top - offset <= 0) activeIndex = i;
      });
      tabLinks.forEach(function (a, i) {
        var on = i === activeIndex;
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { updateTabs(); ticking = false; });
    }, { passive: true });
    window.addEventListener('hashchange', updateTabs);
    window.addEventListener('load', updateTabs);
    updateTabs();
  }

  // Footer year
  document.querySelectorAll('.current-year').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
});
