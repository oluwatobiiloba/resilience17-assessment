const { createHandler } = require('@app-core/server');
const { appLogger } = require('@app-core/logger');
const paymentInstructionsService = require('@app/services/payment-instructions');
const { validatePaymentRequest } = require('@app/middlewares');

module.exports = createHandler({
  path: '/payment-instructions',
  method: 'post',
  middlewares: [validatePaymentRequest],
  async onResponseEnd(rc, rs) {
    appLogger.info({ requestContext: rc, response: rs }, 'payment-instructions-request-completed');
  },
  async handler(rc, helpers) {
    const payload = rc.body;

    try {
      const response = await paymentInstructionsService(payload);
      const successCodes = ['AP00', 'AP02'];
      const httpStatus = successCodes.includes(response.status_code)
        ? helpers.http_statuses.HTTP_200_OK
        : helpers.http_statuses.HTTP_400_BAD_REQUEST;
      return {
        status: httpStatus,
        data: response,
      };
    } catch (error) {
      appLogger.error({ error: error.message, stack: error.stack }, 'payment-instructions-error');
      
      return {
        status: helpers.http_statuses.HTTP_400_BAD_REQUEST,
        data: {
          type: null,
          amount: null,
          currency: null,
          debit_account: null,
          credit_account: null,
          execute_by: null,
          status: 'failed',
          status_reason: 'Internal server error',
          status_code: 'SY03',
          accounts: [],
        },
      };
    }
  },
});