# Secondary & Tertiary Matching - How It Works

## Quick Summary

```
Matching Priority:
Primary   (Score: 1.0)  → document.document_type == folder.document_types
Secondary (Score: 0.85) → "receipt" appears in "airtel-payment-receipt"  
Tertiary  (Score: 0.3+) → "airtel" or "payment" found in document text
```

---

## Secondary Matching: content_type Keywords

### What It Is
Checks if any **content_type** keyword appears **anywhere** in the AI-detected document_type.

### Where It's Implemented
**File:** `backend/app/services/organize_documents.py` lines 204-225

```python
# Content Type Matching - only if content types are specified
content_types = criteria.get('content_type', [])
if content_types and isinstance(content_types, list) and len(content_types) > 0:
    max_score += 30  # 30 points possible
    
    content_types_lower = [t.lower() for t in content_types]
    document_text = (document.get('extracted_text') or '').lower()
    file_name = (document.get('file_name') or '').lower()
    document_type = (document.get('insights', {}).get('document_type') or '').lower()
    
    # Check if ANY content_type keyword matches ANY field
    content_match = False
    for content_type in content_types_lower:
        if (content_type in document_text or       # In document text?
            content_type in file_name or           # In filename?
            content_type in document_type):        # In AI-detected type?
            content_match = True
            reasons.append(f"Content type match: {content_type}")
            break
    
    if content_match:
        total_score += 30  # Award 30 points
```

### Real Example

**You create folder "AirtelPayments" with:**
```javascript
filter_rules: {
  content_type: ['invoice', 'receipt']
}
```

**Documents in your database:**

| Document | AI-Detected Type | filename | extracted_text |
|----------|-----------------|----------|-----------------|
| Doc A | `airtel-payment-receipt` | `Receipt_001.pdf` | "Thank you for payment..." |
| Doc B | `tax-invoice` | `Invoice_2025.pdf` | "Invoice for service rendered..." |
| Doc C | `pdf` | `scan.pdf` | "Meeting notes discussion..." |

**Matching Process:**

```
For each document, check: Does any keyword from content_type match?

Doc A:
  ✓ 'receipt' in 'airtel-payment-receipt'? YES! 
  → MATCH (30 points) ✅

Doc B:
  ✓ 'invoice' in 'tax-invoice'? YES!
  → MATCH (30 points) ✅

Doc C:
  ✗ 'invoice' in 'pdf'? NO
  ✗ 'receipt' in 'pdf'? NO
  → NO MATCH ❌
```

### How to Use It

**When creating Smart Folder:**
```
Folder Name: "AirtelPayments"
Content Type: ['invoice', 'receipt']  ← Put here what types of documents belong
```

The system then checks:
- Document's AI-detected `document_type` field
- Document's `filename`
- Document's `extracted_text`

If ANY of these contain your keyword → **MATCH!**

---

## Tertiary Matching: Text Keywords

### What It Is
Searches for **custom keywords** in the actual extracted text and filename of the document.

### Where It's Implemented
**File:** `backend/app/services/organize_documents.py` lines 262-281

```python
# Keywords Matching - only if keywords are specified
keywords = criteria.get('keywords', [])
if keywords and isinstance(keywords, list) and len(keywords) > 0:
    max_score += 25  # 25 points possible
    
    document_text = (document.get('extracted_text') or '').lower()
    file_name = (document.get('file_name') or '').lower()
    keyword_matches = 0
    
    # Count how many keywords match
    for keyword in keywords:
        keyword_lower = keyword.lower()
        if (keyword_lower in document_text or    # In extracted text?
            keyword_lower in file_name):         # In filename?
            keyword_matches += 1
            reasons.append(f"Keyword match: {keyword}")
    
    # Score based on how many matched
    if keyword_matches > 0:
        keyword_score = min(25, (keyword_matches / len(keywords)) * 25)
        total_score += keyword_score
```

### Real Example

**You create folder "Airtel Payments" with:**
```javascript
filter_rules: {
  content_type: ['invoice', 'receipt'],
  keywords: ['airtel', 'payment', 'jio']  ← Custom keywords
}
```

**Documents:**

| Document | filename | extracted_text | Keyword Matches |
|----------|----------|-----------------|-----------------|
| Doc A | `Airtel_Bill_Jan.pdf` | "Airtel Jio payment of ₹999" | 3/3 (airtel, payment, jio) |
| Doc B | `Receipt_Hotel.pdf` | "Hotel payment received" | 1/3 (payment) |
| Doc C | `Airtel_Customer_Care.pdf` | "Contact Airtel support" | 1/3 (airtel) |
| Doc D | `Notes.pdf` | "Meeting discussion about plans" | 0/3 (none) |

**Scoring:**

```
Doc A:
  Keywords found: ['airtel', 'payment', 'jio']
  Matches: 3 out of 3
  Score: (3/3) * 25 = 25 points → MATCH ✅

Doc B:
  Keywords found: ['payment']
  Matches: 1 out of 3
  Score: (1/3) * 25 = 8.33 points → Depends on other criteria

Doc C:
  Keywords found: ['airtel']
  Matches: 1 out of 3
  Score: (1/3) * 25 = 8.33 points → Depends on other criteria

Doc D:
  Keywords found: []
  Matches: 0 out of 3
  Score: 0 points → Will need other criteria to match
```

### How to Use It

**When creating Smart Folder:**
```
Folder Name: "Airtel Payments"
Content Type: ['invoice', 'receipt']
Keywords: ['airtel', 'payment', 'jio']  ← Put specific terms here
```

The system searches for these keywords in:
- **Document's extracted_text** (actual OCR/text content)
- **Document's filename**

If keywords appear → **Adds to score**

---

## Complete Scoring Example

### Scenario
You create folder "Bills & Payments" with:

```javascript
filter_rules: {
  content_type: ['invoice', 'receipt', 'bill'],
  keywords: ['payment', 'due', 'amount'],
  importance_score: { min: 0.5 },
  days_old: 30
}
```

### Document to Match
```
document = {
  file_name: "Airtel_Payment_Receipt.pdf",
  document_type: "airtel-payment-receipt",  // AI-detected by Gemini Vision
  extracted_text: "Receipt for payment of ₹999 for Airtel bill...",
  created_at: "2024-12-28",  // 1 day old
  insights: {
    importance_score: 0.7,
    document_type: "airtel-payment-receipt"
  }
}
```

### Matching Evaluation

```
┌─────────────────────────────────────────────┐
│        SCORING BREAKDOWN (Max 100 pts)      │
├─────────────────────────────────────────────┤
│ Content Type: 30 pts                        │
│   ✓ 'receipt' in 'airtel-payment-receipt'  │
│   → Matched! +30 points                    │
├─────────────────────────────────────────────┤
│ Keywords: 25 pts                            │
│   ✓ 'payment' found in text                │
│   ✓ 'amount' found in text                 │
│   ✓ 'due' NOT found                        │
│   → 2/3 keywords matched: (2/3)*25 = +16.7│
├─────────────────────────────────────────────┤
│ Importance: 25 pts                          │
│   ✓ 0.7 >= 0.5                             │
│   → Matched! +25 points                    │
├─────────────────────────────────────────────┤
│ Age: 20 pts                                 │
│   ✓ 1 day old <= 30 days                   │
│   → Matched! +20 points                    │
├─────────────────────────────────────────────┤
│ TOTAL: 30 + 16.7 + 25 + 20 = 91.7 pts     │
│ Confidence: 91.7 / 120 = 76.4%            │
│ Matches? YES (>= 30% threshold)            │
└─────────────────────────────────────────────┘
```

---

## Matching Threshold

```python
# Decision rule
confidence = (total_score / max_score) if max_score > 0 else 0
matches = confidence >= 0.3  # Require at least 30%
```

### Examples

| Scenario | Score | Max | Confidence | Matches? |
|----------|-------|-----|------------|----------|
| Only content_type matched | 30 | 100 | 30% | ✅ YES (borderline) |
| Content + keywords matched | 46.7 | 100 | 46.7% | ✅ YES |
| Only 1 keyword matched | 8.3 | 100 | 8.3% | ❌ NO |
| Content + keywords + importance | 71.7 | 120 | 59.7% | ✅ YES |
| Everything matched | 91.7 | 120 | 76.4% | ✅ YES |

---

## The 3-Level Matching Strategy

### Level 1: Content Type (Quick Check)
```
Does 'invoice' appear in document_type 'tax-invoice'?
Yes → MATCH (30 points max)
```

### Level 2: Text Keywords (Semantic Check)
```
Do words like 'airtel', 'payment', 'jio' appear in document text?
Yes → Adds points based on how many keywords found
```

### Level 3: Other Criteria (Fine-tuning)
```
Is importance score high enough?
Is document recent enough?
Add points if yes.
```

### Why This Order?
1. **Content Type first** → Fastest, most reliable (AI-detected)
2. **Text keywords second** → Good for semantic meaning
3. **Other criteria third** → Fine-tunes the match

---

## Visual Flow

```
Document Uploaded
      │
      ▼
┌─────────────────────────────────────┐
│ Does 'receipt' exist in document    │
│ type 'airtel-payment-receipt'?      │
└─────────────────────────────────────┘
      │ Yes (30 pts)
      ▼
┌─────────────────────────────────────┐
│ Do custom keywords exist in text?   │
│ ('airtel', 'payment', 'jio')        │
└─────────────────────────────────────┘
      │ Yes (16.7 pts)
      ▼
┌─────────────────────────────────────┐
│ Check other criteria                │
│ (importance, age, etc.)             │
└─────────────────────────────────────┘
      │ Yes (45 pts)
      ▼
    TOTAL: 91.7 pts
    Confidence: 76.4%
    ✅ MATCH - Add to folder!
```

---

## Summary Table

| Match Type | Where to Check | Code Line | Points | Use Case |
|-----------|---|---|---|---|
| **Secondary** | `document_type` field | 204-225 | 30 | Quick type-based matching |
| **Tertiary** | `extracted_text` + `filename` | 262-281 | 25 | Semantic keyword matching |
| Bonus | `importance_score` | 227-235 | 25 | Prioritize important docs |
| Bonus | Document age | 237-276 | 20 | Time-based organizing |

---

## Key Takeaway

Think of it like **email spam filters**:

1. **Primary:** Is it from the CEO? (Exact match)
2. **Secondary:** Does it mention "invoice" or "receipt"? (Content matching)
3. **Tertiary:** Does it mention "airtel", "payment", "bill"? (Keyword matching)
4. **Other:** Is it recent? Is it important? (Additional signals)

All signals combined determine if it goes in your "Bills & Payments" folder!
