// https://github.com/xenova/transformers.js/blob/f43d3dd348fd7b293008802590bb3a1afa218dc7/src/models.js#L10

import { AutoModelForSeq2SeqLM, AutoTokenizer } from '@xenova/transformers';
import { loggerFactory } from './logger.js';
import dotenv from 'dotenv';

dotenv.config();

const logger = loggerFactory(import.meta);

const tokenizer = await AutoTokenizer.from_pretrained('Xenova/t5-small');

const model = await AutoModelForSeq2SeqLM.from_pretrained('Xenova/t5-small');

const prompt = 'translate English to German: I love transformers!';

logger.info('input', { prompt });

const tokenizerData = await tokenizer(prompt);

const { input_ids } = tokenizerData;

const outputs = await model.generate(input_ids);

for (const output of outputs) {
  const decoded = tokenizer.decode(output, { skip_special_tokens: true });
  logger.info('decoded', { decoded });
}
