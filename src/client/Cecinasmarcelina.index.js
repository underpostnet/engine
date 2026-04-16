'use strict';

import { Css, darkTheme } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInCecinasmarcelina } from './components/cecinasmarcelina/LogInCecinasmarcelina.js';
import { LogOutCecinasmarcelina } from './components/cecinasmarcelina/LogOutCecinasmarcelina.js';
import { SignUpCecinasmarcelina } from './components/cecinasmarcelina/SignUpCecinasmarcelina.js';
import { MenuCecinasmarcelina } from './components/cecinasmarcelina/MenuCecinasmarcelina.js';
import { RouterCecinasmarcelina } from './components/cecinasmarcelina/RoutesCecinasmarcelina.js';
import { TranslateCecinasmarcelina } from './components/cecinasmarcelina/TranslateCecinasmarcelina.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { SocketIo } from './components/core/SocketIo.js';
import { SocketIoCecinasmarcelina } from './components/cecinasmarcelina/SocketIoCecinasmarcelina.js';
import { AppStoreCecinasmarcelina } from './components/cecinasmarcelina/AppStoreCecinasmarcelina.js';
import {
  CssCecinasmarcelinaDark,
  CssCecinasmarcelinaLight,
} from './components/cecinasmarcelina/CssCecinasmarcelina.js';
import { EventsUI } from './components/core/EventsUI.js';
import { Modal } from './components/core/Modal.js';
import { s } from './components/core/VanillaJs.js';
import { getProxyPath } from './components/core/Router.js';

const htmlMainBody = async () => {
  const style = document.createElement('style');
  style.textContent = css`
    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(-30px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    .landing-page {
      opacity: 0;
      animation: fadeIn 0.6s ease-out forwards;
    }
    .hero-title {
      animation: fadeInUp 0.8s ease-out 0.2s forwards;
      opacity: 0;
    }
    .hero-subtitle {
      animation: fadeInUp 0.8s ease-out 0.4s forwards;
      opacity: 0;
    }
    .hero-description {
      animation: fadeInUp 0.8s ease-out 0.6s forwards;
      opacity: 0;
    }
    .hero-cta {
      animation: fadeInUp 0.8s ease-out 0.8s forwards;
      opacity: 0;
    }
    .product-card,
    .pillar-card {
      opacity: 0;
      animation: fadeInUp 0.6s ease-out forwards;
      animation-delay: calc(var(--index) * 0.12s);
    }
    .product-card:hover,
    .pillar-card:hover {
      transform: translateY(-5px);
    }
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    EventsUI.onClick('.btn-landing-contact', () => {
      const contactEl = document.querySelector('.contact-section');
      if (contactEl) contactEl.scrollIntoView({ behavior: 'smooth' });
    });
    EventsUI.onClick('.btn-landing-sign-up', () => {
      s(`.main-btn-sign-up`).click();
    });
  });

  return html`
    <div class="landing-page">
      <!-- Hero Section -->
      <header class="hero-section">
        <div class="hero-overlay"></div>
        <div class="hero-inner">
          <img class="hero-logo" src="${getProxyPath()}assets/logo/ico.webp" alt="Cecinas Do&ntilde;a Marcelina" />
          <h1 class="hero-title">Cecinas Artesanales<br />del Sur de Chile</h1>
          <p class="hero-subtitle">Tradici&oacute;n Familiar desde 1999</p>
          <p class="hero-description">
            Pru&eacute;balas y prep&aacute;rate para lo que ser&aacute; sin dudas un momento de tradici&oacute;n y
            sabor&hellip;
          </p>
          <div class="hero-cta">
            <button class="btn btn-primary btn-landing-sign-up">Tienda en L&iacute;nea</button>
            <button class="btn btn-outline btn-landing-contact">Cont&aacute;ctanos</button>
          </div>
        </div>
      </header>

      <!-- Products Section -->
      <section class="products-section">
        <h2>Nuestras Especialidades</h2>
        <p class="section-lead">
          Pru&eacute;balas y prep&aacute;rate para lo que ser&aacute; sin dudas un momento de tradici&oacute;n y
          sabor&hellip;
        </p>
        <div class="products-grid">
          <div class="product-card" style="--index: 1">
            <div class="product-icon">🌭</div>
            <h3>Longaniza</h3>
            <p>Elaborada con las mejores carnes y condimentos naturales del sur</p>
          </div>
          <div class="product-card" style="--index: 2">
            <div class="product-icon">🫓</div>
            <h3>Prieta</h3>
            <p>Receta tradicional transmitida por generaciones</p>
          </div>
          <div class="product-card" style="--index: 3">
            <div class="product-icon">🧀</div>
            <h3>Queso de Cabeza</h3>
            <p>Preparado artesanalmente con ingredientes seleccionados</p>
          </div>
          <div class="product-card" style="--index: 4">
            <div class="product-icon">🥩</div>
            <h3>Arrollado</h3>
            <p>Un cl&aacute;sico del sur de Chile con sabor aut&eacute;ntico</p>
          </div>
          <div class="product-card" style="--index: 5">
            <div class="product-icon">🍖</div>
            <h3>Costillar Ahumado</h3>
            <p>Ahumado lento con maderas nativas de la regi&oacute;n</p>
          </div>
          <div class="product-card" style="--index: 6">
            <div class="product-icon">🥓</div>
            <h3>Bondiola</h3>
            <p>Curada y sazonada siguiendo la tradici&oacute;n artesanal</p>
          </div>
        </div>
      </section>

      <!-- About Section -->
      <section class="about-section">
        <div class="about-content">
          <h2>Nosotros</h2>
          <p class="about-tagline">Familiares, Artesanales y con el sabor del sur.</p>
          <p>
            Desde 1999, en Cecinas Do&ntilde;a Marcelina lo que nos alegra la vida es tu satisfacci&oacute;n y lo hemos
            establecido como nuestro principal objetivo. Por eso nos ocupamos de entregarte una equilibrada
            relaci&oacute;n entre nuestros productos artesanales de la m&aacute;s alta calidad y un excelente servicio.
          </p>
          <p>
            Para ello contamos con nuestro gran equipo, los mejores proveedores y m&aacute;s de 20 a&ntilde;os de
            experiencia nos permiten poner los mejores productos del sur de Chile a tu alcance.
          </p>
        </div>
      </section>

      <!-- Pillars Section -->
      <section class="pillars-section">
        <h2>Nuestros Pilares</h2>
        <p class="section-lead">
          Combinamos la tradici&oacute;n y la modernidad para entregarte un producto de excelencia.
        </p>
        <div class="pillars-grid">
          <div class="pillar-card" style="--index: 1">
            <div class="pillar-icon">✅</div>
            <h3>Calidad Certificada</h3>
            <p>
              Implementaci&oacute;n H.A.C.C.P. de inocuidad alimentaria e IFS para asegurar la calidad de cada producto
            </p>
          </div>
          <div class="pillar-card" style="--index: 2">
            <div class="pillar-icon">👨‍👩‍👧‍👦</div>
            <h3>Empresa Familiar</h3>
            <p>Ayudamos en el crecimiento econ&oacute;mico familiar y generamos oportunidades para nuestra comunidad</p>
          </div>
          <div class="pillar-card" style="--index: 3">
            <div class="pillar-icon">🏔️</div>
            <h3>Tradici&oacute;n Artesanal</h3>
            <p>
              Seguimos las recetas de nuestros antepasados con m&aacute;s de 20 a&ntilde;os de experiencia en el negocio
            </p>
          </div>
          <div class="pillar-card" style="--index: 4">
            <div class="pillar-icon">🌿</div>
            <h3>Materias Primas</h3>
            <p>
              Son uno de los pilares m&aacute;s importantes sobre el cual se asienta el &eacute;xito de nuestros
              productos
            </p>
          </div>
        </div>
      </section>

      <!-- Location Section -->
      <section class="location-section">
        <div class="location-content">
          <h2>En el Coraz&oacute;n del Sur</h2>
          <p class="location-tagline">Entre r&iacute;os, lagos y monta&ntilde;as</p>
          <p class="location-description">
            Nuestra casa est&aacute; llena de sabores, tradiciones y experiencia. Tambi&eacute;n estamos en muchas
            tiendas del sur de Chile.
          </p>
        </div>
      </section>

      <!-- Contact Section -->
      <section class="contact-section">
        <h2>Cont&aacute;ctanos</h2>
        <div class="contact-info">
          <div class="contact-item">
            <i class="fas fa-phone"></i>
            <span>+56 9 7418 8496</span>
          </div>
          <div class="contact-item">
            <i class="fas fa-envelope"></i>
            <span>cristobalperez27@gmail.com</span>
          </div>
          <div class="contact-item">
            <i class="fas fa-map-marker-alt"></i>
            <span>Panguipulli, Regi&oacute;n de Los R&iacute;os, Chile</span>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer class="landing-footer">
        <p>&copy; ${new Date().getFullYear()} Cecinas Do&ntilde;a Marcelina. Todos los derechos reservados.</p>
      </footer>
    </div>
  `;
};

window.onload = () =>
  Worker.instance({
    router: RouterCecinasmarcelina,
    render: async () => {
      await Css.loadThemes([CssCecinasmarcelinaLight, CssCecinasmarcelinaDark]);
      await TranslateCore.Init();
      await TranslateCecinasmarcelina.Init();
      await Responsive.Init();
      await MenuCecinasmarcelina.Render({ htmlMainBody });
      await SocketIo.Init({
        channels: AppStoreCecinasmarcelina.Data,
        path: `/`,
      });
      await SocketIoCecinasmarcelina.Init();
      await LogInCecinasmarcelina();
      await LogOutCecinasmarcelina();
      await SignUpCecinasmarcelina();
      await Keyboard.Init();
      await Modal.RenderSeoSanitizer();
    },
  });
