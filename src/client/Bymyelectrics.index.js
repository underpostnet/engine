'use strict';

import { borderChar, Css, dynamicCol } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { Translate, TranslateCore } from './components/core/Translate.js';
import { LogInBymyelectrics } from './components/bymyelectrics/LogInBymyelectrics.js';
import { LogOutBymyelectrics } from './components/bymyelectrics/LogOutBymyelectrics.js';
import { SignUpBymyelectrics } from './components/bymyelectrics/SignUpBymyelectrics.js';
import { MenuBymyelectrics } from './components/bymyelectrics/MenuBymyelectrics.js';
import { RouterBymyelectrics } from './components/bymyelectrics/RoutesBymyelectrics.js';
import { TranslateBymyelectrics } from './components/bymyelectrics/TranslateBymyelectrics.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { BymyelectricsParams } from './components/bymyelectrics/CommonBymyelectrics.js';
import { SocketIo } from './components/core/SocketIo.js';
import { SocketIoBymyelectrics } from './components/bymyelectrics/SocketIoBymyelectrics.js';
import { ElementsBymyelectrics } from './components/bymyelectrics/ElementsBymyelectrics.js';
import { Scroll } from './components/core/Scroll.js';
import { getProxyPath, s } from './components/core/VanillaJs.js';
import { CssBymyelectricsDark, CssBymyelectricsLight } from './components/bymyelectrics/CssBymyelectrics.js';

const htmlMainBody = async () => {
  const id0DynamicCol = `dynamicCol-0`;
  const id1DynamicCol = `dynamicCol-1`;

  setTimeout(() => {
    Responsive.Event[`landing`] = () => {
      s(`.home-first-screen`).style.height = ` ${window.innerHeight - 100}px`;
    };
  });
  return html`
    <style>
      .landing-logo-0 {
        width: 100%;
        margin: auto;
        max-width: 400px;
      }
      .clients-img {
        width: 100%;
        max-width: 700px;
        margin: auto;
      }
      .sub-title {
        font-size: 25px;
        text-align: center;
        font-weight: bold;
      }
      footer {
        background: #2f5596;
        color: white;
        padding: 0 50px 0 50px;
        font-size: 16px;
      }
      a {
        color: white;
      }

      .proyectistas-p {
        color: white;
        font-size: 40px;
      }
      .home-first-screen {
        transition: 0.3s;
        background-image: url('${getProxyPath()}assets/proyectistas.png');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
      }
      .${id1DynamicCol} {
        text-align: center;
      }
      .sub-title-sec-1 {
        font-size: 40px;
        color: #2f5596;
        font-weight: bold;
        text-align: center;
      }
      .sec-1-sub-container {
        margin: auto;
        max-width: 300px;
      }
      .sec-1-sub-container-text {
        font-size: 24px;
      }
      .sec-1-icon {
        font-size: 100px;
      }
      .sec-2-sub-container-text {
        max-width: 68%;
        padding: 10px;
        text-align: justify;
        margin: auto;
      }
    </style>
    ${borderChar(2, 'black', ['.home-first-screen'])}
    <div class="in home-first-screen" style="height: ${window.innerHeight - 100}px">
      <div class="abs center proyectistas-p">
        ${Translate.Render('electrical-designers', undefined, { disableTextFormat: true })}
      </div>
    </div>
    ${dynamicCol({ containerSelector: id1DynamicCol, id: id1DynamicCol, type: 'a-50-b-50' })}
    <div class="in section-mp landing-container">
      <div class="fl ${id1DynamicCol}">
        <div class="in fll ${id1DynamicCol}-col-a">
          <div class="in sec-1-sub-container">
            <br /><br />
            <span class="sub-title-sec-1"
              ><i class="fas fa-medal sec-1-icon"></i><br /><br />
              Misión</span
            >
            <br />
            <br />
            <div class="in sec-1-sub-container-text">
              Ser el estándar de excelencia en ingeniería eléctrica, liderando la innovación tecnológica y la
              sostenibilidad, con un firme compromiso con la responsabilidad, la calidad y la satisfacción de nuestros
              clientes
            </div>
          </div>
        </div>
        <div class="in fll ${id1DynamicCol}-col-b">
          <div class="in sec-1-sub-container">
            <br /><br />
            <span class="sub-title-sec-1">
              <i class="far fa-lightbulb sec-1-icon"></i> <br /><br />
              Visión</span
            >
            <br />
            <br />
            <div class="in sec-1-sub-container-text">
              Desarrollar soluciones de ingeniería eléctrica de clase mundial, combinando calidad, innovación y
              sostenibilidad, para superar las expectativas de nuestros clientes, impulsar el avance tecnológico y
              fomentar un desarrollo sostenible para la sociedad
            </div>
          </div>
        </div>
      </div>
    </div>
    ${true ? '' : dynamicCol({ containerSelector: id0DynamicCol, id: id0DynamicCol, type: 'a-50-b-50' })}
    <div class="in section-mp landing-container">
      <br />
      <div class="in sub-title-sec-1">Nuestros servicios</div>
      <br />
      <div class="in sub-title">Proyectos de diseño e ingeniería de detalle</div>
      <br />
      <div class="in sec-2-sub-container-text">
        Ingeniería By My Electrics ofrece soluciones técnicas adaptadas a las necesidades de cada cliente, destacándose
        en el desarrollo de filosofías de control para alimentadores, partidores con relés inteligentes, VDF, UPS,
        sistemas de transferencia y diseño de tableros protocolizados y no protocolizados, diseño de planos eléctricos,
        mecánicos, control, y modelado en AutoCAD. Nuestro enfoque incluye detectar errores, proponer soluciones y
        garantizar la satisfacción del cliente mediante diseños personalizados en diferentes perspectivas.
      </div>

      <br />
      <div class="in sub-title">Desarrollo de Documentación Técnica</div>
      <br />
      <div class="in sec-2-sub-container-text">
        Ingeniería By My Electrics realiza emisión de documentación técnica en formato propio o adaptándonos a los
        requerimientos específicos de cada cliente para los manuales de instalación, operación y mantención de equipos,
        realizamos memorias de cálculo asegurando el cumplimiento de normativas técnicas y estándares de la industria
        siguiendo el Reglamento de instalaciones de consumo de electricidad (RIC) y pliegos técnicos normativos. Además,
        realizamos traducción de documentación a pedido garantizando la precisión técnica adaptándose a la terminología
        local e internacional
      </div>
      <!--   <div class="fl ${id0DynamicCol}">
        <div class="in fll ${id0DynamicCol}-col-a">
              <img class="in landing-logo-0" src="${getProxyPath()}assets/social.png" />   
        </div>
        <div class="in fll ${id0DynamicCol}-col-b">
          <br /><br />
          <div class="in section-mp">${Translate.Render('description-0')}</div>
          <div class="in section-mp">${Translate.Render('description-1')}</div>
        </div>
      </div>   -->
      <br />
      <!--
      <div class="in sub-title">${Translate.Render('our-clients')}</div>
      <br />
      <img class="in clients-img" src="${getProxyPath()}assets/clients.png" />
      <br />
      -->
      <br />
      <br />
    </div>
    <footer class="in">
      <br />
      <br />
      <strong> Engineering By My Electrics ltda.</strong>
      <br /><br />
      Las Carmelitas 91, Las Condes.
      <br /><br />

      <b>Maximiliano Bernal</b>
      <br />
      <i class="fas fa-envelope"></i> <a href="mailto:mbernal@bymyelectrics.com">mbernal@bymyelectrics.com</a>
      <br />
      <i class="fas fa-phone-alt"></i> <a href="https://wa.me/56945637339">+569 4563 7339</a><br /><br />
      <b>Bruno Verdugo</b>
      <br />
      <i class="fas fa-envelope"></i> <a href="mailto:bverdugo@bymyelectrics.com">bverdugo@bymyelectrics.com</a>
      <br />
      <i class="fas fa-phone-alt"></i> <a href="https://wa.me/56984967570">+569 8496 7570</a>
      <br />
      <br />
      <br />
    </footer>
  `;
};

window.onload = () =>
  Worker.instance({
    router: RouterBymyelectrics,
    render: async () => {
      localStorage.setItem('_theme', 'bymyelectrics-light');
      await Css.loadThemes([CssBymyelectricsLight, CssBymyelectricsDark]);
      await TranslateCore.Init();
      await TranslateBymyelectrics.Init();
      await Responsive.Init();
      await MenuBymyelectrics.Render({ htmlMainBody });
      await SocketIo.Init({ channels: ElementsBymyelectrics.Data });
      await SocketIoBymyelectrics.Init();
      await LogInBymyelectrics();
      await LogOutBymyelectrics();
      await SignUpBymyelectrics();
      await Scroll.pullTopRefresh();
      await Keyboard.Init({ callBackTime: BymyelectricsParams.EVENT_CALLBACK_TIME });
    },
  });
