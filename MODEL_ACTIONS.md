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

## Webcam gesture hints (local detection)

Detection uses MediaPipe pose (shoulders, elbows, wrists, nose). **Face the camera** for the intended “arcade” mode.

| Motion | What to do |
|--------|------------|
| **Block** | Hands up in a guard **in front of your face** (both wrists close to the nose in the image). Elbows usually **bent**; not a full straight-arm punch toward the lens. |
| **Left hit** | **Left arm** (your real left — may look flipped on a mirrored preview) throws a **jab/cross**: extend, quick snap, fist path farther **left** of the nose than the other hand (`Strike nose` / dominance helps side-by-side). |
| **Right hit** | Same with the **right** arm — that side’s wrist stays farther from the nose than the other at impact. |

If left/right feel **swapped**, enable **“Swap Left/Right hit labels”** in Camera Test (selfie mirror). If **jabs still read as BLOCK**, lower **Block max ext** slightly or raise **Fwd punch Z**; if **BLOCK rarely triggers**, keep **Block max ext** at the far right (**off**) and widen **Block Nose** a little.
