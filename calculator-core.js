(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MySexCalculatorCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONDOM_STANDARD_SIZES_MM = Object.freeze([47, 49, 52, 54, 56, 58, 60, 64, 69, 72]);
  const CONDOM_MAX_GIRTH_MM = 172;

  function requireMeasurement(value, name, allowZero) {
    const numeric = Number(value);
    const minimum = allowZero ? 0 : Number.MIN_VALUE;
    if (!Number.isFinite(numeric) || numeric < minimum) {
      throw new TypeError(`${name} must be a finite ${allowZero ? 'non-negative' : 'positive'} number`);
    }
    return numeric;
  }

  function calculateGeometry(measurements) {
    if (!measurements || typeof measurements !== 'object') {
      throw new TypeError('measurements must be an object');
    }

    const lFlaccid = requireMeasurement(measurements.l_flaccid, 'l_flaccid', false);
    const gFlaccid = requireMeasurement(measurements.g_flaccid, 'g_flaccid', false);
    const lErect = requireMeasurement(measurements.l_erect, 'l_erect', false);
    const gErect = requireMeasurement(measurements.g_erect, 'g_erect', false);
    const fat = requireMeasurement(measurements.t_fat, 't_fat', true);

    const erectRadiusMm = gErect / (2 * Math.PI);
    const flaccidRadiusMm = gFlaccid / (2 * Math.PI);
    const erectVolumeCc = Math.PI * erectRadiusMm * erectRadiusMm * lErect / 1000;
    const flaccidVolumeCc = Math.PI * flaccidRadiusMm * flaccidRadiusMm * lFlaccid / 1000;
    const lengthGrowthDisplay = ((lErect - lFlaccid) / lFlaccid * 100).toFixed(1);
    const girthGrowthDisplay = ((gErect - gFlaccid) / gFlaccid * 100).toFixed(1);
    const bpelMm = lErect + fat;
    const fatRatioDisplay = ((fat / bpelMm) * 100).toFixed(1);

    return Object.freeze({
      diameterMm: gErect / Math.PI,
      erectVolumeCc,
      flaccidVolumeCc,
      bloodVolumeCc: erectVolumeCc - flaccidVolumeCc,
      volumeRatio: flaccidVolumeCc > 0 ? erectVolumeCc / flaccidVolumeCc : 1,
      bfpi: (lErect * gErect) / (lFlaccid * gFlaccid),
      lengthGrowthPercent: Number(lengthGrowthDisplay),
      lengthGrowthDisplay,
      girthGrowthPercent: Number(girthGrowthDisplay),
      girthGrowthDisplay,
      bpelMm,
      fatRatioPercent: Number(fatRatioDisplay),
      fatRatioDisplay,
    });
  }

  function getCondomSizeMatch(girthMm) {
    const numericGirthMm = requireMeasurement(girthMm, 'girthMm', false);
    const nominalWidthMm = numericGirthMm / 2.3;
    const minSizeMm = CONDOM_STANDARD_SIZES_MM[0];
    const maxSizeMm = CONDOM_STANDARD_SIZES_MM[CONDOM_STANDARD_SIZES_MM.length - 1];
    const isLargestAvailable = nominalWidthMm > maxSizeMm && numericGirthMm <= CONDOM_MAX_GIRTH_MM;
    const withinRange = nominalWidthMm >= minSizeMm && numericGirthMm <= CONDOM_MAX_GIRTH_MM;
    const closestSizeMm = withinRange
      ? CONDOM_STANDARD_SIZES_MM.reduce((previous, current) =>
        Math.abs(current - nominalWidthMm) < Math.abs(previous - nominalWidthMm) ? current : previous)
      : null;

    return Object.freeze({
      nominalWidthMm,
      minSizeMm,
      maxSizeMm,
      maxGirthMm: CONDOM_MAX_GIRTH_MM,
      withinRange,
      isLargestAvailable,
      closestSizeMm,
      displaySizeMm: withinRange ? closestSizeMm : nominalWidthMm,
    });
  }

  function normalCDF(z) {
    const numericZ = Number(z);
    if (!Number.isFinite(numericZ)) throw new TypeError('z must be a finite number');
    const t = 1 / (1 + 0.2316419 * Math.abs(numericZ));
    const d = 0.3989423 * Math.exp(-numericZ * numericZ / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return numericZ >= 0 ? 1 - p : p;
  }

  function calculatePercentiles(measurements, dataset) {
    if (!measurements || typeof measurements !== 'object') {
      throw new TypeError('measurements must be an object');
    }
    if (!dataset || typeof dataset !== 'object') {
      throw new TypeError('dataset must be an object');
    }

    const lErect = requireMeasurement(measurements.l_erect, 'l_erect', false);
    const gErect = requireMeasurement(measurements.g_erect, 'g_erect', false);
    const meanLengthMm = requireMeasurement(dataset.meanLengthMm, 'meanLengthMm', false);
    const sdLengthMm = requireMeasurement(dataset.sdLengthMm, 'sdLengthMm', false);
    const meanGirthMm = requireMeasurement(dataset.meanGirthMm, 'meanGirthMm', false);
    const sdGirthMm = requireMeasurement(dataset.sdGirthMm, 'sdGirthMm', false);
    const lengthZScore = (lErect - meanLengthMm) / sdLengthMm;
    const girthZScore = (gErect - meanGirthMm) / sdGirthMm;
    const lengthPercentile = Math.min(99.99, Math.max(0.01, normalCDF(lengthZScore) * 100));
    const girthPercentile = Math.min(99.99, Math.max(0.01, normalCDF(girthZScore) * 100));

    return Object.freeze({
      lengthZScore,
      girthZScore,
      lengthPercentile,
      girthPercentile,
      lengthTopPercent: 100 - lengthPercentile,
      girthTopPercent: 100 - girthPercentile,
      girthDifferenceMm: gErect - meanGirthMm,
    });
  }

  function classifyArchetype(measurements, bfpiValue) {
    if (!measurements || typeof measurements !== 'object') {
      throw new TypeError('measurements must be an object');
    }
    const lErect = requireMeasurement(measurements.l_erect, 'l_erect', false);
    const gErect = requireMeasurement(measurements.g_erect, 'g_erect', false);
    const bfpi = bfpiValue === undefined
      ? calculateGeometry(measurements).bfpi
      : requireMeasurement(bfpiValue, 'bfpi', false);

    let gaugePointerPercent;
    if (bfpi < 1.8) {
      const ratio = Math.max(0, Math.min(1, (bfpi - 1.0) / 0.8));
      gaugePointerPercent = ratio * 33.3;
    } else if (bfpi < 2.5) {
      const ratio = Math.max(0, Math.min(1, (bfpi - 1.8) / 0.7));
      gaugePointerPercent = 33.3 + (ratio * 33.3);
    } else {
      const ratio = Math.max(0, Math.min(1, (bfpi - 2.5) / 1.0));
      gaugePointerPercent = 66.6 + (ratio * 33.4);
    }

    const growthType = bfpi < 1.8 ? 'shower' : (bfpi < 2.5 ? 'hybrid' : 'grower');
    const lengthGirthRatio = lErect / gErect;
    const shapeType = lengthGirthRatio > 1.1 ? 'slim' : (lengthGirthRatio >= 0.85 ? 'balanced' : 'thick');

    return Object.freeze({
      bfpi,
      gaugePointerPercent,
      growthType,
      lengthGirthRatio,
      shapeType,
      archetypeKey: `${growthType}_${shapeType}`,
    });
  }

  return Object.freeze({
    CONDOM_STANDARD_SIZES_MM,
    CONDOM_MAX_GIRTH_MM,
    calculateGeometry,
    getCondomSizeMatch,
    normalCDF,
    calculatePercentiles,
    classifyArchetype,
  });
});
