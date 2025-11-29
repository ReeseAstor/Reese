/**
 * Reese Astor - Luxury Author Website
 * Main JavaScript file
 */

document.addEventListener('DOMContentLoaded', function() {
    document.body.classList.add('js-ready');
    // Initialize all components
    initNavigation();
    initScrollEffects();
    initFormHandling();
});

/**
 * Navigation functionality
 */
function initNavigation() {
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    
    // Mobile menu toggle
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
            
            // Prevent body scroll when menu is open
            document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
        });
        
        // Close menu when clicking on a link
        const navLinks = navMenu.querySelectorAll('.nav-link');
        navLinks.forEach(function(link) {
            link.addEventListener('click', function() {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }
    
    // Navbar scroll effect
    if (navbar) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 100) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
        
        // Check initial scroll position
        if (window.scrollY > 100) {
            navbar.classList.add('scrolled');
        }
    }
}

/**
 * Scroll-based animations and effects
 */
function initScrollEffects() {
    // Fade in elements on scroll
    const fadeElements = document.querySelectorAll('.fade-on-scroll');
    
    if (fadeElements.length > 0) {
        const fadeObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in-up');
                    fadeObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });
        
        fadeElements.forEach(function(element) {
            fadeObserver.observe(element);
        });
    }
    
    // Smooth scroll for anchor links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(function(link) {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#') {
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });
}

/**
 * Form handling
 */
function initFormHandling() {
    // Newsletter form
    const newsletterForm = document.querySelector('.newsletter-form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const emailInput = this.querySelector('input[type="email"]');
            
            if (emailInput && emailInput.value) {
                // Show success message (in a real implementation, this would submit to a server)
                showNotification('Thank you for subscribing! Check your email for a confirmation.');
                emailInput.value = '';
            }
        });
    }
    
    // Contact form
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);
            
            // Basic validation
            if (data.name && data.email && data.message) {
                // Show success message (in a real implementation, this would submit to a server)
                showNotification('Thank you for your message! I will get back to you soon.');
                this.reset();
            } else {
                showNotification('Please fill in all required fields.', 'error');
            }
        });
    }
}

/**
 * Show notification message
 */
function showNotification(message, type) {
    type = type || 'success';
    
    // Remove existing notification
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification notification-' + type;
    notification.innerHTML = '\n        <span class="notification-message">' + message + '</span>\n        <button class="notification-close" aria-label="Close">&times;</button>\n    ';
    
    // Add styles
    notification.style.cssText = '\n        position: fixed;\n        bottom: 20px;\n        right: 20px;\n        background: ' + (type === 'success' ? '#1a1a1a' : '#c0392b') + ';\n        color: white;\n        padding: 1rem 1.5rem;\n        border-radius: 4px;\n        display: flex;\n        align-items: center;\n        gap: 1rem;\n        z-index: 9999;\n        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);\n        animation: slideIn 0.3s ease;\n    ';
    
    // Add animation keyframes
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = '\n            @keyframes slideIn {\n                from { transform: translateX(100%); opacity: 0; }\n                to { transform: translateX(0); opacity: 1; }\n            }\n        ';
        document.head.appendChild(style);
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Close button functionality
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.style.cssText = '\n        background: none;\n        border: none;\n        color: white;\n        font-size: 1.5rem;\n        cursor: pointer;\n        padding: 0;\n        line-height: 1;\n    ';
    closeBtn.addEventListener('click', function() {
        notification.remove();
    });
    
    // Auto-remove after 5 seconds
    setTimeout(function() {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

/**
 * Set active navigation link based on current page
 */
(function() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(function(link) {
        const href = link.getAttribute('href');
        if (href === currentPage || (currentPage === '' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
})();
