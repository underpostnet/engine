import dotenv from 'dotenv';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import UnderpostRootEnv from './env.js';

class UnderpostRun {
  static API = {
    callback(path, options = {}) {},
  };
}

export default UnderpostRun;
