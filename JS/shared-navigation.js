// Shared Navigation Menu Component
// This file provides reusable navigation functionality across all pages

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNavigation);
    } else {
        initNavigation();
    }

    function initNavigation() {
        const navMenu = document.getElementById('nav-menu');
        const navOverlay = document.getElementById('nav-overlay');
        const hamburgerBtn = document.getElementById('hamburger-btn');
        const closeMenuBtn = document.getElementById('close-menu');

        if (!navMenu || !navOverlay || !hamburgerBtn || !closeMenuBtn) {
            console.warn('Navigation elements not found');
            return;
        }

        function openMenu() {
            navMenu.classList.add('open');
            navOverlay.classList.add('visible');
            // Try to play sound if available
            if (typeof playSound === 'function') {
                playSound('tap');
            }
        }

        function closeMenu() {
            navMenu.classList.remove('open');
            navOverlay.classList.remove('visible');
            // Try to play sound if available
            if (typeof playSound === 'function') {
                playSound('tap');
            }
        }

        // Click events
        hamburgerBtn.addEventListener('click', openMenu);
        closeMenuBtn.addEventListener('click', closeMenu);
        navOverlay.addEventListener('click', closeMenu);

        // Touch events for mobile
        hamburgerBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            openMenu();
        });
        
        closeMenuBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            closeMenu();
        });
        
        navOverlay.addEventListener('touchend', function(e) {
            e.preventDefault();
            closeMenu();
        });

        // Keyboard support
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && navMenu.classList.contains('open')) {
                closeMenu();
            }
        });
    }
})();
