const fs = require('fs');
const vm = require('vm');

class FakeElement {
  constructor() {
    this.value = '';
    this.innerText = '';
    this.innerHTML = '';
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; },
    };
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) || null; }
  addEventListener() {}
  removeEventListener() {}
  appendChild() {}
  remove() {}
  click() {}
  focus() {}
  querySelector() { return new FakeElement(); }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { width: 400, height: 420, left: 0, top: 0 }; }
}

function loadCurrentCalculator() {
  const html = fs.readFileSync('index.html', 'utf8');
  const scriptStart = html.indexOf('<script>', html.indexOf('html2canvas'));
  const scriptEnd = html.indexOf('</script>', scriptStart);
  if (scriptStart < 0 || scriptEnd < 0) throw new Error('Main inline script not found');

  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  const documentElement = getElement('documentElement');
  documentElement.setAttribute('data-theme', 'light');

  const storage = new Map();
  const context = {
    console,
    location: { hostname: 'baseline.invalid', href: 'http://baseline.invalid/' },
    navigator: { userAgent: 'baseline-test', maxTouchPoints: 0 },
    document: {
      documentElement,
      activeElement: null,
      body: getElement('body'),
      getElementById: getElement,
      querySelector: () => new FakeElement(),
      querySelectorAll: () => [],
      createElement: () => new FakeElement(),
      addEventListener() {},
      removeEventListener() {},
      contains: () => true,
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    sessionStorage: {
      getItem: () => null,
      setItem() {},
      removeItem() {},
    },
    HTMLElement: FakeElement,
    File: class {},
    FileReader: class {},
    Image: class {},
    requestAnimationFrame: (callback) => { callback(0); return 1; },
    cancelAnimationFrame() {},
    setTimeout: () => 1,
    clearTimeout() {},
    fetch: () => Promise.resolve({ ok: true }),
    getComputedStyle: () => ({}),
    html2canvas: () => Promise.reject(new Error('not available in baseline test')),
  };
  context.window = context;
  context.window.scrollTo = () => {};
  context.window.addEventListener = () => {};
  context.window.removeEventListener = () => {};
  context.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

  vm.createContext(context);
  vm.runInContext(fs.readFileSync('calculator-core.js', 'utf8'), context, { filename: 'calculator-core.js' });
  vm.runInContext(html.slice(scriptStart + '<script>'.length, scriptEnd), context, { filename: 'index-inline.js' });
  return context;
}

const fixtures = [
  {
    name: 'known-large-global',
    region: 'global',
    measurements: { l_flaccid: 135, g_flaccid: 127, l_erect: 162, g_erect: 154, t_fat: 15 },
  },
  {
    name: 'balanced-zero-fat-thai',
    region: 'thai',
    measurements: { l_flaccid: 100, g_flaccid: 100, l_erect: 140, g_erect: 120, t_fat: 0 },
  },
  {
    name: 'compact-china',
    region: 'china',
    measurements: { l_flaccid: 80, g_flaccid: 90, l_erect: 120, g_erect: 105, t_fat: 5 },
  },
  {
    name: 'largest-condom-boundary-global',
    region: 'global',
    measurements: { l_flaccid: 135, g_flaccid: 127, l_erect: 170, g_erect: 172, t_fat: 15 },
  },
  {
    name: 'hybrid-slim-thai',
    region: 'thai',
    measurements: { l_flaccid: 80, g_flaccid: 90, l_erect: 144, g_erect: 120, t_fat: 10 },
  },
  {
    name: 'grower-thick-global',
    region: 'global',
    measurements: { l_flaccid: 60, g_flaccid: 70, l_erect: 110, g_erect: 150, t_fat: 20 },
  },
  {
    name: 'above-condom-range-global',
    region: 'global',
    measurements: { l_flaccid: 135, g_flaccid: 127, l_erect: 170, g_erect: 173, t_fat: 15 },
  },
];

const calculator = loadCurrentCalculator();
const snapshots = fixtures.map((fixture) => {
  const expression = `
    Object.assign(canonicalMeasurementsMm, ${JSON.stringify(fixture.measurements)});
    currentRegion = ${JSON.stringify(fixture.region)};
    calculate(false, false);
    JSON.stringify(latestMetricsSnapshot);
  `;
  const snapshot = JSON.parse(vm.runInContext(expression, calculator));
  const analytics = JSON.parse(vm.runInContext(
    `JSON.stringify(getMaleAnalyticsMetrics(${JSON.stringify(fixture.measurements)}))`,
    calculator,
  ));
  const payload = JSON.parse(vm.runInContext(
    `JSON.stringify(buildMaleAnalyticsPayload(${JSON.stringify(fixture.measurements)}, ${JSON.stringify(analytics)}, 'BASELINE_ARCHETYPE', ''))`,
    calculator,
  ));
  return { name: fixture.name, snapshot, analytics, payload };
});

const expectedSnapshots = JSON.parse(fs.readFileSync('tests/fixtures/calculation-baseline.json', 'utf8'));

function assertBaseline(actual, expected, path) {
  if (typeof expected === 'number') {
    const tolerance = 1e-10 * Math.max(1, Math.abs(expected));
    if (typeof actual !== 'number' || Math.abs(actual - expected) > tolerance) {
      throw new Error(`${path}: expected ${expected}, received ${actual}`);
    }
    return;
  }
  if (expected && typeof expected === 'object') {
    for (const key of Object.keys(expected)) {
      assertBaseline(actual?.[key], expected[key], `${path}.${key}`);
    }
    return;
  }
  if (actual !== expected) throw new Error(`${path}: expected ${expected}, received ${actual}`);
}

if (snapshots.length !== expectedSnapshots.length) {
  throw new Error(`Expected ${expectedSnapshots.length} fixtures, received ${snapshots.length}`);
}
for (const expected of expectedSnapshots) {
  const actual = snapshots.find((entry) => entry.name === expected.name);
  if (!actual) throw new Error(`Missing fixture: ${expected.name}`);
  assertBaseline(actual.snapshot, expected.snapshot, expected.name);
  assertBaseline(actual.analytics.bestSize, expected.snapshot.bestSize, `${expected.name}.analytics.bestSize`);
  assertBaseline(actual.analytics.bfpi, expected.snapshot.bfpi, `${expected.name}.analytics.bfpi`);
  assertBaseline(actual.analytics.erectVolumeCc, expected.snapshot.erectVolumeCc, `${expected.name}.analytics.erectVolumeCc`);
  assertBaseline(actual.analytics.growthType, expected.snapshot.archetypeKey.split('_')[0], `${expected.name}.analytics.growthType`);
  assertBaseline(actual.payload.condomSize, expected.snapshot.bestSize, `${expected.name}.payload.condomSize`);
  assertBaseline(actual.payload.bloodVolume, expected.snapshot.erectVolumeCc.toFixed(1), `${expected.name}.payload.bloodVolume`);
  assertBaseline(actual.payload.archetype, 'BASELINE_ARCHETYPE', `${expected.name}.payload.archetype`);
  assertBaseline(actual.payload.photoBase64, '', `${expected.name}.payload.photoBase64`);
  const expectedBfpiType = expected.snapshot.archetypeKey.startsWith('shower_')
    ? 'ควยเนื้อ'
    : (expected.snapshot.archetypeKey.startsWith('grower_') ? 'ควยเลือด' : 'Hybrid');
  assertBaseline(actual.payload.bfpiType, expectedBfpiType, `${expected.name}.payload.bfpiType`);
}

const geometryFields = [
  'diameterMm',
  'erectVolumeCc',
  'flaccidVolumeCc',
  'bloodVolumeCc',
  'volumeRatio',
  'bfpi',
  'lengthGrowthPercent',
  'girthGrowthPercent',
  'bpelMm',
  'fatRatioPercent',
];
for (const fixture of fixtures) {
  const expected = expectedSnapshots.find((entry) => entry.name === fixture.name).snapshot;
  const actual = calculator.MySexCalculatorCore.calculateGeometry(fixture.measurements);
  for (const field of geometryFields) {
    assertBaseline(actual[field], expected[field], `${fixture.name}.core.${field}`);
  }

  const condom = calculator.MySexCalculatorCore.getCondomSizeMatch(fixture.measurements.g_erect);
  assertBaseline(condom.displaySizeMm, expected.bestSize, `${fixture.name}.core.bestSize`);
  assertBaseline(condom.withinRange, expected.condomInRange, `${fixture.name}.core.condomInRange`);
  assertBaseline(condom.isLargestAvailable, expected.condomIsLargestAvailable, `${fixture.name}.core.condomIsLargestAvailable`);
  assertBaseline(condom.nominalWidthMm, expected.nominalWidthMm, `${fixture.name}.core.nominalWidthMm`);

  const regionDataset = JSON.parse(vm.runInContext(`JSON.stringify(REGION_DATASETS[${JSON.stringify(fixture.region)}])`, calculator));
  const percentiles = calculator.MySexCalculatorCore.calculatePercentiles(fixture.measurements, regionDataset);
  assertBaseline(percentiles.lengthPercentile, expected.lengthPercentile, `${fixture.name}.core.lengthPercentile`);
  assertBaseline(percentiles.girthPercentile, expected.girthPercentile, `${fixture.name}.core.girthPercentile`);

  const classification = calculator.MySexCalculatorCore.classifyArchetype(fixture.measurements, actual.bfpi);
  assertBaseline(classification.archetypeKey, expected.archetypeKey, `${fixture.name}.core.archetypeKey`);
  if (classification.gaugePointerPercent < 0 || classification.gaugePointerPercent > 100) {
    throw new Error(`${fixture.name}.core.gaugePointerPercent is outside 0–100`);
  }
}

assertBaseline(
  calculator.MySexCalculatorCore.classifyArchetype(fixtures[0].measurements, 1.8).growthType,
  'hybrid',
  'growth boundary 1.8',
);
assertBaseline(
  calculator.MySexCalculatorCore.classifyArchetype(fixtures[0].measurements, 2.5).growthType,
  'grower',
  'growth boundary 2.5',
);

console.log(`Calculation baseline + extracted core: PASS (${snapshots.length} fixtures)`);
