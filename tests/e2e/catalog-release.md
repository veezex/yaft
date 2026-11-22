# Catalog release acceptance

The locked CCP snapshot 20261120T165826Z (build 3724492) was
imported and regenerated into the packaged starter catalog.
A current-source check reported identical table versions and hashes.
The Pyfa v2.70.0 check resolved the pinned commit, and the oracle
regenerated all seven stored numeric references.

The browser suite simulates two catalog releases with one build number.
It exercises a newer channel revision, rollback to the older release,
library retention across tabs, an invalid pointer, an incorrect artifact
SHA-256, interrupted downloads, incompatible rules, quota refusal, and
recovery after local catalog loss. The unit suite verifies that only one channel writer
can hold the publication lock.

The real candidate's effect-coverage audit reported 51 diagnostics.
The publish command rejected its blocked report. Two independently
verified production releases, a changed-rule shell rollout and the
24-hour and one-working-day timing criteria remain pending.
