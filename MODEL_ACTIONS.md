# Ninja Model Actions Reference

The following actions are available for the `ninja.glb` model. These names are case-sensitive but the `NinjaModel` component handles lowercase mapping.

## Standard Combat Actions
- **idle**: Loopable standing position.
- **block**: Defensive posture.
- **left_hit**: Attack animation for the left side.
- **right_hit**: Attack animation for the right side.
- **got_hit**: Reaction animation when receiving damage.

## Non-Combat/Status Actions
- **defeat**: Animation played upon losing a match.
- **bow**: Respectful gesture (taunt/intro).

## Usage in Code
When using the `NinjaModel` component, trigger these actions via the ref:

```javascript
ninjaRef.current.playAction('left_hit');
```
