import assert from 'node:assert/strict';
import {keyboardRevealOffset as reveal} from '../utils/keyboardRevealOffset.ts';
// Overlay keyboard on unfolded/edge-to-edge Android: field must move above it.
assert.equal(reveal(0,920,1100,650),294);
// Android already resized its viewport: use the smaller visible boundary.
assert.equal(reveal(100,760,600,650),284);
// Already visible: no jump, and don't undo the user's current scroll position.
assert.equal(reveal(200,500,600,650),200);
// Keyboard changes size (toolbar, folded display); recompute actual overlap.
assert.equal(reveal(200,580,900,520),284);
// Boundary includes breathing room for the whole input, not just its baseline.
assert.equal(reveal(0,650,1000,650),24);
console.log('PPE keyboard: overlay, resize, visible field, changed height and input clearance passed.');
