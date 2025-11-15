# Payment Instructions Parser - Implementation Brief

## Overview


Hi d3, we meet again.

This implementation provides a payment instruction parser and executor for the Resilience 17 Backend Engineer Assessment. It processes natural language payment instructions, validates them against business rules, and executes transactions on provided accounts.

## Project Structure

```
payment-instructions-api/
├── endpoints/
│   └── payment-instructions/
│       └── process.js           # POST /payment-instructions endpoint
├── services/
│   └── payment-processor/
│       └── parse-instruction.js # Core parsing and execution logic
├── messages/
│   └── payment.js              # Centralized error/status messages
└── app.js                      # Main application entry point
```

## Architecture

The implementation follows the template's layered architecture:

```
Request → Endpoint → Service → Business Logic → Response
```

### Key Components

1. **Endpoint** (`endpoints/payment-instructions/process.js`)
   - Handles HTTP routing for `POST /payment-instructions`
   - Maps status codes to HTTP responses (200 for AP00/AP02, 400 for errors)
   - Uses framework's error handling

2. **Service** (`services/payment-processor/parse-instruction.js`)
   - Validates input using the framework's validator
   - Parses instruction text using manual string manipulation (no regex)
   - Applies business rules and validates accounts
   - Executes or schedules transactions based on date logic

3. **Messages** (`messages/payment.js`)
   - Centralizes all user-facing status messages
   - Registered in `messages/index.js`

## Implementation Details

### Parsing Strategy

The parser uses **manual tokenization** without regular expressions:

```javascript
function tokenize(raw) {
  const tokens = [];
  let current = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') {
      if (current) { tokens.push(current); current = ''; }
    } else current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}
```

This approach:
- Handles multiple consecutive spaces
- Works with tabs and newlines
- Produces clean tokens for keyword matching

### Instruction Formats Supported

**Format 1 - DEBIT:**
```
DEBIT [amount] [currency] FROM ACCOUNT [account_id] FOR CREDIT TO ACCOUNT [account_id] [ON [date]]
```

**Format 2 - CREDIT:**
```
CREDIT [amount] [currency] TO ACCOUNT [account_id] FOR DEBIT FROM ACCOUNT [account_id] [ON [date]]
```

Both formats execute identical transactions - only the phrasing differs.

### Validation Rules

| Status Code | Condition | Example |
|-------------|-----------|---------|
| `AM01` | Amount not a positive integer | `-100`, `100.50` |
| `CU01` | Account currencies don't match | USD account → GBP account |
| `CU02` | Unsupported currency | EUR (only NGN, USD, GBP, GHS allowed) |
| `AC01` | Insufficient funds | Debit 500 from account with balance 100 |
| `AC02` | Same debit and credit account | Transfer from `a` to `a` |
| `AC03` | Account not found | Reference to non-existent account |
| `AC04` | Invalid account ID format | Account ID with invalid characters |
| `DT01` | Invalid date format | Not YYYY-MM-DD |
| `SY01` | Missing required keyword | Omitted FROM, TO, ACCOUNT, etc. |
| `SY02` | Invalid keyword order | Keywords out of sequence |
| `SY03` | General parsing error | Unparseable instruction |
| `AP00` | Successful execution | Transaction completed |
| `AP02` | Pending (future date) | Scheduled for future execution |

### Date Handling

- Uses **UTC timezone** for all comparisons
- Compares date-only portions (ignores time)
- Logic:
  - `ON date > current UTC date` → status: `pending`, code: `AP02`
  - `ON date <= current UTC date` OR no date → status: `successful`, code: `AP00`

### Account Balance Management

For **successful transactions**:
- `balance_before` = original balance
- `balance` = original balance ± amount

For **failed/pending transactions**:
- `balance_before` = current balance
- `balance` = current balance (unchanged)

Accounts array maintains **original order** from request.

### Response Format

All responses include:
```json
{
  "type": "DEBIT" | "CREDIT" | null,
  "amount": integer | null,
  "currency": "NGN" | "USD" | "GBP" | "GHS" | null,
  "debit_account": string | null,
  "credit_account": string | null,
  "execute_by": "YYYY-MM-DD" | null,
  "status": "successful" | "pending" | "failed",
  "status_reason": string,
  "status_code": string,
  "accounts": [
    {
      "id": string,
      "balance": number,
      "balance_before": number,
      "currency": string
    }
  ]
}
```

## API Usage

### Endpoint

```
POST /payment-instructions
Content-Type: application/json
```

### Request Body

```json
{
  "accounts": [
    {"id": "a", "balance": 230, "currency": "USD"},
    {"id": "b", "balance": 300, "currency": "USD"}
  ],
  "instruction": "DEBIT 30 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
}
```

### Example Responses

#### Successful Transaction
```json
{
  "status": "success",
  "data": {
    "type": "DEBIT",
    "amount": 30,
    "currency": "USD",
    "debit_account": "a",
    "credit_account": "b",
    "execute_by": null,
    "status": "successful",
    "status_reason": "Transaction executed successfully",
    "status_code": "AP00",
    "accounts": [
      {"id": "a", "balance": 200, "balance_before": 230, "currency": "USD"},
      {"id": "b", "balance": 330, "balance_before": 300, "currency": "USD"}
    ]
  }
}
```
**HTTP Status:** 200 OK

#### Pending Transaction (Future Date)
```json
{
  "status": "success",
  "data": {
    "type": "CREDIT",
    "amount": 300,
    "currency": "NGN",
    "debit_account": "acc-001",
    "credit_account": "acc-002",
    "execute_by": "2026-12-31",
    "status": "pending",
    "status_reason": "Transaction scheduled for future execution",
    "status_code": "AP02",
    "accounts": [
      {"id": "acc-001", "balance": 1000, "balance_before": 1000, "currency": "NGN"},
      {"id": "acc-002", "balance": 500, "balance_before": 500, "currency": "NGN"}
    ]
  }
}
```
**HTTP Status:** 200 OK

#### Failed Transaction (Currency Mismatch)
```json
{
  "status": "success",
  "data": {
    "type": "DEBIT",
    "amount": 50,
    "currency": "USD",
    "debit_account": "a",
    "credit_account": "b",
    "execute_by": null,
    "status": "failed",
    "status_reason": "Account currency mismatch",
    "status_code": "CU01",
    "accounts": [
      {"id": "a", "balance": 100, "balance_before": 100, "currency": "USD"},
      {"id": "b", "balance": 500, "balance_before": 500, "currency": "GBP"}
    ]
  }
}
```
**HTTP Status:** 400 Bad Request

#### Unparseable Instruction
```json
{
  "status": "success",
  "data": {
    "type": null,
    "amount": null,
    "currency": null,
    "debit_account": null,
    "credit_account": null,
    "execute_by": null,
    "status": "failed",
    "status_reason": "Malformed instruction",
    "status_code": "SY03",
    "accounts": []
  }
}
```
**HTTP Status:** 400 Bad Request

## Testing

### Local Development

1. **Start the server:**
```bash
npm install
node app.js
```

Server runs on `http://localhost:3000`

2. **Test with curl:**

**Successful DEBIT:**
```bash
curl -X POST http://localhost:3000/payment-instructions \
  -H 'Content-Type: application/json' \
  -d '{
    "accounts": [
      {"id": "a", "balance": 230, "currency": "USD"},
      {"id": "b", "balance": 300, "currency": "USD"}
    ],
    "instruction": "DEBIT 30 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }'
```

**Pending CREDIT (future date):**
```bash
curl -X POST http://localhost:3000/payment-instructions \
  -H 'Content-Type: application/json' \
  -d '{
    "accounts": [
      {"id": "acc-001", "balance": 1000, "currency": "NGN"},
      {"id": "acc-002", "balance": 500, "currency": "NGN"}
    ],
    "instruction": "CREDIT 300 NGN TO ACCOUNT acc-002 FOR DEBIT FROM ACCOUNT acc-001 ON 2026-12-31"
  }'
```

**Case-insensitive keywords:**
```bash
curl -X POST http://localhost:3000/payment-instructions \
  -H 'Content-Type: application/json' \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "GBP"},
      {"id": "b", "balance": 200, "currency": "GBP"}
    ],
    "instruction": "debit 100 gbp from account a for credit to account b"
  }'
```

**Currency mismatch error:**
```bash
curl -X POST http://localhost:3000/payment-instructions \
  -H 'Content-Type: application/json' \
  -d '{
    "accounts": [
      {"id": "a", "balance": 100, "currency": "USD"},
      {"id": "b", "balance": 500, "currency": "GBP"}
    ],
    "instruction": "DEBIT 50 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }'
```

**Insufficient funds error:**
```bash
curl -X POST http://localhost:3000/payment-instructions \
  -H 'Content-Type: application/json' \
  -d '{
    "accounts": [
      {"id": "a", "balance": 100, "currency": "USD"},
      {"id": "b", "balance": 500, "currency": "USD"}
    ],
    "instruction": "DEBIT 500 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }'
```

**Unsupported currency:**
```bash
curl -X POST http://localhost:3000/payment-instructions \
  -H 'Content-Type: application/json' \
  -d '{
    "accounts": [
      {"id": "a", "balance": 100, "currency": "EUR"},
      {"id": "b", "balance": 500, "currency": "EUR"}
    ],
    "instruction": "DEBIT 50 EUR FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }'
```

**Same account error:**
```bash
curl -X POST http://localhost:3000/payment-instructions \
  -H 'Content-Type: application/json' \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "USD"}
    ],
    "instruction": "DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT a"
  }'
```

**Account not found:**
```bash
curl -X POST http://localhost:3000/payment-instructions \
  -H 'Content-Type: application/json' \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "USD"}
    ],
    "instruction": "DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT xyz"
  }'
```

**Invalid amount (negative):**
```bash
curl -X POST http://localhost:3000/payment-instructions \
  -H 'Content-Type: application/json' \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "USD"},
      {"id": "b", "balance": 200, "currency": "USD"}
    ],
    "instruction": "DEBIT -100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }'
```

**Invalid amount (decimal):**
```bash
curl -X POST http://localhost:3000/payment-instructions \
  -H 'Content-Type: application/json' \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "USD"},
      {"id": "b", "balance": 200, "currency": "USD"}
    ],
    "instruction": "DEBIT 100.50 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }'
```

**Malformed instruction:**
```bash
curl -X POST http://localhost:3000/payment-instructions \
  -H 'Content-Type: application/json' \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "USD"},
      {"id": "b", "balance": 200, "currency": "USD"}
    ],
    "instruction": "SEND 100 USD TO ACCOUNT b"
  }'
```

## Test Coverage

All assessment test cases have been validated:

 **Test Case 1** - DEBIT format (successful execution)  
 **Test Case 2** - CREDIT format with future date (pending)  
 **Test Case 3** - Case insensitive keywords (successful)  
 **Test Case 4** - Past date (immediate execution)  
 **Test Case 5** - Currency mismatch (CU01)  
 **Test Case 6** - Insufficient funds (AC01)  
 **Test Case 7** - Unsupported currency (CU02)  
 **Test Case 8** - Same account (AC02)  
 **Test Case 9** - Negative amount (AM01)  
 **Test Case 10** - Account not found (AC03)  
 **Test Case 11** - Decimal amount (AM01)  
 **Test Case 12** - Malformed instruction (SY03)

## Key Features

### No Regular Expressions
- Manual character-by-character tokenization
- String methods only (`.split()`, `.indexOf()`, `.substring()`, `.toUpperCase()`, etc.)
- Date validation using manual format checks

### Template Compliance
- Service follows two-parameter signature: `(serviceData, options = {})`
- Single exit point with `let response;` pattern
- Validator-first approach
- Path aliases (`@app-core/*`, `@app/services/*`, `@app/messages/*`)
- Centralized message definitions
- Proper endpoint/service/messages folder structure

###  Comprehensive Error Handling
- All 12 validation rules implemented with correct status codes
- Clear, descriptive error messages
- HTTP 200 for success/pending, HTTP 400 for errors
- Maintains account state consistency

###  Business Logic Correctness
- Accurate debit/credit accounting
- Proper balance tracking (`balance` and `balance_before`)
- UTC date comparison for scheduling
- Account order preservation
- Currency uppercase normalization

## Deployment

To deploy this application:

1. **Render:**
- APP_URL=

## Implementation Notes

### Design Decisions

1. **Manual Tokenization:** Chosen to strictly comply with "no regex" requirement while handling variable whitespace robustly.

2. **Single Service File:** All parsing logic consolidated in one service for maintainability, following template's service structure guidelines.

3. **Early Account Snapshots:** Accounts cloned before any mutations to ensure `balance_before` reflects true original state.

4. **Status Code Mapping:** Endpoint layer handles HTTP status mapping (200/400) based on business status codes from service.

5. **Message Centralization:** All user-facing messages in `messages/payment.js` for easy maintenance and consistency.

## Future Enhancements

Potential improvements (beyond assessment scope):

- [ ] Implement rate limiting
- [ ] Add comprehensive logging for audit trail
- [ ] Database persistence for transaction history
- [ ] Support for batch transaction processing
- [ ] Webhook notifications for scheduled transactions
- [ ] Multi-currency conversion support
- [ ] Transaction rollback/reversal capabilities