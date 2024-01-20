const CommonValidationRules = {
  emptyField: (value) => !!value.trim(),
  validEmail: (value) => /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(value),
  passwordMismatch: (value, password) => !(value !== password),
  validPhoneNumber: (value) => /^\d{10}$/.test(value),
  validDate: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
  customValidator: (value) => false,
  integerOrFloat: (value) => /^\d{1,100}(\.\d{1,100})?$/.test(value),
};

export { CommonValidationRules };
