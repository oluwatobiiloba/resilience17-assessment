const { createHandler } = require('@app-core/server');
const parseInstruction = require('@app/services/payment-processor/parse-instruction');
const { appLogger } = require('@app-core/logger');

module.exports = createHandler({
  path: '/payment-instructions',
  method: 'post',
  middlewares: [],
  async onResponseEnd(rc, rs) {
    appLogger.info({ requestContext: rc, response: rs }, 'payment-instructions-request-completed');
  },
  async handler(rc, helpers) {
    const payload = rc.body;
    const result = await parseInstruction(payload);
    const successCodes = ['AP00', 'AP02'];
    const httpStatus = successCodes.includes(result.status_code)
      ? helpers.http_statuses.HTTP_200_OK
      : helpers.http_statuses.HTTP_400_BAD_REQUEST;
    return {
      status: httpStatus,
      data: result,
    };
  },
});
