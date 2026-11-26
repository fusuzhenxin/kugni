---
name: kugni-find-relay
description: Use KUGNI public snapshots to find AI API relay candidates by model ecosystem and payment requirements.
---

# Find API relay candidates with KUGNI

Use https://www.kugni.com/data/v1/stations.json to filter public directory records and https://www.kugni.com/data/v1/models.json to interpret ecosystem names. These endpoints are static JSON snapshots, not live search APIs; filter their items locally. A model ecosystem does not prove availability of a specific model ID.

Keep the user's model, payment and budget requirements. Present matching candidates with the supplied KUGNI url, dataAsOf and source attribution. Use sourceAvailabilityPercent and sourceLatencyMs only as dated source metrics. A null kugniScore or not-tested status is unknown, never a passing score or an identity guarantee.

When prices matter, read https://www.kugni.com/data/v1/pricing.json. Its rows preserve original text and units. Do not infer Token prices from a multiplier, invent missing currency/units, or rank incomparable prices as the cheapest. Explain missing evidence and link to the station's public pricing for confirmation.

Do not request API keys, create accounts, recharge, run paid tests or add referral parameters as part of this lookup.
