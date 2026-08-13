# Frozen engine snapshot

- Source: `zemeng5208/winbridge-recovery`, commit `42262f1b0d34f12a07d8b3ea187ffe41498e9f85`.
- Version asserted by the source entrypoint: 3.1.1.
- License: MIT. The copied `LICENSE` and `LEGAL-NOTICE.md` remain beside the snapshot.
- Runtime rule: verify every declared SHA-256, copy declared files to an application-data session, generate only session-local configuration, then invoke the copied entrypoint.
- The adapter never executes or modifies the snapshot in place and never writes back to the source repository.
- This wrapper does not reorder or replace backup, write, registration, rollback, or final-verification steps inside the frozen core.

`DiagnoseOnly` remains an external engine contract, not an assumption that every helper is intrinsically read-only. In particular, the copied pointer helper is invoked with `-VerifyOnly`; its verified branch exits before junction staging or replacement. No real diagnosis or repair was executed while producing this snapshot.
