/**
 * Reese Astor - Luxury Author Website
 * Main JavaScript file
 * Enhanced with error handling, accessibility, and performance optimizations
 */

(function() {
    'use strict';

    // Check if browser supports required features
    if (!('IntersectionObserver' in window)) {
        console.warn('IntersectionObserver not supported, scroll animations may not work');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        try {
            document.body.classList.add('js-ready');
            initNavigation();
            initScrollEffects();
            initFormHandling();
            initServiceWorker();
            initKeyboardNavigation();
        } catch (error) {
            console.error('Error initializing application:', error);
        }
    }
})();

/**
 * Navigation functionality with enhanced accessibility
 */
function initNavigation() {
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    
    if (!navbar || !navToggle || !navMenu) {
        return;
    }
    
    // Mobile menu toggle with ARIA updates
    navToggle.addEventListener('click', function() {
        const isActive = navMenu.classList.toggle('active');
        navToggle.classList.toggle('active');
        
        // Update ARIA attributes
        navToggle.setAttribute('aria-expanded', isActive);
        navMenu.setAttribute('aria-hidden', !isActive);
        
        // Prevent body scroll when menu is open
        document.body.style.overflow = isActive ? 'hidden' : '';
        
        // Focus management
        if (isActive) {
            const firstLink = navMenu.querySelector('.nav-link');
            if (firstLink) {
                firstLink.focus();
            }
        }
    });
    
    // Close menu when clicking on a link
    const navLinks = navMenu.querySelectorAll('.nav-link');
    navLinks.forEach(function(link) {
        link.addEventListener('click', function() {
            navMenu.classList.remove('active');
            navToggle.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        });
    });
    
    // Close menu on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
            navToggle.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            navToggle.focus();
        }
    });
    
    // Navbar scroll effect with throttling for performance
    let ticking = false;
    function updateNavbar() {
        if (window.scrollY > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        ticking = false;
    }
    
    window.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(updateNavbar);
            ticking = true;
        }
    }, { passive: true });
    
    // Check initial scroll position
    if (window.scrollY > 100) {
        navbar.classList.add('scrolled');
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
 * Enhanced form handling with validation and accessibility
 */
function initFormHandling() {
    // Newsletter form
    const newsletterForm = document.querySelector('.newsletter-form');
    if (newsletterForm) {
        const emailInput = newsletterForm.querySelector('input[type="email"]');
        const submitButton = newsletterForm.querySelector('button[type="submit"]');
        
        // Real-time email validation
        if (emailInput) {
            emailInput.addEventListener('blur', function() {
                validateEmail(this);
            });
            
            emailInput.addEventListener('input', function() {
                if (this.classList.contains('error')) {
                    validateEmail(this);
                }
            });
        }
        
        newsletterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            if (!emailInput || !emailInput.value) {
                showNotification('Please enter your email address.', 'error');
                emailInput?.focus();
                return;
            }
            
            if (!validateEmail(emailInput)) {
                showNotification('Please enter a valid email address.', 'error');
                emailInput.focus();
                return;
            }
            
            // Disable submit button during processing
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.classList.add('loading');
                submitButton.textContent = 'Subscribing...';
            }
            
            // API call to subscribe (with double opt-in)
            const API_BASE = window.location.origin;
            fetch(API_BASE + '/api/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: emailInput.value })
            })
            .then(function(response) {
                return response.json();
            })
            .then(function(data) {
                if (data.success) {
                    showNotification(data.message || 'Please check your email to verify your subscription.', 'success');
                    newsletterForm.reset();
                } else {
                    showNotification(data.error || 'An error occurred. Please try again.', 'error');
                }
            })
            .catch(function(error) {
                console.error('Subscription error:', error);
                showNotification('An error occurred. Please try again later.', 'error');
            })
            .finally(function() {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.classList.remove('loading');
                    submitButton.textContent = 'Subscribe';
                }
            });
        });
    }
    
    // Contact form
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        const inputs = contactForm.querySelectorAll('input, textarea, select');
        const submitButton = contactForm.querySelector('button[type="submit"]');
        
        // Real-time validation
        inputs.forEach(function(input) {
            input.addEventListener('blur', function() {
                validateField(this);
            });
            
            input.addEventListener('input', function() {
                if (this.classList.contains('error')) {
                    validateField(this);
                }
            });
        });
        
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            let isValid = true;
            inputs.forEach(function(input) {
                if (!validateField(input)) {
                    isValid = false;
                }
            });
            
            if (!isValid) {
                showNotification('Please fill in all required fields correctly.', 'error');
                const firstError = contactForm.querySelector('.error');
                if (firstError) {
                    firstError.focus();
                }
                return;
            }
            
            // Disable submit button during processing
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.classList.add('loading');
                submitButton.textContent = 'Sending...';
            }
            
            // Simulate API call (replace with actual implementation)
            setTimeout(function() {
                showNotification('Thank you for your message! I will get back to you soon.', 'success');
                contactForm.reset();
                
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.classList.remove('loading');
                    submitButton.textContent = 'Send Message';
                }
            }, 1500);
        });
    }
}

/**
 * Validate email field
 */
function validateEmail(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(input.value);
    const errorElement = document.getElementById(input.id + '-error');
    
    if (input.value && !isValid) {
        input.classList.add('error');
        input.setAttribute('aria-invalid', 'true');
        if (errorElement) {
            errorElement.textContent = 'Please enter a valid email address.';
        }
        return false;
    } else {
        input.classList.remove('error');
        input.setAttribute('aria-invalid', 'false');
        if (errorElement) {
            errorElement.textContent = '';
        }
        return true;
    }
}

/**
 * Validate form field
 */
function validateField(input) {
    const isRequired = input.hasAttribute('required');
    const isEmpty = !input.value.trim();
    const errorElement = document.getElementById(input.id + '-error');
    
    if (isRequired && isEmpty) {
        input.classList.add('error');
        input.setAttribute('aria-invalid', 'true');
        if (errorElement) {
            const fieldName = input.previousElementSibling?.textContent || 'This field';
            errorElement.textContent = fieldName + ' is required.';
        }
        return false;
    } else if (input.type === 'email' && input.value) {
        return validateEmail(input);
    } else {
        input.classList.remove('error');
        input.setAttribute('aria-invalid', 'false');
        if (errorElement) {
            errorElement.textContent = '';
        }
        return true;
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
 * Initialize keyboard navigation enhancements
 */
function initKeyboardNavigation() {
    // Trap focus in mobile menu
    const navMenu = document.getElementById('nav-menu');
    if (!navMenu) return;
    
    const focusableElements = navMenu.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled])'
    );
    
    if (focusableElements.length === 0) return;
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    navMenu.addEventListener('keydown', function(e) {
        if (!navMenu.classList.contains('active')) return;
        
        if (e.key === 'Tab') {
            if (e.shiftKey && document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    });
}

/**
 * Initialize Service Worker for PWA capabilities
 */
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js')
                .then(function(registration) {
                    console.log('ServiceWorker registration successful:', registration.scope);
                })
                .catch(function(error) {
                    console.log('ServiceWorker registration failed:', error);
                });
        });
    }
}

/**
 * Privacy-friendly analytics placeholder
 * Replace with your preferred analytics solution (e.g., Plausible, Fathom, or Google Analytics)
 * This is a placeholder that respects user privacy
 */
function initAnalytics() {
    // Example: Privacy-friendly analytics
    // Only initialize if user hasn't opted out
    if (localStorage.getItem('analytics-opt-out') === 'true') {
        return;
    }
    
    // Placeholder for analytics initialization
    // Replace with your actual analytics code
    // Example:
    // if (typeof plausible !== 'undefined') {
    //     plausible('pageview');
    // }
    
    // Track page views (replace with your analytics)
    if (typeof window.analytics !== 'undefined') {
        window.analytics.track('Page View', {
            page: window.location.pathname,
            title: document.title
        });
    }
}

// Initialize analytics after page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnalytics);
} else {
    initAnalytics();
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
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
        }
    });
})();
