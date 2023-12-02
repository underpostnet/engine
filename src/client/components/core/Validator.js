const validationRules = {
  emptyField: (value) => !value.trim(),
  invalidEmail: (value) => !/^\S+@\S+\.\S+$/.test(value),
  passwordMismatch: (value, password) => value !== password,
  invalidPhoneNumber: (value) => !/^\d{10}$/.test(value),
  invalidDate: (value) => !/^\d{4}-\d{2}-\d{2}$/.test(value),
  customValidator: (value) => true,
};

export { validationRules };
