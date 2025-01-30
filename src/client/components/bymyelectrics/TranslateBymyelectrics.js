import { Translate } from '../core/Translate.js';

const TranslateBymyelectrics = {
  Init: async function () {
    Translate.Data['description-0'] = {
      es: html`Ingeniería By My Electrics Ltda. es una empresa consultora de ingeniería eléctrica constituida en 2024,
        ha participado como proyectista para el proyecto de depósito y relaves en Rajo,
        <strong
          >minera centinela Antofagasta minerals; proyecto metro de Santiago línea 7 ALSTOM; proyecto DLN extendido
          Codelco andina; ha realizado diversa documentación técnica para minera escondida BHP</strong
        >
        como memorias de calculo, manuales de instalación, operación y mantención de diversos equipos. `,
      en: html`Engineering by my electrics ltda. is an electrical engineering consulting firm established in 2024, has
        participated as a designer for the project of deposit and tailings in pit,
        <strong
          >Minera Centinela Antofagasta minerals; santiago metro project line 7 ALSTOM; DLN extended project Codelco
          andina; has made various technical documentation for minera escondida BHP</strong
        >
        as calculation memories, installation manuals, operation and maintenance of various equipment. `,
    };
    Translate.Data['description-1'] = {
      en: html`Its objective is to be recognized as the standard of excellence in the development of electrical
      engineering, leading innovation and sustainability in the sector at a global level. to achieve this, it provides
      electrical engineering solutions of exceptional quality, driven by innovation and sustainability, to meet the
      needs of customers and contribute to technological advancement and sustainable development of society.`,
      es: html`Su objetivo es ser reconocida como el estándar de excelencia en el desarrollo de ingeniería eléctrica,
      liderando la innovación y la sostenibilidad en el sector a nivel global. Para lograrlo proporcionar soluciones de
      ingeniería eléctrica de calidad excepcional, impulsadas por la innovación y la sostenibilidad, para satisfacer las
      necesidades de los clientes y contribuir al avance tecnológico y al desarrollo sostenible de la sociedad.`,
    };
    Translate.Data['our-clients'] = {
      es: 'Nuestros clientes',
      en: 'Our clients',
    };
    Translate.Data['electrical-designers'] = {
      es: 'Proyectistas Electricos',
      en: 'Electrical Designers',
    };
  },
};

export { TranslateBymyelectrics };
