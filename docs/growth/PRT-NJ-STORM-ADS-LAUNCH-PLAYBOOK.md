# PRT | New Jersey storm-response Google Ads — launch playbook
Status: PREPARED, NOT CONNECTED, NOT LIVE. 2026-10-16.
Owner approval required before spending money. Keep the campaign PAUSED until Google policy approval, verified calls, geographic scope, weather relevance, and a spending cap are confirmed.

## Objective and signal
Promote real storm-related roofing repair and emergency roof leak assessment for Perfect Roofing Team LLC. The primary source is **free** NWS alerts: https://api.weather.gov/alerts/active?area=NJ. Optionally verify county-specific hourly forecasts via NWS /points and /forecast/hourly. Only trigger a recommendation for local high-wind, severe thunderstorm, tropical storm, hurricane, or similar roof-relevant impacts affecting verified serviced counties (Bergen, Hudson, Passaic, Sussex). A statewide alert alone is insufficient to target every NJ county. A non-roof-relevant alert, old alert, cancelled alert or no alert MUST NOT activate ads. Heavy rain can warrant checking forecasts but is not proof of damage. Never pretend a storm caused damage at a specific home.

## Operator sequence
1. Check NWS event, effective/expires, severity, certainty and counties. Store URL and checked-at time. Fail closed on NWS outage or unknown geography.
2. Confirm PRT is taking calls, has storm-repair capacity and works in affected county; verify the live destination, real service availability and call-forwarding. GBP button clicks are not phone conversations.
3. Use an already-reviewed, approved Google Search campaign in PAUSED state. Do not create at storm onset: Google normally reviews ads within one business day, sometimes longer. Never enable an unreviewed or disapproved ad.
4. Show operator weather signal, counties, proposed spending cap, start/end dates, call destination and expected landing page. Require explicit spend/activation authorization and use the connected account's campaign enable action only after all checks.
5. Pause when NWS event expires, capacity closes, calls fail, operator cancels, or spending cap/time window is reached. Monitor search terms and costs during operation. Never assume an enable request succeeded without readback.
6. Report paid impressions/clicks/cost separately from call connection, qualified quote, won jobs and organic GSC.

## Campaign design — draft only
Type: Google Search; objective: verified leads, not clicks alone. Target only actual affected service-area counties; use presence-in-location rather than generalized interest targeting where Google supports it. Language English. Initial campaign state PAUSED.
Ad group A: Storm damage roof inspection / repair (only if PRT confirms service).
Ad group B: Emergency roof leak repair (only if staffed for emergency calls).
Example exact/phrase keywords (verify local search terms before launch): "storm damage roof repair", "roof leak repair near me", "emergency roof repair nj", "wind damaged roof repair", "roofing contractor bergen county", "roof leak repair hudson county".
Negatives to review: jobs, salary, diy, free training, roofing school, wholesale, materials, car roof, fake, kit.
Do NOT block legitimate insurance queries automatically; separate insurance help from any unverified coverage promise.

### Responsive Search Ad draft headlines (short, non-sensational)
- Storm Damage Roof Repair
- Roof Leak Repair in NJ
- Emergency Roof Repair NJ
- Bergen County Roof Repair
- Hudson County Roof Repair
- Local Roofing Contractor
- Roofing Help After High Winds
- Request a Roof Inspection
- Speak With Our Roofing Team
- Perfect Roofing Team LLC

### Draft descriptions
- Roof leak or storm-related roofing concerns in NJ? Contact Perfect Roofing Team to discuss inspection and repair options.
- High winds or heavy rain affected your roof? Ask our team about availability in your New Jersey county.
- Need help with a roof leak? Describe your roofing issue and request the next available appointment.

Destination (confirm mobile URL, call button, tracking and landing-page consistency):
https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/
Call number from latest verified GBP checkpoint: (862) 238-6353; re-verify actual routing and staffing before launch.
Counties in checkpoint: Bergen, Hudson, Passaic, Sussex. Never assume service beyond those counties from a statewide storm watch.

## Budget/measurement guardrails
Budget: UNSET — requires business owner's authorization, Google Ads account/currency, campaign daily limit and an overall storm-event cap; do not invent or silently spend a budget. Timebox initial experiment and set a manual stop. Verify Google Ads conversion events for connected calls and qualified leads, distinguish ad clicks, phone-button clicks, answered calls, appointments and won projects. Campaign may get clicks and zero real leads.
Provider dependencies: NWS forecast/alerts free; paid weather feeds and third-party SERP providers NOT required. An active Google Ads account and advertising costs ARE required to actually run the campaign. No ads launched in this document.
