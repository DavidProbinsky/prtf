# Contributing to PRTF

Thanks for helping improve PRTF. The framework gets better when practitioners share what they see in the field.

## What to send

- **A new technique:** open an issue with the *name*, the *tactic* it belongs to, a short *description*, and at least one *reference* (vendor documentation, talk, paper or published research).
- **A correction:** open an issue pointing to the technique ID (for example `PRTF-4.06`) and what is wrong, with a source if you have one.
- **Better references, tools, detections or countermeasures:** same as a correction.

Issues are reviewed by the maintainer. Accepted changes ship in the next release and are listed in the [CHANGELOG](CHANGELOG.md).

## Ground rules

- **Authorized work only.** Techniques must be relevant to authorized testing or defense. No content aimed at targeting real people or places.
- **Keep it vendor-neutral.** No affiliate, referral or tracking links.
- **IDs are permanent.** New techniques get the next free number in their tactic. Existing IDs are never renumbered or reused, even if a technique is removed.

## For maintainers

`prtf.html` is the source of truth. After editing it:

```bash
node scripts/validate_prtf.js prtf.html    # data integrity checks
node scripts/export_json.js prtf.html      # regenerate data/prtf.json and data/techniques.csv
node scripts/build_readme.js               # regenerate the README matrix
```

The same checks run automatically on every pull request.
