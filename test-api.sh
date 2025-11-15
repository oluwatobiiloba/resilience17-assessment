#!/bin/bash

BASE_URL="${BASE_URL:-https://resilience17-assessment-dbc3.onrender.com}"

echo "======================================"
echo "Payment Instructions API Test Suite"
echo "Testing endpoint: ${BASE_URL}/payment-instructions"
echo "======================================"

# Test Case 1 - DEBIT format (successful execution)
echo -e "\n[Test 1/12] DEBIT format - Successful execution"
echo "Expected: AP00 - Transaction executed successfully"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "N90394", "balance": 1000, "currency": "USD"},
      {"id": "N9122", "balance": 500, "currency": "USD"}
    ],
    "instruction": "DEBIT 500 USD FROM ACCOUNT N90394 FOR CREDIT TO ACCOUNT N9122"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

# Test Case 2 - CREDIT format with future date (pending)
echo -e "\n[Test 2/12] CREDIT format with future date - Pending"
echo "Expected: AP02 - Transaction scheduled for future execution"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "acc-001", "balance": 1000, "currency": "NGN"},
      {"id": "acc-002", "balance": 500, "currency": "NGN"}
    ],
    "instruction": "CREDIT 300 NGN TO ACCOUNT acc-002 FOR DEBIT FROM ACCOUNT acc-001 ON 2026-12-31"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

# Test Case 3 - Case insensitive keywords (successful)
echo -e "\n[Test 3/12] Case insensitive keywords"
echo "Expected: AP00 - Transaction executed successfully"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "GBP"},
      {"id": "b", "balance": 200, "currency": "GBP"}
    ],
    "instruction": "debit 100 gbp from account a for credit to account b"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

# Test Case 4 - Past date (immediate execution)
echo -e "\n[Test 4/12] Past date - Immediate execution"
echo "Expected: AP00 - Transaction executed successfully"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "x", "balance": 500, "currency": "NGN"},
      {"id": "y", "balance": 200, "currency": "NGN"}
    ],
    "instruction": "DEBIT 100 NGN FROM ACCOUNT x FOR CREDIT TO ACCOUNT y ON 2024-01-15"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

# Test Case 5 - Currency mismatch
echo -e "\n[Test 5/12] Currency mismatch error"
echo "Expected: CU01 - Account currency mismatch"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "a", "balance": 100, "currency": "USD"},
      {"id": "b", "balance": 500, "currency": "GBP"}
    ],
    "instruction": "DEBIT 50 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

# Test Case 6 - Insufficient funds
echo -e "\n[Test 6/12] Insufficient funds error"
echo "Expected: AC01 - Insufficient funds in debit account"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "a", "balance": 100, "currency": "USD"},
      {"id": "b", "balance": 500, "currency": "USD"}
    ],
    "instruction": "DEBIT 500 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

# Test Case 7 - Unsupported currency
echo -e "\n[Test 7/12] Unsupported currency error"
echo "Expected: CU02 - Unsupported currency"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "a", "balance": 100, "currency": "EUR"},
      {"id": "b", "balance": 500, "currency": "EUR"}
    ],
    "instruction": "DEBIT 50 EUR FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

# Test Case 8 - Same account error
echo -e "\n[Test 8/12] Same account error"
echo "Expected: AC02 - Debit and credit accounts cannot be the same"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "USD"}
    ],
    "instruction": "DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT a"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

# Test Case 9 - Negative amount
echo -e "\n[Test 9/12] Negative amount error"
echo "Expected: AM01 - Amount must be a positive integer"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "USD"},
      {"id": "b", "balance": 200, "currency": "USD"}
    ],
    "instruction": "DEBIT -100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

# Test Case 10 - Account not found
echo -e "\n[Test 10/12] Account not found error"
echo "Expected: AC03 - Account not found"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "USD"}
    ],
    "instruction": "DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT xyz"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

# Test Case 11 - Decimal amount
echo -e "\n[Test 11/12] Decimal amount error"
echo "Expected: AM01 - Amount must be a positive integer"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "USD"},
      {"id": "b", "balance": 200, "currency": "USD"}
    ],
    "instruction": "DEBIT 100.50 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

# Test Case 12 - Malformed instruction
echo -e "\n[Test 12/12] Malformed instruction error"
echo "Expected: SY01 or SY03 - Missing required keywords or malformed instruction"
curl -s -X POST ${BASE_URL}/payment-instructions \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {"id": "a", "balance": 500, "currency": "USD"},
      {"id": "b", "balance": 200, "currency": "USD"}
    ],
    "instruction": "SEND 100 USD TO ACCOUNT b"
  }' | jq -r '.data | "Result: \(.status) (\(.status_code)) - \(.status_reason)"'

echo -e "\n======================================"
echo "Test Suite Complete"
echo "======================================"