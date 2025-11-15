const validator = require('@app-core/validator');
const PaymentMessages = require('@app/messages/payment');

const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'GHS'];

// Validator spec
const specString = `root {
  accounts[] {
    id string<trim>
    balance number
    currency string<trim>
  }
  instruction string<trim>
}`;
const parsedSpec = validator.parse(specString);

function tokenize(raw) {
  const tokens = [];
  let current = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function createErrorResult(code, reason) {
  return {
    type: null,
    amount: null,
    currency: null,
    debit_account: null,
    credit_account: null,
    execute_by: null,
    status: 'failed',
    status_reason: reason,
    status_code: code,
    accounts: [],
  };
}

function isValidDateFormat(dateString) {
  if (!dateString || dateString.length !== 10) return false;
  for (let i = 0; i < 10; i++) {
    const c = dateString[i];
    const isDigit = c >= '0' && c <= '9';
    if (i === 4 || i === 7) {
      if (c !== '-') return false;
    } else if (!isDigit) return false;
  }
  const dt = new Date(`${dateString}T00:00:00.000Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().substring(0, 10) === dateString;
}

function findKeywordIndex(parts, keyword, startIndex = 0) {
  for (let i = startIndex; i < parts.length; i++)
    if (parts[i].toUpperCase() === keyword.toUpperCase()) return i;
  return -1;
}

function parseDebit(parts) {
  if (parts.length < 10) return createErrorResult('SY03', PaymentMessages.MALFORMED_INSTRUCTION);
  const amountRaw = parts[1];
  const amount = parseInt(amountRaw, 10);
  if (Number.isNaN(amount) || amount <= 0 || amountRaw.includes('.') || amountRaw.includes('-'))
    return createErrorResult('AM01', PaymentMessages.INVALID_AMOUNT);
  const currency = parts[2].toUpperCase();
  const fromIdx = findKeywordIndex(parts, 'FROM', 3);
  if (fromIdx === -1) return createErrorResult('SY01', PaymentMessages.MISSING_KEYWORD);
  if (fromIdx + 2 >= parts.length || parts[fromIdx + 1].toUpperCase() !== 'ACCOUNT')
    return createErrorResult('SY01', PaymentMessages.MISSING_KEYWORD);
  const debitAcc = parts[fromIdx + 2];
  const forIdx = findKeywordIndex(parts, 'FOR', fromIdx + 3);
  if (forIdx === -1 || forIdx + 4 >= parts.length)
    return createErrorResult('SY01', PaymentMessages.MISSING_KEYWORD);
  if (
    parts[forIdx + 1].toUpperCase() !== 'CREDIT' ||
    parts[forIdx + 2].toUpperCase() !== 'TO' ||
    parts[forIdx + 3].toUpperCase() !== 'ACCOUNT'
  )
    return createErrorResult('SY02', PaymentMessages.INVALID_KEYWORD_ORDER);
  const creditAcc = parts[forIdx + 4];
  let executeBy = null;
  const onIdx = findKeywordIndex(parts, 'ON', forIdx + 5);
  if (onIdx !== -1) {
    if (onIdx + 1 >= parts.length)
      return createErrorResult('DT01', PaymentMessages.INVALID_DATE_FORMAT);
    const dateString = parts[onIdx + 1];
    if (!isValidDateFormat(dateString))
      return createErrorResult('DT01', PaymentMessages.INVALID_DATE_FORMAT);
    executeBy = dateString;
  }
  return {
    type: 'DEBIT',
    amount,
    currency,
    debit_account: debitAcc,
    credit_account: creditAcc,
    execute_by: executeBy,
  };
}

function parseCredit(parts) {
  if (parts.length < 10) return createErrorResult('SY03', PaymentMessages.MALFORMED_INSTRUCTION);
  const amountRaw = parts[1];
  const amount = parseInt(amountRaw, 10);
  if (Number.isNaN(amount) || amount <= 0 || amountRaw.includes('.') || amountRaw.includes('-'))
    return createErrorResult('AM01', PaymentMessages.INVALID_AMOUNT);
  const currency = parts[2].toUpperCase();
  const toIdx = findKeywordIndex(parts, 'TO', 3);
  if (toIdx === -1) return createErrorResult('SY01', PaymentMessages.MISSING_KEYWORD);
  if (toIdx + 2 >= parts.length || parts[toIdx + 1].toUpperCase() !== 'ACCOUNT')
    return createErrorResult('SY01', PaymentMessages.MISSING_KEYWORD);
  const creditAcc = parts[toIdx + 2];
  const forIdx = findKeywordIndex(parts, 'FOR', toIdx + 3);
  if (forIdx === -1 || forIdx + 4 >= parts.length)
    return createErrorResult('SY01', PaymentMessages.MISSING_KEYWORD);
  if (
    parts[forIdx + 1].toUpperCase() !== 'DEBIT' ||
    parts[forIdx + 2].toUpperCase() !== 'FROM' ||
    parts[forIdx + 3].toUpperCase() !== 'ACCOUNT'
  )
    return createErrorResult('SY02', PaymentMessages.INVALID_KEYWORD_ORDER);
  const debitAcc = parts[forIdx + 4];
  let executeBy = null;
  const onIdx = findKeywordIndex(parts, 'ON', forIdx + 5);
  if (onIdx !== -1) {
    if (onIdx + 1 >= parts.length)
      return createErrorResult('DT01', PaymentMessages.INVALID_DATE_FORMAT);
    const dateString = parts[onIdx + 1];
    if (!isValidDateFormat(dateString))
      return createErrorResult('DT01', PaymentMessages.INVALID_DATE_FORMAT);
    executeBy = dateString;
  }
  return {
    type: 'CREDIT',
    amount,
    currency,
    debit_account: debitAcc,
    credit_account: creditAcc,
    execute_by: executeBy,
  };
}

function isValidAccountId(id) {
  if (!id || typeof id !== 'string') return false;
  for (let i = 0; i < id.length; i++) {
    const c = id[i];
    const ok =
      (c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z') ||
      (c >= '0' && c <= '9') ||
      c === '-' ||
      c === '.' ||
      c === '@';
    if (!ok) return false;
  }
  return true;
}

function snapshotAccounts(accounts, debitId, creditId, executed, amount) {
  const out = [];
  const debit = accounts.find((a) => a.id === debitId);
  const credit = accounts.find((a) => a.id === creditId);
  for (const acc of accounts) {
    if (acc.id === debitId || acc.id === creditId) {
      if (!executed) {
        out.push({
          id: acc.id,
          balance: acc.balance,
          balance_before: acc.balance,
          currency: acc.currency.toUpperCase(),
        });
      } else if (acc.id === debitId)
        out.push({
          id: acc.id,
          balance: debit.balance,
          balance_before: debit.balance + amount,
          currency: acc.currency.toUpperCase(),
        });
      else
        out.push({
          id: acc.id,
          balance: credit.balance,
          balance_before: credit.balance - amount,
          currency: acc.currency.toUpperCase(),
        });
    }
  }
  return out;
}

async function parseInstruction(serviceData, options = {}) {
  let response; // single exit point
  const data = validator.validate(serviceData, parsedSpec);
  const { instruction } = data;
  const accounts = data.accounts.map((a) => ({ ...a }));
  const parts = tokenize(instruction);
  if (parts.length < 8) {
    response = createErrorResult('SY03', PaymentMessages.MALFORMED_INSTRUCTION);
    return response;
  }
  const first = parts[0].toUpperCase();
  const parsed =
    first === 'DEBIT'
      ? parseDebit(parts)
      : first === 'CREDIT'
        ? parseCredit(parts)
        : createErrorResult('SY01', PaymentMessages.MISSING_KEYWORD);
  if (parsed.status === 'failed') {
    response = parsed;
    return response;
  }

  // Business validations
  if (!isValidAccountId(parsed.debit_account) || !isValidAccountId(parsed.credit_account)) {
    response = createErrorResult('AC04', PaymentMessages.INVALID_ACCOUNT_ID);
    return response;
  }
  const debitAcc = accounts.find((a) => a.id === parsed.debit_account);
  const creditAcc = accounts.find((a) => a.id === parsed.credit_account);
  if (!debitAcc || !creditAcc) {
    response = createErrorResult('AC03', PaymentMessages.ACCOUNT_NOT_FOUND);
    return response;
  }
  if (parsed.debit_account === parsed.credit_account) {
    // throw same account error
    response = {
      ...createErrorResult('AC02', PaymentMessages.SAME_ACCOUNT_ERROR),
      type: parsed.type,
      amount: parsed.amount,
      currency: parsed.currency,
      debit_account: parsed.debit_account,
      credit_account: parsed.credit_account,
      execute_by: parsed.execute_by,
      accounts: snapshotAccounts(
        accounts,
        parsed.debit_account,
        parsed.credit_account,
        false,
        parsed.amount
      ),
    };
    return response;
  }
  if (!SUPPORTED_CURRENCIES.includes(parsed.currency)) {
    response = {
      ...createErrorResult('CU02', PaymentMessages.UNSUPPORTED_CURRENCY),
      type: parsed.type,
      amount: parsed.amount,
      currency: parsed.currency,
      debit_account: parsed.debit_account,
      credit_account: parsed.credit_account,
      execute_by: parsed.execute_by,
      accounts: snapshotAccounts(
        accounts,
        parsed.debit_account,
        parsed.credit_account,
        false,
        parsed.amount
      ),
    };
    return response;
  }
  if (debitAcc.currency !== creditAcc.currency) {
    response = {
      ...createErrorResult('CU01', PaymentMessages.CURRENCY_MISMATCH),
      type: parsed.type,
      amount: parsed.amount,
      currency: parsed.currency,
      debit_account: parsed.debit_account,
      credit_account: parsed.credit_account,
      execute_by: parsed.execute_by,
      accounts: snapshotAccounts(
        accounts,
        parsed.debit_account,
        parsed.credit_account,
        false,
        parsed.amount
      ),
    };
    return response;
  }
  if (parsed.currency !== debitAcc.currency.toUpperCase()) {
    response = {
      ...createErrorResult('CU01', 'Transaction currency does not match account currency'),
      type: parsed.type,
      amount: parsed.amount,
      currency: parsed.currency,
      debit_account: parsed.debit_account,
      credit_account: parsed.credit_account,
      execute_by: parsed.execute_by,
      accounts: snapshotAccounts(
        accounts,
        parsed.debit_account,
        parsed.credit_account,
        false,
        parsed.amount
      ),
    };
    return response;
  }
  if (debitAcc.balance < parsed.amount) {
    response = {
      ...createErrorResult('AC01', PaymentMessages.INSUFFICIENT_FUNDS),
      type: parsed.type,
      amount: parsed.amount,
      currency: parsed.currency,
      debit_account: parsed.debit_account,
      credit_account: parsed.credit_account,
      execute_by: parsed.execute_by,
      accounts: snapshotAccounts(
        accounts,
        parsed.debit_account,
        parsed.credit_account,
        false,
        parsed.amount
      ),
    };
    return response;
  }

  const todayUTC = new Date().toISOString().substring(0, 10);
  if (parsed.execute_by && parsed.execute_by > todayUTC) {
    response = {
      type: parsed.type,
      amount: parsed.amount,
      currency: parsed.currency,
      debit_account: parsed.debit_account,
      credit_account: parsed.credit_account,
      execute_by: parsed.execute_by,
      status: 'pending',
      status_reason: PaymentMessages.TRANSACTION_PENDING,
      status_code: 'AP02',
      accounts: snapshotAccounts(
        accounts,
        parsed.debit_account,
        parsed.credit_account,
        false,
        parsed.amount
      ),
    };
    return response;
  }
  // run instructions
  debitAcc.balance -= parsed.amount;
  creditAcc.balance += parsed.amount;
  response = {
    type: parsed.type,
    amount: parsed.amount,
    currency: parsed.currency,
    debit_account: parsed.debit_account,
    credit_account: parsed.credit_account,
    execute_by: parsed.execute_by,
    status: 'successful',
    status_reason: PaymentMessages.TRANSACTION_SUCCESSFUL,
    status_code: 'AP00',
    accounts: snapshotAccounts(
      accounts,
      parsed.debit_account,
      parsed.credit_account,
      true,
      parsed.amount
    ),
  };
  return response;
}

module.exports = parseInstruction;
