const medicalSpecialties = [
  {
    id: 'family-medicine',
    displayName: {
      es: 'Medicina Familiar',
      en: 'Family Medicine',
    },
  },
  {
    id: 'internal-medicine',
    displayName: {
      es: 'Medicina Interna',
      en: 'Internal Medicine',
    },
  },
  {
    id: 'pediatrics',
    displayName: {
      es: 'Pediatría',
      en: 'Pediatrics',
    },
  },
  {
    id: 'cardiology',
    displayName: {
      es: 'Cardiología',
      en: 'Cardiology',
    },
  },
  {
    id: 'dermatology',
    displayName: {
      es: 'Dermatología',
      en: 'Dermatology',
    },
  },
  {
    id: 'endocrinology',
    displayName: {
      es: 'Endocrinología',
      en: 'Endocrinology',
    },
  },
  {
    id: 'gastroenterology',
    displayName: {
      es: 'Gastroenterología',
      en: 'Gastroenterology',
    },
  },
  {
    id: 'hematology',
    displayName: {
      es: 'Hematología',
      en: 'Hematology',
    },
  },
  {
    id: 'nephrology',
    displayName: {
      es: 'Nefrología',
      en: 'Nephrology',
    },
  },
  {
    id: 'neurology',
    displayName: {
      es: 'Neurología',
      en: 'Neurology',
    },
  },
  {
    id: 'oncology',
    displayName: {
      es: 'Oncología',
      en: 'Oncology',
    },
  },
  {
    id: 'pulmonology',
    displayName: {
      es: 'Pulmonología',
      en: 'Pulmonology',
    },
  },
  {
    id: 'rheumatology',
    displayName: {
      es: 'Reumatología',
      en: 'Rheumatology',
    },
  },
  {
    id: 'general-surgery',
    displayName: {
      es: 'Cirugía General',
      en: 'General Surgery',
    },
  },
  {
    id: 'orthopedic-surgery',
    displayName: {
      es: 'Cirugía Ortopédica',
      en: 'Orthopedic Surgery',
    },
  },
  {
    id: 'otolaryngology-ent',
    displayName: {
      es: 'Otorrinolaringología (ORL)',
      en: 'Otolaryngology (ENT)',
    },
  },
  {
    id: 'ophthalmology',
    displayName: {
      es: 'Oftalmología',
      en: 'Ophthalmology',
    },
  },
  {
    id: 'urology',
    displayName: {
      es: 'Urología',
      en: 'Urology',
    },
  },
  {
    id: 'neurosurgery',
    displayName: {
      es: 'Neurocirugía',
      en: 'Neurosurgery',
    },
  },
  {
    id: 'anesthesiology',
    displayName: {
      es: 'Anestesiología',
      en: 'Anesthesiology',
    },
  },
  {
    id: 'pathology',
    displayName: {
      es: 'Patología',
      en: 'Pathology',
    },
  },
  {
    id: 'radiology',
    displayName: {
      es: 'Radiología',
      en: 'Radiology',
    },
  },
  {
    id: 'psychiatry',
    displayName: {
      es: 'Psiquiatría',
      en: 'Psychiatry',
    },
  },
  {
    id: 'emergency-medicine',
    displayName: {
      es: 'Medicina de Emergencia',
      en: 'Emergency Medicine',
    },
  },
  {
    id: 'nutrition',
    displayName: {
      en: 'Nutrition and Dietetics',
      es: 'Nutrición y Dietética',
    },
  },
];
const ModelElement = {
  user: () => {
    return {
      user: {
        _id: '',
      },
    };
  },
};

const MenuHomeHealthcare = {
  'nutrition-tips': {
    displayName: {
      es: 'Consejos de Nutrición',
      en: 'Nutritional Tips',
    },
    icon: 'assets/icons/12.png',
    route: '/nutrition-tips',
  },

  'register-food-intake': {
    displayName: {
      es: 'Registro de Ingesta de Alimentos',
      en: 'Register Food Intake',
    },
    icon: 'assets/icons/13.png',
    route: '/register-food-intake',
  },

  'take-care-cardiovascular': {
    displayName: {
      es: 'Cuida tu salud cardiovascular',
      en: 'Take Care of Your Cardiovascular health',
    },
    icon: 'assets/icons/14.png',
    route: '/take-care-cardiovascular',
  },

  'vitals-signs': {
    displayName: {
      es: 'Signos Vitales',
      en: 'Vital Signs',
    },
    icon: 'assets/icons/16.png',
    route: '/vitals-signs',
  },

  // Nutritional tips
  // Record food intake
  // Take care of your cardiovascular health
  // Vital signs

  // Recipe book
  // Record mood
  // Chat with your nutritionist
  // Forum / Community

  // Tips nutricionales
  // Registrar ingesta de alimentos
  // Cuida tu salud cardiovascular
  // Signos vitales

  // Recetario
  // Registrar estado de ánimo
  // Chatea con tu nutricionista
  // Foro / Comunidad
};

const NutritionalTips = [
  { icon: 'assets/icons/1.png', displayName: { es: 'Revisar los últimos tips', en: 'Review latest tips' } },
  {
    icon: 'assets/icons/6.png',
    displayName: { es: 'Tips para mejorar tu estado nutricional', en: 'Tips to improve your nutritional status' },
  },

  {
    icon: 'assets/icons/5.png',
    displayName: { es: 'Tips de actividad física y autocuidado', en: 'Physical activity and self-care tips' },
  },
  {
    icon: 'assets/icons/2.png',
    displayName: { es: 'Tips para mejorar tu sistema digestivo', en: 'Tips to improve your digestive system' },
  },
  {
    icon: 'assets/icons/3.png',
    displayName: {
      es: 'Tips para mejorar tu concentración, cognición y estado del ánimo',
      en: 'Tips for improving your concentration, cognition and mood',
    },
  },
  {
    icon: 'assets/icons/16.png',
    displayName: { es: 'Tips para mejorar tu salud cardiovascular', en: 'Tips to improve your cardiovascular health' },
  },
];
const BaseElement = () => {
  return {
    user: {
      main: {
        model: {
          ...ModelElement.user(),
        },
      },
    },
    chat: {},
    mailer: {},
    stream: {},
  };
};

const HealthcareParams = {
  EVENT_CALLBACK_TIME: 45,
};

export { BaseElement, ModelElement, HealthcareParams, medicalSpecialties, MenuHomeHealthcare, NutritionalTips };
