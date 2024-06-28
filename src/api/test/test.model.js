import { Schema, model, Types } from 'mongoose';

// https://mongoosejs.com/docs/2.7.x/docs/schematypes.html

const TestSchema = new Schema({
  testId: { type: String, required: true, immutable: true },
  value: { type: String, required: true, immutable: true },
});

const TestModel = model('Test', TestSchema);

const ProviderSchema = TestSchema;

export { TestSchema, TestModel, ProviderSchema };
