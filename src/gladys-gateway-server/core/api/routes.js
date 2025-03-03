const bodyParser = require('body-parser');
const Sentry = require('@sentry/node');
const beforeSendSentry = require('../service/beforeSendSentry');
const asyncMiddleware = require('../middleware/asyncMiddleware.js');
const { NotFoundError } = require('../common/error.js');

module.exports.load = function Routes(app, io, controllers, middlewares) {
  // the gateway is behing a proxy
  app.enable('trust proxy');

  // Sentry
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    beforeSend: beforeSendSentry,
    ignoreErrors: ['Unauthorized', 'Forbidden', 'NO_INSTANCE_FOUND'],
    denyUrls: ['/instances/access-token', '/v1/api/owntracks/'],
  });

  app.use(Sentry.Handlers.requestHandler());

  app.use(middlewares.requestExecutionTime);

  // parse application/x-www-form-urlencoded
  app.use(
    bodyParser.urlencoded({
      extended: false,
    }),
  );

  // don't parse body of stripe webhook
  app.use('/stripe/webhook', bodyParser.raw({ type: '*/*' }));

  // parse application/json
  app.use(bodyParser.json());

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    next();
  });

  app.options('/*', (req, res, next) => {
    res.sendStatus(200);
  });

  app.get('/ping', asyncMiddleware(controllers.pingController.ping));

  // stats
  app.get('/stats', asyncMiddleware(controllers.statController.getStats));

  // user
  app.post('/users/signup', middlewares.rateLimiter, asyncMiddleware(controllers.userController.signup));
  app.post('/users/verify', middlewares.rateLimiter, asyncMiddleware(controllers.userController.confirmEmail));
  app.post('/users/login-salt', middlewares.rateLimiter, asyncMiddleware(controllers.userController.loginGetSalt));
  app.post(
    '/users/login-generate-ephemeral',
    middlewares.rateLimiter,
    asyncMiddleware(controllers.userController.loginGenerateEphemeralValuePair),
  );
  app.post(
    '/users/login-finalize',
    middlewares.rateLimiter,
    asyncMiddleware(controllers.userController.loginDeriveSession),
  );
  app.post(
    '/users/login-two-factor',
    asyncMiddleware(middlewares.twoFactorTokenAuth),
    asyncMiddleware(controllers.userController.loginTwoFactor),
  );

  app.post(
    '/users/two-factor-configure',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'two-factor-configure' })),
    asyncMiddleware(controllers.userController.configureTwoFactor),
  );
  app.post(
    '/users/two-factor-enable',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'two-factor-configure' })),
    asyncMiddleware(controllers.userController.enableTwoFactor),
  );

  app.patch(
    '/users/me',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.userController.updateUser),
  );
  app.get(
    '/users/me',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })),
    asyncMiddleware(controllers.userController.getMySelf),
  );
  app.get(
    '/users/setup',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })),
    asyncMiddleware(controllers.userController.getSetupState),
  );

  app.get(
    '/users/access-token',
    asyncMiddleware(middlewares.refreshTokenAuth),
    asyncMiddleware(controllers.userController.getAccessToken),
  );

  app.post(
    '/users/forgot-password',
    middlewares.rateLimiter,
    asyncMiddleware(controllers.userController.forgotPassword),
  );
  app.post('/users/reset-password', middlewares.rateLimiter, asyncMiddleware(controllers.userController.resetPassword));
  app.get(
    '/users/reset-password/:token',
    middlewares.rateLimiter,
    asyncMiddleware(controllers.userController.getEmailResetPassword),
  );

  app.get(
    '/users/two-factor/new',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.userController.getNewTwoFactorSecret),
  );
  app.patch(
    '/users/two-factor',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.userController.updateTwoFactor),
  );

  // devices
  app.get(
    '/users/me/devices',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })),
    asyncMiddleware(controllers.deviceController.getDevices),
  );
  app.post(
    '/devices/:id/revoke',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })),
    asyncMiddleware(controllers.deviceController.revokeDevice),
  );

  // instance
  app.get(
    '/instances',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })),
    asyncMiddleware(controllers.instanceController.getInstances),
  );
  app.post(
    '/instances',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })),
    asyncMiddleware(controllers.instanceController.createInstance),
  );
  app.get(
    '/instances/access-token',
    asyncMiddleware(middlewares.refreshTokenInstanceAuth),
    asyncMiddleware(controllers.instanceController.getAccessToken),
  );
  app.get(
    '/instances/users',
    asyncMiddleware(middlewares.accessTokenInstanceAuth),
    asyncMiddleware(controllers.instanceController.getUsers),
  );
  app.get(
    '/instances/:id',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })),
    asyncMiddleware(controllers.instanceController.getInstanceById),
  );

  // invitation
  app.post(
    '/invitations',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.invitationController.inviteUser),
  );
  app.post('/invitations/accept', middlewares.rateLimiter, asyncMiddleware(controllers.invitationController.accept));
  app.get('/invitations/:id', middlewares.rateLimiter, asyncMiddleware(controllers.invitationController.getInvitation));
  app.post(
    '/invitations/:id/revoke',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.invitationController.revokeInvitation),
  );

  // account
  app.post(
    '/accounts/subscribe/new',
    asyncMiddleware(controllers.accountController.subscribeMonthlyPlanWithoutAccount),
  );
  app.get(
    '/accounts/users',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })),
    asyncMiddleware(controllers.accountController.getUsers),
  );
  app.post(
    '/accounts/subscribe',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.accountController.subscribeMonthlyPlan),
  );
  app.post(
    '/accounts/resubscribe',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.accountController.subscribeAgainToMonthlySubscription),
  );
  app.patch(
    '/accounts/source',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.accountController.updateCard),
  );
  app.get(
    '/accounts/source',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })),
    asyncMiddleware(controllers.accountController.getCard),
  );
  app.post(
    '/accounts/cancel',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.accountController.cancelMonthlySubscription),
  );
  app.post(
    '/accounts/users/:id/revoke',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.accountController.revokeUser),
  );
  app.get(
    '/accounts/invoices',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })),
    asyncMiddleware(controllers.accountController.getInvoices),
  );

  app.post('/accounts/payments/sessions', asyncMiddleware(controllers.accountController.createPaymentSession));

  app.get(
    '/accounts/stripe_customer_portal/:stripe_portal_key',
    middlewares.rateLimiter,
    asyncMiddleware(controllers.accountController.redirectToStripeCustomerPortal),
  );

  // admin
  app.post(
    '/admin/accounts/:id/resend',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    middlewares.isSuperAdmin,
    asyncMiddleware(controllers.adminController.resendConfirmationEmail),
  );
  app.get(
    '/admin/accounts',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    middlewares.isSuperAdmin,
    asyncMiddleware(controllers.adminController.getAllAccounts),
  );
  app.delete(
    '/admin/accounts/:id',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    middlewares.isSuperAdmin,
    asyncMiddleware(controllers.adminController.deleteAccount),
  );

  // stripe webhook
  app.post('/stripe/webhook', asyncMiddleware(controllers.accountController.stripeEvent));

  // open API managment
  app.post(
    '/open-api-keys',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.openApiController.createNewApiKey),
  );
  app.get(
    '/open-api-keys',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:read' })),
    asyncMiddleware(controllers.openApiController.getApiKeys),
  );
  app.delete(
    '/open-api-keys/:id',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.openApiController.revokeApiKey),
  );
  app.patch(
    '/open-api-keys/:id',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.openApiController.updateApiKeyName),
  );

  // open API access
  app.post(
    '/v1/api/event/:open_api_key',
    asyncMiddleware(middlewares.openApiKeyAuth),
    asyncMiddleware(controllers.openApiController.createEvent),
  );
  app.post(
    '/v1/api/owntracks/:open_api_key',
    asyncMiddleware(middlewares.openApiKeyAuth),
    asyncMiddleware(controllers.openApiController.createOwntracksLocation),
  );
  app.post(
    '/v1/api/netatmo/:open_api_key',
    asyncMiddleware(middlewares.openApiKeyAuth),
    asyncMiddleware(controllers.openApiController.handleNetatmoWebhook),
  );
  app.post(
    '/v1/api/message/:open_api_key',
    asyncMiddleware(middlewares.openApiKeyAuth),
    asyncMiddleware(controllers.openApiController.createMessage),
  );
  app.post(
    '/v1/api/device/state/:open_api_key',
    asyncMiddleware(middlewares.openApiKeyAuth),
    asyncMiddleware(controllers.openApiController.createDeviceState),
  );
  // google home internal route
  app.post(
    '/google/authorize',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'dashboard:write' })),
    asyncMiddleware(controllers.googleController.authorize),
  );
  app.post(
    '/google/request_sync',
    asyncMiddleware(middlewares.accessTokenInstanceAuth),
    asyncMiddleware(controllers.googleController.requestSync),
  );
  app.post(
    '/google/report_state',
    asyncMiddleware(middlewares.accessTokenInstanceAuth),
    asyncMiddleware(controllers.googleController.reportState),
  );
  //  google home actions
  app.post(
    '/v1/api/google/smart_home',
    asyncMiddleware(middlewares.accessTokenAuth({ scope: 'google-home', audience: 'google-home-oauth' })),
    asyncMiddleware(controllers.googleController.smartHome),
  );

  app.post('/v1/api/google/token', asyncMiddleware(controllers.googleController.token));

  // Gladys version
  app.get(
    '/v1/api/gladys/version',
    middlewares.rateLimiter,
    middlewares.gladysUsage,
    asyncMiddleware(controllers.versionController.getCurrentVersion),
  );

  // Backup
  app.post('/backups', asyncMiddleware(middlewares.accessTokenInstanceAuth), controllers.backupController.create);
  app.get('/backups', asyncMiddleware(middlewares.accessTokenInstanceAuth), controllers.backupController.get);

  // socket
  io.on('connection', controllers.socketController.connection);

  // 404 error
  app.use(
    asyncMiddleware((req, res, next) => {
      throw new NotFoundError(`Route ${req.url} not found`);
    }),
  );

  app.use(
    Sentry.Handlers.errorHandler({
      shouldHandleError(error) {
        // Stop capturing 404 erros
        if (error instanceof NotFoundError) {
          return false;
        }
        if (error && error.status === 404) {
          return false;
        }
        return true;
      },
    }),
  );

  // error
  app.use(middlewares.errorMiddleware);
};
