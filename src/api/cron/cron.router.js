import express from 'express';
import { registerCrudRoutes } from '../../server/network/middlewares.js';
import { CronController } from './cron.controller.js';

/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'cron',
  services: ['database', 'auth'],
  /**
   * @param {import('../types.js').ApiRouterContext} context
   * @returns {import('express').Router}
   */
  createRouter(context) {
    const { auth } = context.services;
    const adminOnly = auth.requireAdmin;
    return registerCrudRoutes(express.Router(), CronController, context, {
      readGuards: adminOnly,
      writeGuards: adminOnly,
      deleteAllGuards: adminOnly,
    });
  },
};
