import assert from 'assert';
import ImperialMandateCalendar, {
    initImperialMandateCalendar,
    createImperialMandateCalendar
} from '../scripts/mandates/imperialMandateCalendar.js';
import ImperialMandateManager, {
    initImperialMandateManager,
    createImperialMandateManager
} from '../scripts/mandates/imperialMandateManager.js';
import ImperialMandateUIAdapter, {
    initImperialMandatesAdapter,
    createImperialMandateUIAdapter
} from '../scripts/mandates/imperialMandatesAdapter.js';
import createImperialMandates, { initImperialMandatesCore } from '../scripts/mandates/imperialMandatesCore.js';

function testCalendarExports() {
    assert.strictEqual(
        ImperialMandateCalendar.initImperialMandateCalendar,
        initImperialMandateCalendar,
        'calendar default export should expose init helper'
    );
    assert.strictEqual(
        ImperialMandateCalendar.createImperialMandateCalendar,
        createImperialMandateCalendar,
        'calendar default export should expose factory helper'
    );
}

function testManagerExports() {
    assert.strictEqual(
        ImperialMandateManager.initImperialMandateManager,
        initImperialMandateManager,
        'manager default export should expose init helper'
    );
    assert.strictEqual(
        ImperialMandateManager.createImperialMandateManager,
        createImperialMandateManager,
        'manager default export should expose factory helper'
    );
}

function testAdapterExports() {
    assert.strictEqual(
        ImperialMandateUIAdapter.initImperialMandatesAdapter,
        initImperialMandatesAdapter,
        'adapter default export should expose init helper'
    );
    assert.strictEqual(
        ImperialMandateUIAdapter.createImperialMandateUIAdapter,
        createImperialMandateUIAdapter,
        'adapter default export should expose factory helper'
    );
}

function testCoreExports() {
    assert.strictEqual(
        createImperialMandates.initImperialMandatesCore,
        initImperialMandatesCore,
        'core factory should expose init helper'
    );
}

function run() {
    testCalendarExports();
    testManagerExports();
    testAdapterExports();
    testCoreExports();
    console.log('Imperial mandate module export tests passed.');
}

run();
