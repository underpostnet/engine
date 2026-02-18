/**
 * Custom Page SSR Component Example
 * @module examples/ssr-components/CustomPage.js
 */

/**
 * SSR Component Example for rendering a custom landing page
 * @function SrrComponent
 * @returns {string} HTML string for the page body
 */
SrrComponent = () => html`
  <!-- Main Container -->
  <div class="custom-page">
    <!-- Hero Section -->
    <section class="hero" role="banner">
      <div class="hero-content">
        <h1 class="hero-title">Welcome to Our Application</h1>
        <p class="hero-subtitle">Building amazing experiences with Underpost</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="get-started">Get Started</button>
          <button class="btn btn-secondary" id="learn-more">Learn More</button>
        </div>
      </div>
      <div class="hero-image" role="img" aria-label="Application preview">
        <!-- Hero image background via CSS -->
      </div>
    </section>

    <!-- Features Section -->
    <section class="features" role="region" aria-labelledby="features-heading">
      <h2 id="features-heading" class="section-title">Features</h2>
      <div class="features-grid">
        <article class="feature-card">
          <div class="feature-icon" aria-hidden="true">🚀</div>
          <h3 class="feature-title">Fast Performance</h3>
          <p class="feature-description">Lightning-fast static pages with optimized delivery</p>
        </article>

        <article class="feature-card">
          <div class="feature-icon" aria-hidden="true">🎨</div>
          <h3 class="feature-title">Customizable</h3>
          <p class="feature-description">Fully customizable with metadata, scripts, and styles</p>
        </article>

        <article class="feature-card">
          <div class="feature-icon" aria-hidden="true">📱</div>
          <h3 class="feature-title">Responsive</h3>
          <p class="feature-description">Works seamlessly across all devices and screen sizes</p>
        </article>

        <article class="feature-card">
          <div class="feature-icon" aria-hidden="true">♿</div>
          <h3 class="feature-title">Accessible</h3>
          <p class="feature-description">Built with accessibility in mind for all users</p>
        </article>
      </div>
    </section>

    <!-- Content Section -->
    <section class="content" role="region" aria-labelledby="content-heading">
      <div class="content-container">
        <h2 id="content-heading" class="section-title">Why Choose Us?</h2>
        <div class="content-grid">
          <div class="content-text">
            <p>
              Our static site generator provides everything you need to create modern, performant web pages with
              comprehensive SEO support, PWA capabilities, and full customization options.
            </p>
            <ul class="content-list">
              <li>✓ Complete metadata control</li>
              <li>✓ Script and stylesheet injection</li>
              <li>✓ SSR component system</li>
              <li>✓ JSON-LD structured data</li>
              <li>✓ Production-ready builds</li>
            </ul>
          </div>
          <div class="content-media">
            <div class="placeholder-image" role="img" aria-label="Feature showcase">
              <!-- Image placeholder -->
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Call to Action -->
    <section class="cta" role="region" aria-labelledby="cta-heading">
      <div class="cta-container">
        <h2 id="cta-heading" class="cta-title">Ready to Get Started?</h2>
        <p class="cta-text">Join thousands of developers building with Underpost</p>
        <form class="cta-form" id="signup-form" aria-label="Sign up form">
          <input type="email" class="cta-input" placeholder="Enter your email" aria-label="Email address" required />
          <button type="submit" class="btn btn-primary">Sign Up</button>
        </form>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer" role="contentinfo">
      <div class="footer-content">
        <div class="footer-section">
          <h3 class="footer-heading">About</h3>
          <ul class="footer-links">
            <li><a href="/about">About Us</a></li>
            <li><a href="/team">Team</a></li>
            <li><a href="/careers">Careers</a></li>
          </ul>
        </div>
        <div class="footer-section">
          <h3 class="footer-heading">Resources</h3>
          <ul class="footer-links">
            <li><a href="/docs">Documentation</a></li>
            <li><a href="/guides">Guides</a></li>
            <li><a href="/api">API Reference</a></li>
          </ul>
        </div>
        <div class="footer-section">
          <h3 class="footer-heading">Community</h3>
          <ul class="footer-links">
            <li><a href="/github">GitHub</a></li>
            <li><a href="/discord">Discord</a></li>
            <li><a href="/twitter">Twitter</a></li>
          </ul>
        </div>
        <div class="footer-section">
          <h3 class="footer-heading">Legal</h3>
          <ul class="footer-links">
            <li><a href="/privacy">Privacy Policy</a></li>
            <li><a href="/terms">Terms of Service</a></li>
            <li><a href="/cookies">Cookie Policy</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p class="footer-copyright">&copy; ${new Date().getFullYear()} Underpost. All rights reserved.</p>
      </div>
    </footer>
  </div>

  <!-- Inline Styles (Critical CSS) -->
  <style>
    /* CSS Reset and Base Styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family:
        -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans',
        'Droid Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f8f9fa;
    }

    .custom-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Hero Section */
    .hero {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 80px 20px;
      text-align: center;
      min-height: 500px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }

    .hero-content {
      max-width: 800px;
      z-index: 1;
    }

    .hero-title {
      font-size: 3rem;
      font-weight: 700;
      margin-bottom: 1rem;
      animation: fadeInUp 0.8s ease-out;
    }

    .hero-subtitle {
      font-size: 1.5rem;
      margin-bottom: 2rem;
      opacity: 0.9;
      animation: fadeInUp 0.8s ease-out 0.2s backwards;
    }

    .hero-actions {
      display: flex;
      gap: 1rem;
      justify-content: center;
      animation: fadeInUp 0.8s ease-out 0.4s backwards;
    }

    /* Buttons */
    .btn {
      padding: 12px 32px;
      font-size: 1rem;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
      text-decoration: none;
      display: inline-block;
    }

    .btn-primary {
      background: white;
      color: #667eea;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
    }

    .btn-secondary {
      background: transparent;
      color: white;
      border: 2px solid white;
    }

    .btn-secondary:hover {
      background: white;
      color: #667eea;
    }

    /* Section Styles */
    section {
      padding: 60px 20px;
    }

    .section-title {
      font-size: 2.5rem;
      text-align: center;
      margin-bottom: 3rem;
      color: #2d3748;
    }

    /* Features Section */
    .features {
      background: white;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .feature-card {
      background: #f8f9fa;
      padding: 2rem;
      border-radius: 12px;
      text-align: center;
      transition:
        transform 0.3s ease,
        box-shadow 0.3s ease;
    }

    .feature-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    }

    .feature-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .feature-title {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: #2d3748;
    }

    .feature-description {
      color: #4a5568;
    }

    /* Content Section */
    .content {
      background: #f8f9fa;
    }

    .content-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .content-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 3rem;
      align-items: center;
    }

    .content-list {
      list-style: none;
      margin-top: 1.5rem;
    }

    .content-list li {
      padding: 0.5rem 0;
      font-size: 1.1rem;
      color: #4a5568;
    }

    .placeholder-image {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      height: 300px;
      border-radius: 12px;
    }

    /* CTA Section */
    .cta {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
    }

    .cta-container {
      max-width: 600px;
      margin: 0 auto;
    }

    .cta-title {
      font-size: 2.5rem;
      margin-bottom: 1rem;
    }

    .cta-text {
      font-size: 1.2rem;
      margin-bottom: 2rem;
      opacity: 0.9;
    }

    .cta-form {
      display: flex;
      gap: 1rem;
      max-width: 500px;
      margin: 0 auto;
    }

    .cta-input {
      flex: 1;
      padding: 12px 20px;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
    }

    /* Footer */
    .footer {
      background: #2d3748;
      color: white;
      padding: 60px 20px 20px;
    }

    .footer-content {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 2rem;
      margin-bottom: 2rem;
    }

    .footer-heading {
      margin-bottom: 1rem;
      font-size: 1.2rem;
    }

    .footer-links {
      list-style: none;
    }

    .footer-links a {
      color: #a0aec0;
      text-decoration: none;
      display: block;
      padding: 0.3rem 0;
      transition: color 0.3s ease;
    }

    .footer-links a:hover {
      color: white;
    }

    .footer-bottom {
      text-align: center;
      padding-top: 2rem;
      border-top: 1px solid #4a5568;
    }

    .footer-copyright {
      color: #a0aec0;
    }

    /* Animations */
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      .hero-title {
        font-size: 2rem;
      }

      .hero-subtitle {
        font-size: 1.2rem;
      }

      .hero-actions {
        flex-direction: column;
      }

      .section-title {
        font-size: 2rem;
      }

      .cta-form {
        flex-direction: column;
      }

      .cta-title {
        font-size: 2rem;
      }
    }

    /* Accessibility - Focus Styles */
    *:focus {
      outline: 3px solid #667eea;
      outline-offset: 2px;
    }

    /* Print Styles */
    @media print {
      .hero,
      .cta {
        background: white !important;
        color: black !important;
      }

      .btn {
        display: none;
      }
    }
  </style>

  <!-- Inline JavaScript (Progressive Enhancement) -->
  <script>
    // Wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', function () {
      console.log('Custom page loaded successfully');

      // Get Started button handler
      const getStartedBtn = document.getElementById('get-started');
      if (getStartedBtn) {
        getStartedBtn.addEventListener('click', function () {
          window.location.href = '/signup';
        });
      }

      // Learn More button handler
      const learnMoreBtn = document.getElementById('learn-more');
      if (learnMoreBtn) {
        learnMoreBtn.addEventListener('click', function () {
          document.querySelector('.features').scrollIntoView({
            behavior: 'smooth',
          });
        });
      }

      // Signup form handler
      const signupForm = document.getElementById('signup-form');
      if (signupForm) {
        signupForm.addEventListener('submit', function (e) {
          e.preventDefault();
          const email = this.querySelector('input[type="email"]').value;

          // Basic email validation
          if (email && /^[^s@]+@[^s@]+.[^s@]+$/.test(email)) {
            alert('Thank you for signing up! We will contact you soon.');
            this.reset();
          } else {
            alert('Please enter a valid email address.');
          }
        });
      }

      // Intersection Observer for animations
      if ('IntersectionObserver' in window) {
        const observerOptions = {
          threshold: 0.1,
          rootMargin: '0px 0px -50px 0px',
        };

        const observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.style.opacity = '1';
              entry.target.style.transform = 'translateY(0)';
            }
          });
        }, observerOptions);

        // Observe feature cards
        document.querySelectorAll('.feature-card').forEach(function (card, index) {
          card.style.opacity = '0';
          card.style.transform = 'translateY(30px)';
          card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          card.style.transitionDelay = index * 0.1 + 's';
          observer.observe(card);
        });
      }

      // Accessibility: Skip to content link
      const skipLink = document.createElement('a');
      skipLink.href = '#main-content';
      skipLink.textContent = 'Skip to main content';
      skipLink.className = 'skip-link';
      skipLink.style.cssText =
        'position: absolute; top: -40px; left: 0; background: #667eea; color: white; padding: 8px 16px; text-decoration: none; z-index: 100;';
      skipLink.addEventListener('focus', function () {
        this.style.top = '0';
      });
      skipLink.addEventListener('blur', function () {
        this.style.top = '-40px';
      });
      document.body.insertBefore(skipLink, document.body.firstChild);
    });
  </script>
`;
