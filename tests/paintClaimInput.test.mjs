import assert from 'assert';
import { applyUIBindings } from '../scripts/uiBindings.js';

function createCanvasStub() {
    const listeners = {};
    return {
        listeners,
        addEventListener(event, handler) {
            listeners[event] = handler;
        }
    };
}

function testPaintClaimDragClaimsMultipleTilesWithoutCameraDrag() {
    const canvas = createCanvasStub();
    const claims = new Set();
    let resetCalls = 0;
    const game = {
        cam: { x: 0, y: 0, zoom: 1 },
        canvas,
        paintClaimMode: true,
        onPaint(x) {
            if (x < 20) claims.add('0,0');
            else if (x < 40) claims.add('1,0');
            else claims.add('2,0');
        },
        resetPaintClaimDrag() {
            resetCalls += 1;
        }
    };

    applyUIBindings(game);
    game.setupInput();

    canvas.listeners.pointerdown({ clientX: 5, clientY: 5 });
    canvas.listeners.pointermove({ clientX: 25, clientY: 5 });
    canvas.listeners.pointermove({ clientX: 45, clientY: 5 });
    canvas.listeners.pointerup({ clientX: 45, clientY: 5 });

    assert.strictEqual(claims.size, 3, 'paint-claim drag should visit multiple tiles while dragging');
    assert.deepStrictEqual(game.cam, { x: 0, y: 0, zoom: 1 }, 'camera should not drag while paint-claim is active');
    assert.strictEqual(resetCalls, 1, 'paint-claim drag should reset on pointerup');
}

function run() {
    testPaintClaimDragClaimsMultipleTilesWithoutCameraDrag();
    console.log('Paint-claim input tests passed.');
}

run();
