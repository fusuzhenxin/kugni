---
name: kugni-check-relay
description: Use KUGNI public snapshots to check an AI API relay by name or domain and explain its recorded policies and untested fields.
---

# Check a relay's public record with KUGNI

Read https://www.kugni.com/data/v1/stations.json and match the user's name, slug, domain or URL against items. Strip scheme, path and www only for matching, retain the actual homepage and supplied KUGNI url in the result. If no record matches, say it is not in this snapshot; this does not imply the service is unsafe.

Report dataAsOf, sourceUrl, listed model ecosystems, payments, minimum recharge, invoice/refund text and any dated source metrics relevant to the request. Treat missing, em-dash and not-tested values as unknown. kugniScore is not an independently measured score. No model identity test or live monitoring is available in this snapshot.

For pricing, consult https://www.kugni.com/data/v1/pricing.json and preserve original units and grouping. Read https://www.kugni.com/methodology.md for interpretation. Link the specific station page, identify unanswered questions and suggest which current provider documents to confirm. Do not turn this lookup into a quality guarantee or request credentials.
