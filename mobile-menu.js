/* ═══════════════════════════════════════════════════════
   LAGENCO — Mobile Navigation Menu
   Hamburger menu voor mobiele apparaten (< 768px)
   Auto-injecteert menu + overlay op alle pagina's
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (window.__lagencoMobileMenuMounted) return;
  window.__lagencoMobileMenuMounted = true;

  function initMobileMenu() {
    // Only on pages with the main nav
    var nav = document.querySelector('nav.nav');
    if (!nav) return;

    // Create hamburger button
    var hamburger = document.createElement('button');
    hamburger.className = 'mobile-menu-toggle';
    hamburger.setAttribute('aria-label', 'Menu openen');
    hamburger.innerHTML = '<i class="fas fa-bars"></i>';
    hamburger.style.cssText = 'display:none';

    // Insert hamburger into nav (before login button)
    var navActions = nav.querySelector('.flex.items-center.gap-2');
    if (navActions && navActions.parentNode) {
      navActions.parentNode.insertBefore(hamburger, navActions);
    }

    // Create overlay + panel
    var overlay = document.createElement('div');
    overlay.className = 'mobile-nav-overlay';

    var panel = document.createElement('div');
    panel.className = 'mobile-nav-panel';

    // Build menu links (extract from desktop nav)
    var desktopLinks = nav.querySelectorAll('.nav-links-desktop a');
    var linksHtml = '<div class="mobile-nav-links">';
    var icons = {
      'assortiment': 'fa-shopping-bag',
      'reviews': 'fa-star',
      'over': 'fa-seedling',
      'kernwaarden': 'fa-heart',
      'voordelen': 'fa-heart',
      'werkwijze': 'fa-route',
      'zakelijk': 'fa-briefcase',
      'contact': 'fa-envelope',
      'home': 'fa-home',
      'leer': 'fa-info-circle',
      'live': 'fa-gavel',
      'community': 'fa-users'
    };

    // Add Home link
    linksHtml += '<a href="index.html"><i class="fas fa-home"></i> Home</a>';

    desktopLinks.forEach(function (link) {
      var href = link.getAttribute('href');
      var text = link.textContent.trim();
      var iconClass = 'fa-arrow-right';
      var textLower = text.toLowerCase();
      for (var key in icons) {
        if (textLower.includes(key)) { iconClass = icons[key]; break; }
      }
      linksHtml += '<a href="' + href + '"><i class="fas ' + iconClass + '"></i> ' + text + '</a>';
    });

    // Add extra links
    linksHtml += '<a href="leer-ons-kennen.html"><i class="fas fa-info-circle"></i> Leer ons kennen</a>';
    linksHtml += '</div>';

    // Footer with login button
    linksHtml += '<div class="mobile-nav-footer">';
    linksHtml += '<button class="btn btn-green" style="width:100%;justify-content:center;padding:.75rem" id="mobileLoginBtn"><i class="fas fa-user"></i> Inloggen</button>';
    linksHtml += '</div>';

    panel.innerHTML = '<button class="mobile-nav-close" aria-label="Menu sluiten"><i class="fas fa-times"></i></button>' + linksHtml;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    // Toggle menu
    function openMenu() {
      overlay.classList.add('open');
      panel.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeMenu() {
      overlay.classList.remove('open');
      panel.classList.remove('open');
      document.body.style.overflow = '';
    }

    hamburger.addEventListener('click', openMenu);
    overlay.addEventListener('click', closeMenu);
    panel.querySelector('.mobile-nav-close').addEventListener('click', closeMenu);

    // Close menu on link click
    panel.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        setTimeout(closeMenu, 150);
      });
    });

    // Mobile login button → trigger desktop login
    var mobileLoginBtn = panel.querySelector('#mobileLoginBtn');
    if (mobileLoginBtn) {
      mobileLoginBtn.addEventListener('click', function () {
        closeMenu();
        var loginBtn = document.getElementById('loginBtn');
        if (loginBtn) loginBtn.click();
      });
    }

    // Show/hide hamburger based on screen size
    function checkScreenSize() {
      if (window.innerWidth <= 768) {
        hamburger.style.display = 'flex';
      } else {
        hamburger.style.display = 'none';
        closeMenu();
      }
    }
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
  } else {
    initMobileMenu();
  }
})();
