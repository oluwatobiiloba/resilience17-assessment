const { createHandler } = require('@app-core/server');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');

module.exports = createHandler({
  path: '/payment-instructions',
  method: 'post',
  async handler(rc) {
    // Validate Content-Type header
    const contentType = rc.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      throwAppError('Content-Type must be application/json', ERROR_CODE.INVLDREQ);
    }

    // Validate request body exists
    if (!rc.body || typeof rc.body !== 'object') {
      throwAppError('Request body is required', ERROR_CODE.INVLDREQ);
    }

    // Validate required fields exist
    if (!rc.body.accounts) {
      throwAppError('Missing required field: accounts', ERROR_CODE.INVLDDATA);
    }

    if (!rc.body.instruction) {
      throwAppError('Missing required field: instruction', ERROR_CODE.INVLDDATA);
    }

    // Validate accounts is an array
    if (!Array.isArray(rc.body.accounts)) {
      throwAppError('Field accounts must be an array', ERROR_CODE.INVLDDATA);
    }

    // Validate accounts array is not empty
    if (rc.body.accounts.length === 0) {
      throwAppError('Field accounts cannot be empty', ERROR_CODE.INVLDDATA);
    }

    // Validate instruction is a string
    if (typeof rc.body.instruction !== 'string') {
      throwAppError('Field instruction must be a string', ERROR_CODE.INVLDDATA);
    }

    // Validate instruction is not empty
    if (rc.body.instruction.trim().length === 0) {
      throwAppError('Field instruction cannot be empty', ERROR_CODE.INVLDDATA);
    }

    // Validate each account has required fields
    for (let i = 0; i < rc.body.accounts.length; i++) {
      const account = rc.body.accounts[i];
      
      if (!account || typeof account !== 'object') {
        throwAppError(`Account at index ${i} must be an object`, ERROR_CODE.INVLDDATA);
      }

      if (account.id === undefined || account.id === null) {
        throwAppError(`Account at index ${i} is missing required field: id`, ERROR_CODE.INVLDDATA);
      }

      if (typeof account.id !== 'string') {
        throwAppError(`Account at index ${i} field id must be a string`, ERROR_CODE.INVLDDATA);
      }

      if (account.balance === undefined || account.balance === null) {
        throwAppError(`Account at index ${i} is missing required field: balance`, ERROR_CODE.INVLDDATA);
      }

      if (typeof account.balance !== 'number') {
        throwAppError(`Account at index ${i} field balance must be a number`, ERROR_CODE.INVLDDATA);
      }

      if (account.balance < 0) {
        throwAppError(`Account at index ${i} field balance cannot be negative`, ERROR_CODE.INVLDDATA);
      }

      if (account.currency === undefined || account.currency === null) {
        throwAppError(`Account at index ${i} is missing required field: currency`, ERROR_CODE.INVLDDATA);
      }

      if (typeof account.currency !== 'string') {
        throwAppError(`Account at index ${i} field currency must be a string`, ERROR_CODE.INVLDDATA);
      }

      if (account.currency.trim().length === 0) {
        throwAppError(`Account at index ${i} field currency cannot be empty`, ERROR_CODE.INVLDDATA);
      }
    }

    // Pass through - validation successful
    return {};
  },
});
