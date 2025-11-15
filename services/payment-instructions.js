/** Payment Instructions Service (No regex parsing) */
const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'GHS'];

function tokenize(raw) {
  const tokens = [];
  let current = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const isWhitespace = ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
    if (isWhitespace) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function parsePaymentInstruction(instruction) {
  if (!instruction || typeof instruction !== 'string') {
    return createErrorResult('SY03', 'Malformed instruction: unable to parse keywords');
  }
  const clean = instruction.trim();
  if (!clean) return createErrorResult('SY03', 'Malformed instruction: empty instruction');
  const parts = tokenize(clean);
  if (parts.length < 8) return createErrorResult('SY03', 'Malformed instruction: insufficient keywords');
  const first = parts[0].toUpperCase();
  if (first === 'DEBIT') return parseDebitInstruction(parts);
  if (first === 'CREDIT') return parseCreditInstruction(parts);
  return createErrorResult('SY01', 'Missing required keyword: instruction must start with DEBIT or CREDIT');
}

/**
 * Parse DEBIT instruction format: DEBIT [amount] [currency] FROM ACCOUNT [account_id] FOR CREDIT TO ACCOUNT [account_id] [ON [date]]
 */
function parseDebitInstruction(parts) {
  // Expected pattern: DEBIT amount currency FROM ACCOUNT account_id FOR CREDIT TO ACCOUNT account_id [ON date]
  if (parts.length < 10) {
    return {
      type: null,
      amount: null,
      currency: null,
      debit_account: null,
      credit_account: null,
      execute_by: null,
      error: { code: 'SY03', reason: 'Malformed DEBIT instruction: insufficient keywords' }
    };
  }

  // Check keyword order
  if (parts[0].toUpperCase() !== 'DEBIT') {
    return createErrorResult('SY02', 'Invalid keyword order: expected DEBIT at position 1');
  }

  // Parse amount
  const amount = parseInt(parts[1], 10);
  if (isNaN(amount) || amount <= 0 || parts[1].includes('.') || parts[1].includes('-')) {
    return createErrorResult('AM01', 'Amount must be a positive integer');
  }

  // Parse currency
  const currency = parts[2].toUpperCase();

  // Find FROM keyword
  const fromIndex = findKeywordIndex(parts, 'FROM', 3);
  if (fromIndex === -1) {
    return createErrorResult('SY01', 'Missing required keyword: FROM');
  }

  // Check ACCOUNT keyword after FROM
  if (fromIndex + 1 >= parts.length || parts[fromIndex + 1].toUpperCase() !== 'ACCOUNT') {
    return createErrorResult('SY01', 'Missing required keyword: ACCOUNT after FROM');
  }

  // Get debit account
  if (fromIndex + 2 >= parts.length) {
    return createErrorResult('SY03', 'Missing account ID after FROM ACCOUNT');
  }
  const debitAccount = parts[fromIndex + 2];

  // Find FOR keyword
  const forIndex = findKeywordIndex(parts, 'FOR', fromIndex + 3);
  if (forIndex === -1) {
    return createErrorResult('SY01', 'Missing required keyword: FOR');
  }

  // Check CREDIT keyword after FOR
  if (forIndex + 1 >= parts.length || parts[forIndex + 1].toUpperCase() !== 'CREDIT') {
    return createErrorResult('SY01', 'Missing required keyword: CREDIT after FOR');
  }

  // Check TO keyword after CREDIT
  if (forIndex + 2 >= parts.length || parts[forIndex + 2].toUpperCase() !== 'TO') {
    return createErrorResult('SY01', 'Missing required keyword: TO after CREDIT');
  }

  // Check ACCOUNT keyword after TO
  if (forIndex + 3 >= parts.length || parts[forIndex + 3].toUpperCase() !== 'ACCOUNT') {
    return createErrorResult('SY01', 'Missing required keyword: ACCOUNT after TO');
  }

  // Get credit account
  if (forIndex + 4 >= parts.length) {
    return createErrorResult('SY03', 'Missing account ID after TO ACCOUNT');
  }
  const creditAccount = parts[forIndex + 4];

  // Check for optional ON clause
  let executeBy = null;
  const onIndex = findKeywordIndex(parts, 'ON', forIndex + 5);
  if (onIndex !== -1) {
    if (onIndex + 1 >= parts.length) {
      return createErrorResult('DT01', 'Missing date after ON keyword');
    }
    const dateString = parts[onIndex + 1];
    if (!isValidDateFormat(dateString)) {
      return createErrorResult('DT01', 'Invalid date format. Expected YYYY-MM-DD');
    }
    executeBy = dateString;
  }

  return {
    type: 'DEBIT',
    amount,
    currency,
    debit_account: debitAccount,
    credit_account: creditAccount,
    execute_by: executeBy,
    error: null
  };
}

/**
 * Parse CREDIT instruction format: CREDIT [amount] [currency] TO ACCOUNT [account_id] FOR DEBIT FROM ACCOUNT [account_id] [ON [date]]
 */
function parseCreditInstruction(parts) {
  // Expected pattern: CREDIT amount currency TO ACCOUNT account_id FOR DEBIT FROM ACCOUNT account_id [ON date]
  if (parts.length < 10) {
    return {
      type: null,
      amount: null,
      currency: null,
      debit_account: null,
      credit_account: null,
      execute_by: null,
      error: { code: 'SY03', reason: 'Malformed CREDIT instruction: insufficient keywords' }
    };
  }

  // Check keyword order
  if (parts[0].toUpperCase() !== 'CREDIT') {
    return createErrorResult('SY02', 'Invalid keyword order: expected CREDIT at position 1');
  }

  // Parse amount
  const amount = parseInt(parts[1], 10);
  if (isNaN(amount) || amount <= 0 || parts[1].includes('.') || parts[1].includes('-')) {
    return createErrorResult('AM01', 'Amount must be a positive integer');
  }

  // Parse currency
  const currency = parts[2].toUpperCase();

  // Find TO keyword
  const toIndex = findKeywordIndex(parts, 'TO', 3);
  if (toIndex === -1) {
    return createErrorResult('SY01', 'Missing required keyword: TO');
  }

  // Check ACCOUNT keyword after TO
  if (toIndex + 1 >= parts.length || parts[toIndex + 1].toUpperCase() !== 'ACCOUNT') {
    return createErrorResult('SY01', 'Missing required keyword: ACCOUNT after TO');
  }

  // Get credit account
  if (toIndex + 2 >= parts.length) {
    return createErrorResult('SY03', 'Missing account ID after TO ACCOUNT');
  }
  const creditAccount = parts[toIndex + 2];

  // Find FOR keyword
  const forIndex = findKeywordIndex(parts, 'FOR', toIndex + 3);
  if (forIndex === -1) {
    return createErrorResult('SY01', 'Missing required keyword: FOR');
  }

  // Check DEBIT keyword after FOR
  if (forIndex + 1 >= parts.length || parts[forIndex + 1].toUpperCase() !== 'DEBIT') {
    return createErrorResult('SY01', 'Missing required keyword: DEBIT after FOR');
  }

  // Check FROM keyword after DEBIT
  if (forIndex + 2 >= parts.length || parts[forIndex + 2].toUpperCase() !== 'FROM') {
    return createErrorResult('SY01', 'Missing required keyword: FROM after DEBIT');
  }

  // Check ACCOUNT keyword after FROM
  if (forIndex + 3 >= parts.length || parts[forIndex + 3].toUpperCase() !== 'ACCOUNT') {
    return createErrorResult('SY01', 'Missing required keyword: ACCOUNT after FROM');
  }

  // Get debit account
  if (forIndex + 4 >= parts.length) {
    return createErrorResult('SY03', 'Missing account ID after FROM ACCOUNT');
  }
  const debitAccount = parts[forIndex + 4];

  // Check for optional ON clause
  let executeBy = null;
  const onIndex = findKeywordIndex(parts, 'ON', forIndex + 5);
  if (onIndex !== -1) {
    if (onIndex + 1 >= parts.length) {
      return createErrorResult('DT01', 'Missing date after ON keyword');
    }
    const dateString = parts[onIndex + 1];
    if (!isValidDateFormat(dateString)) {
      return createErrorResult('DT01', 'Invalid date format. Expected YYYY-MM-DD');
    }
    executeBy = dateString;
  }

  return {
    type: 'CREDIT',
    amount,
    currency,
    debit_account: debitAccount,
    credit_account: creditAccount,
    execute_by: executeBy,
    error: null
  };
}

/**
 * Find keyword index in parts array (case-insensitive)
 */
function findKeywordIndex(parts, keyword, startIndex = 0) {
  for (let i = startIndex; i < parts.length; i++) {
    if (parts[i].toUpperCase() === keyword.toUpperCase()) {
      return i;
    }
  }
  return -1;
}

/**
 * Create error result object
 */
function createErrorResult(code, reason) {
  return {
    type: null,
    amount: null,
    currency: null,
    debit_account: null,
    credit_account: null,
    execute_by: null,
    error: { code, reason }
  };
}

/**
 * Validate date format YYYY-MM-DD
 */
function isValidDateFormat(dateString) {
  if (!dateString || dateString.length !== 10) return false;
  // YYYY-MM-DD manual checks
  for (let i = 0; i < 10; i++) {
    const c = dateString[i];
    const isDigit = c >= '0' && c <= '9';
    if (i === 4 || i === 7) {
      if (c !== '-') return false;
    } else if (!isDigit) {
      return false;
    }
  }
  const year = parseInt(dateString.substring(0, 4), 10);
  const month = parseInt(dateString.substring(5, 7), 10);
  const day = parseInt(dateString.substring(8, 10), 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false; // Basic guard; deeper month/day validation not required here
  const dt = new Date(dateString + 'T00:00:00.000Z');
  if (isNaN(dt.getTime())) return false;
  return dt.toISOString().substring(0, 10) === dateString;
}

/**
 * Validate account ID format (letters, numbers, hyphens, periods, at symbols)
 */
function isValidAccountId(accountId) {
  if (!accountId || typeof accountId !== 'string') {
    return false;
  }
  
  // Check each character manually (no regex)
  for (let i = 0; i < accountId.length; i++) {
    const char = accountId[i];
    const isValid = (char >= 'a' && char <= 'z') ||
                   (char >= 'A' && char <= 'Z') ||
                   (char >= '0' && char <= '9') ||
                   char === '-' || char === '.' || char === '@';
    
    if (!isValid) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validate business rules and execute transaction
 */
function validateAndExecute(parsed, accounts) {
  if (parsed.error) return buildResult(parsed, parsed.error.code, parsed.error.reason, 'failed', []);

  // Account ID format
  if (!isValidAccountId(parsed.debit_account) || !isValidAccountId(parsed.credit_account)) {
    return buildResult(parsed, 'AC04', 'Invalid account ID format', 'failed', []);
  }
  if (parsed.debit_account === parsed.credit_account) {
    return buildResult(parsed, 'AC02', 'Debit and credit accounts cannot be the same', 'failed', []);
  }
  if (!SUPPORTED_CURRENCIES.includes(parsed.currency)) {
    return buildResult(parsed, 'CU02', `Unsupported currency. Only ${SUPPORTED_CURRENCIES.join(', ')} are supported`, 'failed', []);
  }
  const debitAcc = accounts.find(a => a.id === parsed.debit_account);
  const creditAcc = accounts.find(a => a.id === parsed.credit_account);
  if (!debitAcc || !creditAcc) {
    return buildResult(parsed, 'AC03', 'Account not found', 'failed', []);
  }
  if (debitAcc.currency !== creditAcc.currency) {
    return buildResult(parsed, 'CU01', 'Account currency mismatch', 'failed', buildAccountsSnapshot(accounts, parsed, false));
  }
  if (parsed.currency !== debitAcc.currency.toUpperCase()) {
    return buildResult(parsed, 'CU01', 'Transaction currency does not match account currency', 'failed', buildAccountsSnapshot(accounts, parsed, false));
  }
  if (debitAcc.balance < parsed.amount) {
    return buildResult(parsed, 'AC01', `Insufficient funds in debit account: has ${debitAcc.balance} ${debitAcc.currency}, needs ${parsed.amount} ${parsed.currency}`, 'failed', buildAccountsSnapshot(accounts, parsed, false));
  }
  // Date / pending logic
  const todayUTC = new Date().toISOString().substring(0,10);
  if (parsed.execute_by && parsed.execute_by > todayUTC) {
    return buildResult(parsed, 'AP02', 'Transaction scheduled for future execution', 'pending', buildAccountsSnapshot(accounts, parsed, false));
  }
  // Execute
  const originalDebit = debitAcc.balance;
  const originalCredit = creditAcc.balance;
  debitAcc.balance = originalDebit - parsed.amount;
  creditAcc.balance = originalCredit + parsed.amount;
  return buildResult(parsed, 'AP00', 'Transaction executed successfully', 'successful', buildAccountsSnapshot(accounts, parsed, true, originalDebit, originalCredit));
}

/**
 * Get ordered accounts array maintaining original order from request
 */
function buildAccountsSnapshot(originalAccounts, parsed, executed, originalDebitBalance, originalCreditBalance) {
  const out = [];
  for (const acc of originalAccounts) {
    if (acc.id === parsed.debit_account || acc.id === parsed.credit_account) {
      if (!executed) {
        out.push({ id: acc.id, balance: acc.balance, balance_before: acc.balance, currency: acc.currency.toUpperCase() });
      } else {
        if (acc.id === parsed.debit_account) {
          out.push({ id: acc.id, balance: acc.balance, balance_before: originalDebitBalance, currency: acc.currency.toUpperCase() });
        } else {
          out.push({ id: acc.id, balance: acc.balance, balance_before: originalCreditBalance, currency: acc.currency.toUpperCase() });
        }
      }
    }
  }
  return out;
}

function buildResult(parsed, code, reason, status, accountsArr) {
  return {
    type: parsed.type,
    amount: parsed.amount,
    currency: parsed.currency,
    debit_account: parsed.debit_account,
    credit_account: parsed.credit_account,
    execute_by: parsed.execute_by,
    status,
    status_reason: reason,
    status_code: code,
    accounts: accountsArr
  };
}

/**
 * Main service function
 */
async function paymentInstructionsService(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload');
  }

  const { accounts, instruction } = payload;

  if (!accounts || !Array.isArray(accounts)) {
    return {
      type: null,
      amount: null,
      currency: null,
      debit_account: null,
      credit_account: null,
      execute_by: null,
      status: 'failed',
      status_reason: 'Missing or invalid accounts array',
      status_code: 'SY03',
      accounts: []
    };
  }

  if (!instruction || typeof instruction !== 'string') {
    return {
      type: null,
      amount: null,
      currency: null,
      debit_account: null,
      credit_account: null,
      execute_by: null,
      status: 'failed',
      status_reason: 'Missing or invalid instruction',
      status_code: 'SY03',
      accounts: []
    };
  }

  // Clone accounts to avoid mutating original data for failed/pending transactions
  const accountsCopy = accounts.map(account => ({ ...account }));
  
  // Parse the instruction
  const parsed = parsePaymentInstruction(instruction);
  
  // Validate and execute
  const result = validateAndExecute(parsed, accountsCopy);
  
  return result;
}

module.exports = paymentInstructionsService;