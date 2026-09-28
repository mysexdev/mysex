    let currentUnit = 'cm';
    let currentRegion = 'global';
    let currentTheme = 'light';

    const REGION_DATASETS = Object.freeze({
      global: Object.freeze({
        buttonId: 'regGlobal',
        meanLengthMm: 131.2,
        sdLengthMm: 16.6,
        meanGirthMm: 116.6,
        sdGirthMm: 11.0,
        regionName: 'ชายทั่วโลก',
        subText: '🌐 ข้อมูลรวมหลายประเทศ · Veale 2015',
        sourceText: 'กำลังใช้ข้อมูลโลก · Veale 2015',
        passportLabel: '🌐 เปอร์เซ็นต์ไทล์โลก',
        exportIcon: '🌐'
      }),
      china: Object.freeze({
        buttonId: 'regChina',
        meanLengthMm: 124.2,
        sdLengthMm: 16.3,
        meanGirthMm: 107.5,
        sdGirthMm: 13.4,
        regionName: 'ชายจีน',
        subText: '🇨🇳 ข้อมูลประชากรจีน · Wang 2025',
        sourceText: 'กำลังใช้ข้อมูลจีน · Wang 2025',
        passportLabel: '🇨🇳 เปอร์เซ็นต์ไทล์จีน',
        exportIcon: '🇨🇳'
      }),
      thai: Object.freeze({
        buttonId: 'regThai',
        meanLengthMm: 125.0,
        sdLengthMm: 14.0,
        meanGirthMm: 112.0,
        sdGirthMm: 10.0,
        regionName: 'โมเดลไทย · BETA',
        subText: '🇹🇭 ค่าประมาณภายใน · MYSEX BETA',
        sourceText: 'กำลังใช้ค่าประมาณภายใน · MYSEX BETA',
        passportLabel: '🇹🇭 เปอร์เซ็นต์ไทล์ไทย · BETA',
        exportIcon: '🇹🇭'
      })
    });

    const MEASUREMENT_IDS = ['l_flaccid', 'g_flaccid', 'l_erect', 'g_erect', 't_fat'];
    const MEASUREMENT_RULES_MM = Object.freeze({
      l_flaccid: { min: 1, max: 500, label: 'ความยาวตอนอ่อนตัว' },
      g_flaccid: { min: 1, max: 500, label: 'รอบวงตอนอ่อนตัว' },
      l_erect: { min: 1, max: 500, label: 'ความยาวตอนแข็งตัว' },
      g_erect: { min: 1, max: 500, label: 'รอบวงตอนแข็งตัว' },
      t_fat: { min: 0, max: 200, label: 'ชั้นไขมันบริเวณโคน' }
    });
    const VALIDATION_EPSILON_MM = 1e-9;
    const DEFAULT_MEASUREMENTS_MM = Object.freeze({
      l_flaccid: null,
      g_flaccid: null,
      l_erect: null,
      g_erect: null,
      t_fat: null
    });
    const canonicalMeasurementsMm = { ...DEFAULT_MEASUREMENTS_MM };
    const lastRenderedInputValues = Object.create(null);
    let latestMetricsSnapshot = null;
    const LOCAL_TEST_MEASUREMENTS_KEY = 'mysex_local_test_measurements_v1';

    function isLocalTestHost() {
      return location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    }

    function saveLocalTestMeasurements() {
      if (!isLocalTestHost()) return false;
      try {
        const values = MEASUREMENT_IDS.reduce((saved, id) => {
          saved[id] = document.getElementById(id)?.value ?? '';
          return saved;
        }, {});
        const canonicalMm = MEASUREMENT_IDS.reduce((saved, id) => {
          if (values[id].trim() && Number.isFinite(canonicalMeasurementsMm[id])) {
            saved[id] = canonicalMeasurementsMm[id];
          }
          return saved;
        }, {});
        localStorage.setItem(LOCAL_TEST_MEASUREMENTS_KEY, JSON.stringify({ unit: currentUnit, values, canonicalMm }));
        return true;
      } catch {
        return false;
      }
    }

    function restoreLocalTestMeasurements() {
      if (!isLocalTestHost()) return false;
      try {
        const saved = JSON.parse(localStorage.getItem(LOCAL_TEST_MEASUREMENTS_KEY) || 'null');
        if (!saved?.values || !['cm', 'in'].includes(saved.unit)) return false;

        currentUnit = saved.unit;
        MEASUREMENT_IDS.forEach(id => {
          const input = document.getElementById(id);
          if (!input) return;
          if (Number.isFinite(saved.canonicalMm?.[id])) {
            canonicalMeasurementsMm[id] = saved.canonicalMm[id];
            input.value = formatMeasurementForDisplay(id, currentUnit);
            lastRenderedInputValues[id] = input.value.trim();
          } else {
            input.value = typeof saved.values[id] === 'string' ? saved.values[id] : '';
          }
        });
        document.querySelectorAll('.unit-btn').forEach(button => button.classList.remove('active'));
        document.getElementById(`u_${currentUnit}`)?.classList.add('active');
        ['unit_l1', 'unit_g1', 'unit_l2', 'unit_g2', 'unit_tfat'].forEach(id => {
          const unit = document.getElementById(id);
          if (unit) unit.innerText = currentUnit;
        });
        updateValidationConstraints();

        const populatedIds = MEASUREMENT_IDS.filter(id => document.getElementById(id)?.value.trim());
        const populatedResult = readAndValidateMeasurements({ ids: populatedIds });
        if (populatedResult.valid) syncChangedMeasurementsFromInputs(populatedResult, populatedIds);
        if (readAndValidateMeasurements().valid) calculate(false, false);
        return populatedIds.length > 0;
      } catch {
        return false;
      }
    }

    function getScaleToMmForUnit(unit) {
      return unit === 'cm' ? 10 : (unit === 'in' ? 25.4 : 1);
    }

    function getScaleToMm() {
      return getScaleToMmForUnit(currentUnit);
    }

    function getUnitDecimals(unit = currentUnit) {
      return unit === 'in' ? 4 : (unit === 'cm' ? 2 : 1);
    }

    function formatLimitFromMm(valueMm, edge = 'nearest') {
      const decimals = getUnitDecimals();
      const factor = 10 ** decimals;
      const converted = valueMm / getScaleToMm();
      const rounded = edge === 'min'
        ? Math.ceil(converted * factor) / factor
        : (edge === 'max' ? Math.floor(converted * factor) / factor : converted);
      return rounded.toFixed(decimals);
    }

    function formatMetricNumber(value, maxDecimals = 1) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return '—';
      const roundedValue = Number(numericValue.toFixed(maxDecimals));
      return String(Object.is(roundedValue, -0) ? 0 : roundedValue);
    }

    function formatMm(value, maxDecimals = 1) {
      return `${formatMetricNumber(value, maxDecimals)} มม.`;
    }

    function formatSignedMm(value, maxDecimals = 1) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return '—';
      const sign = numericValue > 0 ? '+' : '';
      return `${sign}${formatMetricNumber(numericValue, maxDecimals)} มม.`;
    }

    const CONDOM_STANDARD_SIZES_MM = MySexCalculatorCore.CONDOM_STANDARD_SIZES_MM;
    const CONDOM_MAX_GIRTH_MM = MySexCalculatorCore.CONDOM_MAX_GIRTH_MM;

    function getCondomSizeMatch(girthMm) {
      return MySexCalculatorCore.getCondomSizeMatch(girthMm);
    }

    function getCanonicalMeasurements(ids = MEASUREMENT_IDS) {
      return ids.reduce((values, id) => {
        values[id] = canonicalMeasurementsMm[id];
        return values;
      }, {});
    }

    function syncChangedMeasurementsFromInputs(result, ids = MEASUREMENT_IDS) {
      if (!result?.valid) return false;
      ids.forEach((id) => {
        const input = document.getElementById(id);
        if (!input || !Object.prototype.hasOwnProperty.call(result.values, id)) return;
        const raw = input.value.trim();
        if (lastRenderedInputValues[id] !== raw) {
          canonicalMeasurementsMm[id] = result.values[id];
          lastRenderedInputValues[id] = raw;
        }
      });
      return true;
    }

    function formatMeasurementForDisplay(id, unit = currentUnit) {
      const valueMm = canonicalMeasurementsMm[id];
      if (valueMm === null || !Number.isFinite(Number(valueMm))) return '';
      const rule = MEASUREMENT_RULES_MM[id];
      const scaleToMm = getScaleToMmForUnit(unit);
      const converted = valueMm / scaleToMm;
      const roundedValue = Number(converted.toFixed(1));
      const roundedMm = roundedValue * scaleToMm;
      const roundedWouldBeInvalid = roundedMm < rule.min - VALIDATION_EPSILON_MM
        || roundedMm > rule.max + VALIDATION_EPSILON_MM;
      return roundedWouldBeInvalid
        ? converted.toFixed(getUnitDecimals(unit))
        : converted.toFixed(1);
    }

    function renderMeasurementInputsFromCanonical(ids = MEASUREMENT_IDS) {
      ids.forEach((id) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.value = formatMeasurementForDisplay(id);
        lastRenderedInputValues[id] = input.value.trim();
        if (input.hasAttribute('aria-invalid')) setFieldValidity(id);
      });
    }

    function setFieldValidity(id, message = '') {
      const input = document.getElementById(id);
      const error = document.getElementById(`${id}_error`);
      const invalid = Boolean(message);
      if (input) {
        input.classList.toggle('is-invalid', invalid);
        input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      }
      if (error) error.textContent = message;
    }

    function readAndValidateMeasurements({ ids = MEASUREMENT_IDS, showErrors = false } = {}) {
      const scaleToMm = getScaleToMm();
      const values = {};
      let valid = true;
      let firstInvalid = null;

      ids.forEach((id) => {
        const input = document.getElementById(id);
        const rule = MEASUREMENT_RULES_MM[id];
        const raw = input ? input.value.trim() : '';
        const numeric = raw === '' ? NaN : Number(raw);
        const valueMm = numeric * scaleToMm;
        let message = '';

        if (!Number.isFinite(numeric) || !Number.isFinite(valueMm)) {
          message = `กรุณากรอก${rule.label}เป็นตัวเลข`;
        } else if (valueMm < rule.min - VALIDATION_EPSILON_MM || valueMm > rule.max + VALIDATION_EPSILON_MM) {
          message = `กรอกได้ตั้งแต่ ${formatLimitFromMm(rule.min, 'min')}–${formatLimitFromMm(rule.max, 'max')} ${currentUnit}`;
        } else {
          values[id] = valueMm;
        }

        if (message) {
          valid = false;
          if (!firstInvalid) firstInvalid = id;
        }

        if (showErrors || input?.getAttribute('aria-invalid') === 'true') {
          setFieldValidity(id, message);
        }
      });

      return { valid, firstInvalid, values };
    }

    function updateMeasurementWarning(values = null) {
      const issues = [];
      if (values?.l_erect < values?.l_flaccid) issues.push('ความยาวตอนแข็งตัวต่ำกว่าตอนอ่อนตัว');
      if (values?.g_erect < values?.g_flaccid) issues.push('รอบวงตอนแข็งตัวต่ำกว่าตอนอ่อนตัว');
      const message = issues.length
        ? `⚠️ ${issues.join(' และ ')} กรุณาตรวจหน่วยและวิธีวัดอีกครั้ง ระบบยังคำนวณต่อได้`
        : '';

      ['measurementWarning', 'measurementWarningResult'].forEach((id) => {
        const warning = document.getElementById(id);
        if (!warning) return;
        warning.textContent = message;
        warning.hidden = !message;
      });
    }

    function validateMeasurementField(id) {
      const fieldResult = readAndValidateMeasurements({ ids: [id], showErrors: true });
      if (fieldResult.valid) syncChangedMeasurementsFromInputs(fieldResult, [id]);
      const allMeasurements = readAndValidateMeasurements();
      updateMeasurementWarning(allMeasurements.valid ? getCanonicalMeasurements() : null);
    }

    function handleMeasurementInput(id) {
      const fieldResult = readAndValidateMeasurements({ ids: [id] });
      if (fieldResult.valid) syncChangedMeasurementsFromInputs(fieldResult, [id]);
      saveLocalTestMeasurements();

      const allMeasurements = readAndValidateMeasurements();
      updateMeasurementWarning(allMeasurements.valid ? getCanonicalMeasurements() : null);
      if (!allMeasurements.valid) return false;

      calculate(false, false);
      if (id === 'g_erect') updateCondomMatchView();
      return true;
    }

    function focusInvalidMeasurement(id) {
      if (!id) return;
      const targetStep = id === 'l_flaccid' || id === 'g_flaccid' ? 1 : 2;
      goToStep(targetStep, false);
      document.getElementById(id)?.focus();
    }

    function validateMeasurementsForAction({ onInvalid = null } = {}) {
      const result = readAndValidateMeasurements({ showErrors: true });
      if (result.valid) syncChangedMeasurementsFromInputs(result);
      updateMeasurementWarning(result.valid ? getCanonicalMeasurements() : null);
      if (!result.valid) {
        if (typeof onInvalid === 'function') onInvalid();
        focusInvalidMeasurement(result.firstInvalid);
      }
      return result;
    }

    function updateValidationConstraints() {
      MEASUREMENT_IDS.forEach((id) => {
        const input = document.getElementById(id);
        const rule = MEASUREMENT_RULES_MM[id];
        if (!input) return;
        input.min = String(rule.min / getScaleToMm());
        input.max = String(rule.max / getScaleToMm());
        input.step = 'any';
      });
    }

    // ============================================================
    // ANONYMOUS ANALYTICS WEBHOOK INTEGRATION (SESSION UPSERT)
    // ============================================================
    const ANALYTICS_URL = "https://script.google.com/macros/s/AKfycbyWXF1m27L--GD3GJz_5nAxx9Q9Ev_hl6VGgDA7wmeR32Jduf75u1zo3u7Mnxvn4E6w/exec";
    const _sessionId = 'm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    let _analyticsTimer = null;
    let _lastSentSignature = '';
    let _lastSentTime = 0;

    function getMaleAnalyticsMetrics(measurements) {
      const snapshotMatches = latestMetricsSnapshot?.measurements
        && MEASUREMENT_IDS.every(id => latestMetricsSnapshot.measurements[id] === measurements[id]);
      if (snapshotMatches) {
        return Object.freeze({
          bestSize: latestMetricsSnapshot.bestSize,
          bfpi: latestMetricsSnapshot.bfpi,
          growthType: latestMetricsSnapshot.archetypeKey.split('_')[0],
          erectVolumeCc: latestMetricsSnapshot.erectVolumeCc
        });
      }

      const geometry = MySexCalculatorCore.calculateGeometry(measurements);
      const condomMatch = MySexCalculatorCore.getCondomSizeMatch(measurements.g_erect);
      const classification = MySexCalculatorCore.classifyArchetype(measurements, geometry.bfpi);
      return Object.freeze({
        bestSize: condomMatch.displaySizeMm,
        bfpi: geometry.bfpi,
        growthType: classification.growthType,
        erectVolumeCc: geometry.erectVolumeCc
      });
    }

    function buildMaleAnalyticsPayload(measurements, analyticsMetrics, archetypeName, photoBase64) {
      return {
        mode: 'male',
        sessionId: _sessionId,
        erectLength: measurements.l_erect.toFixed(1),
        erectGirth: measurements.g_erect.toFixed(1),
        flaccidLength: measurements.l_flaccid.toFixed(1),
        flaccidGirth: measurements.g_flaccid.toFixed(1),
        fat: measurements.t_fat.toFixed(1),
        condomSize: analyticsMetrics.bestSize,
        bfpiType: analyticsMetrics.growthType === 'shower' ? 'ควยเนื้อ' : (analyticsMetrics.growthType === 'grower' ? 'ควยเลือด' : 'Hybrid'),
        archetype: archetypeName,
        bloodVolume: analyticsMetrics.erectVolumeCc.toFixed(1),
        vaginalResting: '',
        vaginalExpanded: '',
        labiaAsym: '',
        cervicalImpact: '',
        score: '',
        photoBase64: photoBase64
      };
    }

    function sendAnonymousAnalytics(force = false, delay = 3000) {
      clearTimeout(_analyticsTimer);
      _analyticsTimer = setTimeout(() => {
        try {
          const measurementResult = readAndValidateMeasurements();
          if (!measurementResult.valid) {
            updateMeasurementWarning(null);
            return;
          }
          syncChangedMeasurementsFromInputs(measurementResult);
          const measurements = getCanonicalMeasurements();
          const { l_flaccid, g_flaccid, l_erect, g_erect, t_fat } = measurements;
          updateMeasurementWarning(measurements);
          const analyticsMetrics = getMaleAnalyticsMetrics(measurements);

          let photoImg = document.getElementById('passportImgView');
          let photoBase64 = "";
          if (_userPhotoUploaded && photoImg && photoImg.src && photoImg.src.startsWith('data:image')) {
            photoBase64 = photoImg.src;
          }

          let archTitleElem = document.getElementById('resArchetypeTitle');
          let archName = archTitleElem ? archTitleElem.innerText.trim() : '';

          const payload = buildMaleAnalyticsPayload(measurements, analyticsMetrics, archName, photoBase64);

          const now = Date.now();
          const signature = `male_${l_erect.toFixed(1)}_${g_erect.toFixed(1)}_${l_flaccid.toFixed(1)}_${g_flaccid.toFixed(1)}_${t_fat.toFixed(1)}_${Boolean(photoBase64)}_${photoBase64 ? photoBase64.length : 0}`;
          if (_lastSentSignature === signature && (now - _lastSentTime) < 60000) {
            return;
          }
          _lastSentSignature = signature;
          _lastSentTime = now;

          void fetch(ANALYTICS_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          }).catch(() => {});
        } catch {}
      }, force ? (delay || 100) : 3500);
    }

    // ACCURATE NORMAL CUMULATIVE DISTRIBUTION FUNCTION (CDF)
    function normalCDF(z) {
      return MySexCalculatorCore.normalCDF(z);
    }

    function triggerPulseAnimation() {
      const cards = ['cardDeltaL', 'cardDeltaG', 'cardBloodVol', 'cardLenRank', 'cardGirthRank', 'cardFatPercent'];
      cards.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.remove('updated');
          void el.offsetWidth; // trigger reflow
          el.classList.add('updated');
        }
      });
    }

    function toggleTheme() {
      currentTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', currentTheme);
      document.getElementById('themeIcon').innerText = currentTheme === 'light' ? '☀️' : '🌙';
      document.getElementById('themeText').innerText = currentTheme === 'light' ? 'ธีมสว่าง' : 'ธีมมืด';
      if (readAndValidateMeasurements().valid) calculate(false, false);
    }

    function setUnit(unit) {
      if (!['cm', 'in'].includes(unit)) return false;
      if (unit === currentUnit) return true;

      const populatedIds = MEASUREMENT_IDS.filter(id => document.getElementById(id)?.value.trim());
      const currentValidation = readAndValidateMeasurements({ ids: populatedIds, showErrors: true });
      if (!currentValidation.valid) {
        focusInvalidMeasurement(currentValidation.firstInvalid);
        return false;
      }
      syncChangedMeasurementsFromInputs(currentValidation, populatedIds);

      currentUnit = unit;
      document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(`u_${unit}`)?.classList.add('active');
      renderMeasurementInputsFromCanonical(populatedIds);
      MEASUREMENT_IDS.filter(id => !populatedIds.includes(id)).forEach(id => setFieldValidity(id));

      ['unit_l1', 'unit_g1', 'unit_l2', 'unit_g2', 'unit_tfat'].forEach(id => {
        document.getElementById(id).innerText = unit;
      });

      updateValidationConstraints();
      if (readAndValidateMeasurements().valid) calculate(false, false);
      updateCondomMatchView();
      saveLocalTestMeasurements();
      triggerPulseAnimation();
      return true;
    }

    function switchRegion(region) {
      const dataset = REGION_DATASETS[region];
      if (!dataset) return false;

      currentRegion = region;
      document.querySelectorAll('.region-btn').forEach(button => button.classList.remove('active'));
      document.getElementById(dataset.buttonId)?.classList.add('active');

      const subText = document.getElementById('regionSubText');
      const sourceText = document.getElementById('regionSourceText');
      if (subText) subText.innerText = dataset.subText;
      if (sourceText) sourceText.innerText = dataset.sourceText;

      if (readAndValidateMeasurements().valid) calculate(false, false);
      triggerPulseAnimation();
      return true;
    }

    function toggleCondomTooltip(e) {
      if (e) e.stopPropagation();
      const tooltip = document.getElementById('condomTooltip');
      const trigger = document.getElementById('cardCondom');
      const isOpen = tooltip.classList.toggle('show');
      trigger?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    document.addEventListener('click', () => {
      document.getElementById('condomTooltip').classList.remove('show');
      document.getElementById('cardCondom')?.setAttribute('aria-expanded', 'false');
    });


    let currentAppMode = 'analysis'; // 'analysis' | 'condom'
    let quickCondomGirthMm = 120;

    // Thai-market audit: show one main size, then no more than three products.
    // Each product label keeps its actual nominal width even when it is only
    // a nearby option for the recommended main size.
    const CONDOM_BRANDS_DB = Object.freeze({
      47: Object.freeze([
        { label: 'MY.SIZE pro 47 · 47 มม.', source: 'https://www.ibodythailand.com/product/2671/my-size%C2%AE-pro-natural-rubber-latex-condoms-size-47-mm-%E0%B8%96%E0%B8%B8%E0%B8%87%E0%B8%A2%E0%B8%B2%E0%B8%87%E0%B8%AD%E0%B8%99%E0%B8%B2%E0%B8%A1%E0%B8%B1%E0%B8%A2-%E0%B8%82%E0%B8%99%E0%B8%B2%E0%B8%94-47-%E0%B8%A1%E0%B8%A1' }
      ]),
      49: Object.freeze([
        { label: 'Durex Kingtex · 49 มม.', source: 'https://www.watsons.co.th/en/durex-durex-kingtex-condom-49-mm.-12-pcs-x-4/p/BP_305916' },
        { label: 'OneTouch 49 · 49 มม.', source: 'https://www.watsons.co.th/en/health/condom/c/050601' },
        { label: 'Okamoto Suprema Lite · 49 มม.', source: 'https://www.bigc.co.th/product/okamoto-condom-suprema-lite-smooth-surface-49-mm-x-2-units.62438' }
      ]),
      52: Object.freeze([
        { label: 'Durex Airy · 52 มม.', source: 'https://www.watsons.co.th/en/durex-durex-airy-condom-52-mm.-pack-16-pcs./p/BP_312250' },
        { label: 'OneTouch 52 · 52 มม.', source: 'https://www.watsons.co.th/en/health/condom/c/050601' },
        { label: 'Okamoto 003 · 52 มม.', source: 'https://www.watsons.co.th/th/%E0%B8%AA%E0%B8%B4%E0%B8%99%E0%B8%84%E0%B9%89%E0%B8%B2%E0%B9%80%E0%B8%9E%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%AA%E0%B8%B8%E0%B8%82%E0%B8%A0%E0%B8%B2%E0%B8%9E/%E0%B8%96%E0%B8%B8%E0%B8%87%E0%B8%A2%E0%B8%B2%E0%B8%87%E0%B8%AD%E0%B8%99%E0%B8%B2%E0%B8%A1%E0%B8%B1%E0%B8%A2/c/050601' }
      ]),
      54: Object.freeze([
        { label: 'Okamoto XL · 54 มม.', source: 'https://www.watsons.co.th/th/okamoto-%E0%B8%96%E0%B8%B8%E0%B8%87%E0%B8%A2%E0%B8%B2%E0%B8%87%E0%B8%AD%E0%B8%99%E0%B8%B2%E0%B8%A1%E0%B8%B1%E0%B8%A2-okamoto-%E0%B9%82%E0%B8%AD%E0%B8%81%E0%B8%B2%E0%B9%82%E0%B8%A1%E0%B9%82%E0%B8%95-%E0%B9%80%E0%B8%AD%E0%B9%87%E0%B8%81%E0%B8%8B%E0%B9%8C%E0%B9%81%E0%B8%AD%E0%B8%A5-2-%E0%B8%8A%E0%B8%B4%E0%B9%89%E0%B8%99/p/BP_248860' },
        { label: 'Durex Excita · 53 มม.', source: 'https://www.homepro.co.th/p/888134800543' },
        { label: 'Durex Performa · 52.5 มม.', source: 'https://www.watsons.co.th/en/all-brands/list/155077/durex' }
      ]),
      56: Object.freeze([
        { label: 'Durex Comfort · 56 มม.', source: 'https://www.bigc.co.th/product/durex-comfort-condom-56-mm-10-units.6665033' },
        { label: 'OneTouch Excite · 56 มม.', source: 'https://www.watsons.co.th/en/health/condom/c/050601' },
        { label: 'Okamoto Super Big Boy · 55 มม.', source: 'https://grandcondom.com/okamoto-brand/okamoto-super-big-boy' }
      ]),
      58: Object.freeze([
        { label: 'TRUSTEX Extra Large · 58 มม.', source: 'https://grandcondom.com/trustex/%E0%B8%96%E0%B8%B8%E0%B8%87%E0%B8%A2%E0%B8%B2%E0%B8%87-58-%E0%B8%A1%E0%B8%A1-trustex-extra-large-1-%E0%B8%8A%E0%B8%B4%E0%B9%89%E0%B8%99' },
        { label: 'Okamoto XXL · 57 มม.', source: 'https://www.watsons.co.th/en/okamoto-okamoto-condom-xxl-3-pcs/p/BP_308042' },
        { label: 'Durex Comfort · 56 มม.', source: 'https://www.bigc.co.th/product/durex-comfort-condom-56-mm-10-units.6665033' }
      ]),
      60: Object.freeze([
        { label: 'OneTouch WONDERR · 60 มม.', source: 'https://shop.line.me/%40vmu3239n/product/1005151952' },
        { label: 'MY.SIZE pro 60 · 60 มม.', source: 'https://pro.mysize-condoms.com/your-mysize-pro-condom/more-than-you-perhaps-expect/mysize-60/' },
        { label: 'Pasante King Size · 60 ±2 มม.', source: 'https://pasante.com/pages/condom-specifications' }
      ]),
      64: Object.freeze([
        { label: 'SAX Super Max · 64 มม.', source: 'https://grandcondom.com/sax-condom/sax-condom-super-max-64mm' },
        { label: 'MY.SIZE pro 64 · 64 มม.', source: 'https://pro.mysize-condoms.com/your-mysize-pro-condom/more-than-you-perhaps-expect/mysize-64' },
        { label: 'MyONE Custom Fit · 64 มม.', source: 'https://onecondoms.com/products/myone-size-64l' }
      ]),
      69: Object.freeze([
        { label: 'Pasante Super King · 69 ±2 มม.', source: 'https://pasante.com/pages/condom-specifications' },
        { label: 'MY.SIZE pro 69 · 69 มม.', source: 'https://pro.mysize-condoms.com/your-mysize-pro-condom/more-than-you-perhaps-expect/mysize-69' }
      ]),
      72: Object.freeze([
        { label: 'MY.SIZE pro 72 · 72 มม.', source: 'https://pro.mysize-condoms.com/your-mysize-pro-condom/more-than-you-perhaps-expect/mysize-72' }
      ])
    });

    function switchAppMode(mode, targetStep = null) {
      currentAppMode = mode;
      const btnAnalysis = document.getElementById('btnModeAnalysis');
      const btnCondom = document.getElementById('btnModeCondom');
      const wizardBar = document.getElementById('wizardBar');
      const condomMatchView = document.getElementById('condomMatchView');

      if (mode === 'analysis') {
        if (btnAnalysis) btnAnalysis.classList.add('active');
        if (btnCondom) btnCondom.classList.remove('active');
        if (wizardBar) wizardBar.style.display = 'flex';
        if (condomMatchView) condomMatchView.style.display = 'none';
        goToStep(targetStep || _currentWizardStep || 1);
      } else if (mode === 'condom') {
        if (btnAnalysis) btnAnalysis.classList.remove('active');
        if (btnCondom) btnCondom.classList.add('active');
        if (wizardBar) wizardBar.style.display = 'none';
        ['step1View', 'step2View', 'step3View'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        if (condomMatchView) condomMatchView.style.display = 'block';
        updateCondomMatchView();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function syncCondomSlider(val) {
      const gMm = Number(val);
      if (!Number.isFinite(gMm)) return false;
      quickCondomGirthMm = gMm;
      updateCondomMatchView();
      return true;
    }

    function updateCondomMatchView() {
      const g_erect = quickCondomGirthMm;
      const displayVal = formatMetricNumber(g_erect / getScaleToMm(), currentUnit === 'in' ? 2 : 1);

      const qcGirthDisplay = document.getElementById('qcGirthDisplay');
      if (qcGirthDisplay) qcGirthDisplay.innerText = `${displayVal} ${currentUnit}`;

      const qcGirthSlider = document.getElementById('qcGirthSlider');
      if (qcGirthSlider) {
        qcGirthSlider.value = g_erect;
      }

      let condomMatch = getCondomSizeMatch(g_erect);
      let w_condom = condomMatch.nominalWidthMm;
      let bestSize = condomMatch.displaySizeMm;

      const qcResultSize = document.getElementById('qcResultSize');
      if (qcResultSize) qcResultSize.innerText = formatMm(bestSize);

      const qcResultFormula = document.getElementById('qcResultFormula');
      if (qcResultFormula) {
        qcResultFormula.innerText = `ค่าประมาณ: รอบวง ${formatMm(g_erect)} ÷ 2.3 = ${formatMm(w_condom)}`;
      }

      const qcResultFit = document.getElementById('qcResultFit');
      if (qcResultFit) {
        qcResultFit.innerText = condomMatch.isLargestAvailable
          ? 'ไซส์ใหญ่สุดที่มี · ใกล้เคียงที่สุด'
          : condomMatch.withinRange
          ? 'ไซส์ใกล้เคียงจากรอบวง'
          : `อยู่นอกช่วง ${formatMetricNumber(condomMatch.minSizeMm)}–${formatMm(condomMatch.maxSizeMm)} · ตรวจตารางผู้ผลิต`;
      }

      const qcBrandLabel = document.getElementById('qcBrandLabel');
      const qcBrandList = document.getElementById('qcBrandList');
      if (qcBrandList) {
        if (condomMatch.withinRange) {
          const products = CONDOM_BRANDS_DB[bestSize] || [];
          if (qcBrandLabel) qcBrandLabel.innerText = '🏷️ รุ่นใกล้เคียงในไทย:';
          qcBrandList.replaceChildren(...products.map(product => {
            const link = document.createElement('a');
            link.className = 'brand-chip';
            link.href = product.source;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = product.label;
            link.title = 'เปิดข้อมูลขนาดจากผู้ผลิต';
            return link;
          }));
        } else {
          if (qcBrandLabel) qcBrandLabel.innerText = 'ค่านี้อยู่นอกช่วงฐานข้อมูลแบรนด์';
          qcBrandList.innerHTML = '<span class="brand-chip">ตรวจตารางไซส์ของผู้ผลิต</span>';
        }
      }

      syncCondomUnitButtons();
      return true;
    }

    function syncCondomUnitButtons() {
      ['qc_u_cm', 'qc_u_in'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
          if (id === `qc_u_${currentUnit}`) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      });
    }

    // --- UNIFIED 4-TAB NAVIGATION LOGIC ---
    let _currentWizardStep = 1;

    function selectTab(tabKey) {
      document.querySelectorAll('.wizard-step').forEach(s => {
        s.classList.remove('active');
        s.setAttribute('aria-selected', 'false');
      });
      const step1View = document.getElementById('step1View');
      const step2View = document.getElementById('step2View');
      const step3View = document.getElementById('step3View');
      const condomMatchView = document.getElementById('condomMatchView');

      if (tabKey === 'condom') {
        const condomTab = document.getElementById('stepTabCondom');
        if (condomTab) {
          condomTab.classList.add('active');
          condomTab.setAttribute('aria-selected', 'true');
        }
        if (step1View) step1View.style.display = 'none';
        if (step2View) step2View.style.display = 'none';
        if (step3View) step3View.style.display = 'none';
        if (condomMatchView) condomMatchView.style.display = 'block';
        updateCondomMatchView();
      } else {
        if (condomMatchView) condomMatchView.style.display = 'none';
        goToStep(tabKey, tabKey === 3);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function goToStep(stepNum, triggerCalculate = false) {
      if (stepNum === 2 && _currentWizardStep === 1) {
        const stepOneValidation = readAndValidateMeasurements({
          ids: ['l_flaccid', 'g_flaccid'],
          showErrors: true
        });
        if (!stepOneValidation.valid) {
          focusInvalidMeasurement(stepOneValidation.firstInvalid);
          return false;
        }
      }

      if (stepNum === 3) {
        const validation = validateMeasurementsForAction();
        if (!validation.valid) return false;
      }

      _currentWizardStep = stepNum;

      for (let i = 1; i <= 3; i++) {
        const tab = document.getElementById('stepTab' + i);
        if (tab) {
          const isActive = i === stepNum;
          tab.classList.toggle('active', isActive);
          tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
      }
      const condomTab = document.getElementById('stepTabCondom');
      if (condomTab) {
        condomTab.classList.remove('active');
        condomTab.setAttribute('aria-selected', 'false');
      }

      const step1View = document.getElementById('step1View');
      const step2View = document.getElementById('step2View');
      const step3View = document.getElementById('step3View');
      const condomMatchView = document.getElementById('condomMatchView');

      if (condomMatchView) condomMatchView.style.display = 'none';

      if (step1View && step2View && step3View) {
        if (stepNum === 1) {
          step1View.style.display = 'block';
          step2View.style.display = 'none';
          step3View.style.display = 'none';
        } else if (stepNum === 2) {
          step1View.style.display = 'none';
          step2View.style.display = 'block';
          step3View.style.display = 'none';
        } else if (stepNum === 3) {
          step1View.style.display = 'none';
          step2View.style.display = 'none';
          step3View.style.display = 'block';
        }
      }

      if (triggerCalculate) {
        if (!calculate(true, false)) return false;
        triggerPulseAnimation();
        if (typeof sendAnonymousAnalytics === 'function') {
          sendAnonymousAnalytics(true, 500);
        }
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }

    document.addEventListener('DOMContentLoaded', () => {
      updateValidationConstraints();
      const restoredLocalTestValues = restoreLocalTestMeasurements();
      goToStep(1);
      updateCondomMatchView();
      updateExportActionLabels();
      if (restoredLocalTestValues) setTimeout(() => showToast('เรียกคืนค่าทดสอบในเครื่องแล้ว'), 0);
    });


    function updateResultInsights({ pctL, pctG, growthType, dL, dG, bestSize, condomMatch, regionName }) {
      const strongest = document.getElementById('insightStrongest');
      const growth = document.getElementById('insightGrowth');
      const practical = document.getElementById('insightPractical');
      if (!strongest || !growth || !practical) return;
      const percentileGap = Math.abs(pctL - pctG);
      if (percentileGap < 5) strongest.textContent = `ความยาวและรอบวงเด่นใกล้กันเมื่อเทียบกับ${regionName} จึงให้ภาพรวมค่อนข้างสมดุล`;
      else if (pctG > pctL) strongest.textContent = `รอบวงเป็นมิติที่โดดเด่นกว่าความยาวเมื่อเทียบกับ${regionName}`;
      else strongest.textContent = `ความยาวเป็นมิติที่โดดเด่นกว่ารอบวงเมื่อเทียบกับ${regionName}`;
      const labels = { shower:'Shower · ขนาดก่อนและหลังแข็งเปลี่ยนไม่มาก', hybrid:'Hybrid · การเปลี่ยนแปลงอยู่กึ่งกลาง', grower:'Grower · การเปลี่ยนแปลงหลังแข็งเห็นได้ชัด' };
      growth.textContent = `${labels[growthType]} (ยาว ${Number(dL)>=0?'+':''}${dL}% · รอบวง ${Number(dG)>=0?'+':''}${dG}%)`;
      practical.textContent = condomMatch.isLargestAvailable ? `${formatMm(bestSize)} เป็นไซส์ใหญ่สุดที่มีและใกล้เคียงที่สุด · ควรเทียบตารางของผู้ผลิตก่อนเลือกจริง` : condomMatch.withinRange ? `ไซส์ใกล้เคียง ${formatMm(bestSize)} · ควรเทียบตารางของผู้ผลิตก่อนเลือกจริง` : `ค่าประมาณ ${formatMm(bestSize)} อยู่นอกช่วงอ้างอิง ${formatMetricNumber(condomMatch.minSizeMm)}–${formatMm(condomMatch.maxSizeMm)} · ควรตรวจตารางผู้ผลิต`;
    }
    function calculate(showErrors = false, syncFromInputs = true) {
      if (syncFromInputs) {
        const measurementResult = readAndValidateMeasurements({ showErrors });
        if (!measurementResult.valid) {
          updateMeasurementWarning(null);
          return false;
        }
        syncChangedMeasurementsFromInputs(measurementResult);
      }

      const measurements = getCanonicalMeasurements();
      updateMeasurementWarning(measurements);
      const { l_flaccid, g_flaccid, l_erect, g_erect, t_fat } = measurements;
      const geometry = MySexCalculatorCore.calculateGeometry(measurements);

      // 1. CONDOM FIT & DIAMETER
      let condomMatch = getCondomSizeMatch(g_erect);
      let w_condom = condomMatch.nominalWidthMm;
      let bestSize = condomMatch.displaySizeMm;
      let diameter = geometry.diameterMm;

      document.getElementById('resCondom').innerText = formatMm(bestSize);
      document.getElementById('resCondomSub').innerText = condomMatch.isLargestAvailable ? 'ไซส์ใหญ่สุดที่มี · ใกล้เคียงที่สุด' : condomMatch.withinRange ? 'ใกล้เคียงจากรอบวง' : `นอกช่วง ${formatMetricNumber(condomMatch.minSizeMm)}–${formatMm(condomMatch.maxSizeMm)} · ตรวจตารางผู้ผลิต`;
      document.getElementById('condomCalcStep').innerText = `${formatMm(g_erect)} ÷ 2.3 = ${formatMm(w_condom)}`;
      document.getElementById('resDiameter').innerText = formatMm(diameter);

      // 2. VOLUME & HEMODYNAMICS
      let v_erect = geometry.erectVolumeCc;
      let v_flaccid = geometry.flaccidVolumeCc;
      let bloodVol = geometry.bloodVolumeCc;
      let volRatio = geometry.volumeRatio;

      // 3. BFPI INDEX & ARCHETYPE (9 types: Growth × Shape)
      let bfpi = geometry.bfpi;
      let badgeElem = document.getElementById('resBadgeType');
      let archTitleElem = document.getElementById('resArchetypeTitle');
      let archSubElem = document.getElementById('resArchetypeSub');
      const archetypeClassification = MySexCalculatorCore.classifyArchetype(measurements, bfpi);
      const pointerLeftPercent = archetypeClassification.gaugePointerPercent;
      document.getElementById('resGaugePointer').style.left = `${pointerLeftPercent.toFixed(1)}%`;

      // --- Growth type ---
      const growthType = archetypeClassification.growthType;

      // --- 9 Archetypes ---
      const ARCHETYPES = {
        'shower_slim': { emoji: '🗡️', name: 'ดาบยาวพร้อมรบ', desc: 'ลำยาวเด่นสะดุดตา ทรงเรียวคมชัดเจนทุกสถานการณ์', badge: 'badge-flesh', export: '🗡️ ดาบยาวพร้อมรบ' },
        'shower_balanced': { emoji: '👑', name: 'ของจริงไม่ต้องลุ้น', desc: 'ขนาดแน่นเต็มตา สมดุลทุกมิติ ตอบโจทย์ทุกสถานการณ์', badge: 'badge-flesh', export: '👑 ของจริงไม่ต้องลุ้น' },
        'shower_thick': { emoji: '🔥', name: 'อวบแน่นจอมพลัง', desc: 'อวบหนาเต็มพิกัด ใหญ่สะใจตั้งแต่ต้น แน่นเต็มกำมือ', badge: 'badge-flesh', export: '🔥 อวบแน่นจอมพลัง' },
        'hybrid_slim': { emoji: '🗡️', name: 'ดาบเผยคม', desc: 'ยืดตัวปานกลาง ทรงเพรียวคม', badge: 'badge-hybrid', export: '🗡️ ดาบเผยคม' },
        'hybrid_balanced': { emoji: '⚖️', name: 'ลงตัว', desc: 'สมดุลทุกมิติ ตอบโจทย์ทุกสถานการณ์', badge: 'badge-hybrid', export: '⚖️ ลงตัว' },
        'hybrid_thick': { emoji: '💪', name: 'แน่นหนา', desc: 'ยืดตัวพอประมาณ แต่หนาแน่นเต็มกำ', badge: 'badge-hybrid', export: '💪 แน่นหนา' },
        'grower_slim': { emoji: '🗡️', name: 'คมในฝัก', desc: 'ตอนอ่อนเล็ก แข็งแล้วยืดยาวคม', badge: 'badge-blood', export: '🗡️ คมในฝัก' },
        'grower_balanced': { emoji: '🐯', name: 'เสือซ่อนเล็บ', desc: 'กระทัดรัดตอนอ่อน แข็งแล้วขยายใหญ่สมส่วน', badge: 'badge-blood', export: '🐯 เสือซ่อนเล็บ' },
        'grower_thick': { emoji: '🐉', name: 'มังกรซ่อนกาย', desc: 'ตอนอ่อนเล็ก แข็งแล้วพองหนาสุดทาง', badge: 'badge-blood', export: '🐉 มังกรซ่อนกาย' },
      };

      const archKey = archetypeClassification.archetypeKey;
      const arch = ARCHETYPES[archKey] || ARCHETYPES['hybrid_balanced'];

      badgeElem.className = `badge ${arch.badge}`;
      badgeElem.innerText = `${arch.emoji} ${arch.name}`;
      archTitleElem.innerText = `${arch.emoji} ${arch.name}`;
      archSubElem.innerText = arch.desc;

      if (document.getElementById('passArchetype')) document.getElementById('passArchetype').innerText = `${arch.emoji} ${arch.name}`;
      if (document.getElementById('passBfpi')) document.getElementById('passBfpi').innerText = bfpi.toFixed(2);
      if (document.getElementById('exportArchetype')) document.getElementById('exportArchetype').innerText = arch.export;

      document.getElementById('resBfpi').innerText = bfpi.toFixed(2);

      // 4. EXPANSION RATIOS & BPEL (BOX 1, 2, 3)
      let dL = geometry.lengthGrowthDisplay;
      let dG = geometry.girthGrowthDisplay;
      let l_bpel = geometry.bpelMm;
      let fatRatio = geometry.fatRatioDisplay;

      document.getElementById('resDeltaL').innerText = (dL >= 0 ? `+${dL}%` : `${dL}%`);
      document.getElementById('resSubDeltaL').innerText = `อ่อน ${formatMetricNumber(l_flaccid)} → แข็ง ${formatMm(l_erect)}`;
      document.getElementById('resDeltaG').innerText = (dG >= 0 ? `+${dG}%` : `${dG}%`);
      document.getElementById('resSubDeltaG').innerText = `อ่อน ${formatMetricNumber(g_flaccid)} → แข็ง ${formatMm(g_erect)}`;
      document.getElementById('resSubBloodVol').innerText = 'ผลต่างระหว่างปริมาตรแข็งและอ่อน';

      // 5. REGIONAL PERCENTILES (BOX 4, 5, 6 — DYNAMICALLY DEPENDENT ON REGION TOGGLE)
      const regionDataset = REGION_DATASETS[currentRegion] || REGION_DATASETS.global;
      const regionName = regionDataset.regionName;

      const percentileMetrics = MySexCalculatorCore.calculatePercentiles(measurements, regionDataset);
      let pctL = percentileMetrics.lengthPercentile;
      let pctG = percentileMetrics.girthPercentile;
      let topL = percentileMetrics.lengthTopPercent;
      let topG = percentileMetrics.girthTopPercent;
      let diffGirth = percentileMetrics.girthDifferenceMm;
      let diffGirthText = formatSignedMm(diffGirth);

      document.getElementById('resLenRank').innerText = topL < 0.1 ? 'Top 0.01%' : `Top ${topL.toFixed(1)}%`;
      document.getElementById('resSubLenRank').innerText = `ยาวกว่า ${pctL.toFixed(1)}% (เทียบ${regionName})`;

      document.getElementById('resGirthRank').innerText = topG < 0.1 ? 'Top 0.01%' : `Top ${topG.toFixed(1)}%`;
      document.getElementById('resSubGirthRank').innerText = `ใหญ่กว่า ${pctG.toFixed(2)}% (${diffGirthText})`;

      document.getElementById('resFatPercent').innerText = `${fatRatio}%`;
      document.getElementById('resSubBPEL').innerText = `ชิดกระดูก: ${formatMm(l_bpel)}`;

      updateResultInsights({ pctL, pctG, growthType, dL, dG, bestSize, condomMatch, regionName });

      document.getElementById('resVolume').innerText = `${v_erect.toFixed(1)} cc`;
      document.getElementById('resBloodVol').innerText = (bloodVol >= 0 ? `+${bloodVol.toFixed(1)} cc` : `${bloodVol.toFixed(1)} cc`);

      document.getElementById('passSize').innerText = `${formatMetricNumber(l_erect / 10)} × ${formatMetricNumber(g_erect / 10)} ซม.`;
      document.getElementById('passBloodVol').innerText = (bloodVol >= 0 ? `+${bloodVol.toFixed(1)} cc` : `${bloodVol.toFixed(1)} cc`);
      document.getElementById('passCondom').innerText = condomMatch.isLargestAvailable ? `${formatMm(bestSize)} · ใหญ่สุด` : condomMatch.withinRange ? formatMm(bestSize) : `${formatMm(bestSize)} · นอกช่วง`;
      document.getElementById('passPercentileLabel').innerText = regionDataset.passportLabel;
      document.getElementById('passPercentile').innerText = topL < 0.1 ? 'Top 0.01%' : `Top ${topL.toFixed(1)}%`;

      // SYNC TO EXPORT CARD
      document.getElementById('exportLength').innerText = formatMetricNumber(l_erect / 10);
      document.getElementById('exportGirth').innerText = formatMetricNumber(g_erect / 10);
      document.getElementById('exportCondom').innerText = formatMetricNumber(bestSize);
      document.getElementById('exportPercentile').innerText = `${topL < 0.1 ? 'Top 0.01%' : `Top ${topL.toFixed(1)}%`} ${regionDataset.exportIcon}`;

      // UPDATE MEDICAL REPORT DATA
      let now = new Date();
      document.getElementById('medDate').innerText = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
      document.getElementById('medLenFlaccid').innerText = formatMm(l_flaccid);
      document.getElementById('medLenErect').innerText = formatMm(l_erect);
      document.getElementById('medGirthFlaccid').innerText = formatMm(g_flaccid);
      document.getElementById('medGirthErect').innerText = formatMm(g_erect);
      document.getElementById('medBPEL').innerHTML = `${formatMm(l_bpel)} (ชั้นไขมันโคน T<sub>fat</sub> = ${formatMm(t_fat)})`;
      document.getElementById('medDiameter').innerText = formatMm(diameter);

      const medGrowthProfile = bfpi >= 2.5 ? '🩸 Pure Blood Grower' : (bfpi >= 1.8 ? '🟣 Hybrid' : '🥩 Pure Flesh Shower');
      document.getElementById('medBFPI').innerText = `${bfpi.toFixed(2)} (${medGrowthProfile})`;
      document.getElementById('medBloodVol').innerText = `${bloodVol >= 0 ? '+' : ''}${bloodVol.toFixed(1)} cc (แบบจำลองทรงกระบอก · ${volRatio.toFixed(2)}×)`;
      document.getElementById('medExpandRatios').innerText = `ความยาว ${dL >= 0 ? '+' : ''}${dL}% | รอบวง ${dG >= 0 ? '+' : ''}${dG}%`;
      document.getElementById('medCondomSize').innerText = condomMatch.isLargestAvailable ? `${formatMm(bestSize)} (ไซส์ใหญ่สุดที่มี · ใกล้เคียงที่สุด)` : condomMatch.withinRange ? `${formatMm(bestSize)} (ค่าประมาณ)` : `${formatMm(bestSize)} (นอกช่วง ${formatMetricNumber(condomMatch.minSizeMm)}–${formatMm(condomMatch.maxSizeMm)} · ตรวจตารางผู้ผลิต)`;

      document.getElementById('medLenPercentile').innerText = `Top ${(100 - pctL).toFixed(2)}% (ยาวกว่า ${pctL.toFixed(1)}% ของ${regionName})`;
      document.getElementById('medGirthPercentile').innerText = `Top ${(100 - pctG).toFixed(2)}% (ใหญ่กว่า ${pctG.toFixed(2)}% ของ${regionName})`;

      const medTopLength = topL < 0.1 ? 'Top 0.01%' : `Top ${topL.toFixed(1)}%`;
      const medTopGirth = topG < 0.1 ? 'Top 0.01%' : `Top ${topG.toFixed(1)}%`;
      document.getElementById('medSummaryProfile').innerText = medGrowthProfile;
      document.getElementById('medSummaryBfpi').innerText = bfpi.toFixed(2);
      document.getElementById('medSummaryLengthGrowth').innerText = `ยาว ${dL >= 0 ? '+' : ''}${dL}%`;
      document.getElementById('medSummaryGirthGrowth').innerText = `รอบวง ${dG >= 0 ? '+' : ''}${dG}%`;
      document.getElementById('medSummaryErectSize').innerText = `${formatMetricNumber(l_erect / 10)} × ${formatMetricNumber(g_erect / 10)} ซม.`;
      document.getElementById('medSummaryCondom').innerText = condomMatch.isLargestAvailable ? `${formatMm(bestSize)} · ใหญ่สุด` : condomMatch.withinRange ? formatMm(bestSize) : `${formatMm(bestSize)} · นอกช่วง`;
      document.getElementById('medSummaryCondomDetail').innerText = condomMatch.isLargestAvailable ? 'ไซส์ใหญ่สุดที่มี · ใกล้เคียงที่สุด' : condomMatch.withinRange ? 'ค่าประมาณจากรอบวง' : 'ตรวจตารางขนาดของผู้ผลิต';
      document.getElementById('medSummaryLengthRank').innerText = `ยาว ${medTopLength}`;
      document.getElementById('medSummaryGirthRank').innerText = `รอบวง ${medTopGirth} · ${regionName}`;

      // DYNAMIC ANATOMICAL POSITION MATCHER (4-TIER EVALUATOR)
      let bestPos = '', cautionPos = '';

      if (dL >= 100) {
        // High Expansion Grower (ควยเลือด)
        bestPos = `<li>🩸 <strong>Grower Doggy Style:</strong> เริ่มตื้นและช้า แล้วค่อยปรับระยะเมื่อพร้อม</li>
                   <li>🛏️ <strong>Elevated Missionary:</strong> การหนุนสะโพกช่วยเปลี่ยนมุมและคุมระยะได้</li>
                   <li>🛋️ <strong>Spooning:</strong> เอื้อต่อจังหวะช้าและการคุมระยะ</li>`;
        cautionPos = `<li>🤠 <strong>Fast Cowboy:</strong> จังหวะหรือมุมที่เปลี่ยนเร็วอาจทำให้ไม่สบาย</li>
                      <li>🤸 <strong>Standing Acrobatics:</strong> ทรงตัวและคุมมุมยากขึ้น ควรระวังการหลุดหรือพับ</li>`;
      } else if (l_erect >= 155 || g_erect >= 140) {
        // Extra Large / Thick Girth (สายอวบยาวพิเศษ / พี่โด Master)
        bestPos = `<li>🛋️ <strong>Spooning (ตะแคงซ้อน):</strong> เอื้อต่อจังหวะช้าและการคุมระยะ</li>
                   <li>🧘 <strong>Lotus (นั่งสวมกอด):</strong> ช่วยให้ทั้งคู่สื่อสารและปรับจังหวะใกล้กัน</li>
                   <li>📐 <strong>CAT Technique:</strong> เน้นการแนบมากกว่าความลึก</li>`;
        cautionPos = `<li>🐕 <strong>Deep Doggy:</strong> อาจเพิ่มความลึก ควรเริ่มตื้นและปรับตามความสบาย</li>
                      <li>🤠 <strong>Cowboy (ฝ่ายบนคุม):</strong> ระวังการลงน้ำหนักหรือเปลี่ยนมุมกะทันหัน</li>`;
      } else if (l_erect < 130 || g_erect < 112) {
        // Compact Specs
        bestPos = `<li>🐕 <strong>Doggy Style:</strong> ปรับมุมและระยะได้หลายระดับ ให้คู่ช่วยบอกความสบาย</li>
                   <li>🛏️ <strong>Pillow Missionary:</strong> การหนุนสะโพกช่วยทดลองเปลี่ยนมุมได้</li>
                   <li>🤸 <strong>Standing Position:</strong> ควรจัดท่าที่มั่นคงก่อนเพิ่มจังหวะ</li>`;
        cautionPos = `<li>🧘 <strong>Lotus Position:</strong> ระยะอาจจำกัด ควรปรับมุมร่วมกันตามความสบาย</li>`;
      } else {
        // Standard / Balanced Specs (ค่าเฉลี่ยมาตรฐาน)
        bestPos = `<li>🛏️ <strong>Missionary (คลาสสิก):</strong> คุมจังหวะและแรงได้ง่าย</li>
                   <li>🐕 <strong>Doggy Style:</strong> ปรับมุมและระยะตามความสบายของทั้งคู่</li>
                   <li>🛋️ <strong>Spooning:</strong> เอื้อต่อจังหวะช้าและการสื่อสารกัน</li>`;
        cautionPos = `<li>🤸 <strong>Standing Acrobatics:</strong> ใช้แรงและการทรงตัวมาก ควรระวังการหลุดหรือพับ</li>`;
      }

      if (document.getElementById('posBestList')) document.getElementById('posBestList').innerHTML = bestPos;
      if (document.getElementById('posCautionList')) document.getElementById('posCautionList').innerHTML = cautionPos;

      latestMetricsSnapshot = Object.freeze({
        measurements: Object.freeze({ ...measurements }),
        bestSize,
        condomInRange: condomMatch.withinRange,
        condomIsLargestAvailable: condomMatch.isLargestAvailable,
        nominalWidthMm: w_condom,
        diameterMm: diameter,
        erectVolumeCc: v_erect,
        flaccidVolumeCc: v_flaccid,
        bloodVolumeCc: bloodVol,
        volumeRatio: volRatio,
        bfpi,
        archetypeKey: archKey,
        lengthGrowthPercent: Number(dL),
        girthGrowthPercent: Number(dG),
        bpelMm: l_bpel,
        fatRatioPercent: Number(fatRatio),
        lengthPercentile: pctL,
        girthPercentile: pctG
      });

      latestGrowthVisual = Object.freeze({ l_f:l_flaccid, g_f:g_flaccid, l_e:l_erect, g_e:g_erect, t_fat });
      renderGrowthStage(0);
      return true;
    }

    let foreskinMode = 'cut';

    function setForeskinMode(mode) {
      if (mode !== 'cut' && mode !== 'uncut') return;
      foreskinMode = mode;
      const cut = document.getElementById('foreskinCut');
      const uncut = document.getElementById('foreskinUncut');
      if (cut) { cut.classList.toggle('active', mode === 'cut'); cut.setAttribute('aria-pressed', String(mode === 'cut')); }
      if (uncut) { uncut.classList.toggle('active', mode === 'uncut'); uncut.setAttribute('aria-pressed', String(mode === 'uncut')); }
      const slider = document.getElementById('growthSlider');
      renderGrowthStage(slider ? slider.value : 100);
    }
    let latestGrowthVisual = null;
    let growthAnimationFrame = null;

    function cancelGrowthAnimation() {
      if (growthAnimationFrame) cancelAnimationFrame(growthAnimationFrame);
      growthAnimationFrame = null;
    }

    function renderGrowthStage(rawProgress) {
      if (!latestGrowthVisual) return;
      const progress = Math.max(0, Math.min(100, Number(rawProgress) || 0));
      const ratio = progress / 100;
      const lengthMm = latestGrowthVisual.l_f + ((latestGrowthVisual.l_e - latestGrowthVisual.l_f) * ratio);
      const girthMm = latestGrowthVisual.g_f + ((latestGrowthVisual.g_e - latestGrowthVisual.g_f) * ratio);
      const slider = document.getElementById('growthSlider');
      if (slider) slider.value = String(progress);
      const label = document.getElementById('growthStageLabel');
      if (label) label.textContent = progress === 0 ? 'ตอนอ่อน · 0%' : progress === 100 ? 'แข็งเต็มที่ · 100%' : `กำลังเปลี่ยนแปลง · ${Math.round(progress)}%`;
      const values = document.getElementById('growthStageValues');
      if (values) values.textContent = `ยาว ${formatMm(lengthMm)} · รอบวง ${formatMm(girthMm)}`;
      renderSvg(latestGrowthVisual.l_f, latestGrowthVisual.g_f, latestGrowthVisual.l_e, latestGrowthVisual.g_e, latestGrowthVisual.t_fat, progress);
    }

    function playGrowthAnimation() {
      if (!latestGrowthVisual) return;
      cancelGrowthAnimation();
      const slider = document.getElementById('growthSlider');
      const from = slider ? Math.max(0, Math.min(100, Number(slider.value) || 0)) : 0;
      const target = from >= 50 ? 0 : 100;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { renderGrowthStage(target); return; }
      const distance = Math.abs(target - from);
      if (distance < 0.1) return;
      const start = performance.now();
      const duration = Math.max(320, 1100 * (distance / 100));
      const tick = now => {
        const elapsed = Math.min(1, (now - start) / duration);
        const eased = 0.5 - (Math.cos(Math.PI * elapsed) / 2);
        renderGrowthStage(from + ((target - from) * eased));
        if (elapsed < 1) growthAnimationFrame = requestAnimationFrame(tick);
        else growthAnimationFrame = null;
      };
      growthAnimationFrame = requestAnimationFrame(tick);
    }
    function renderSvg(l_f, g_f, l_e, g_e, t_fat, growthProgress = 100) {
      const svg = document.getElementById('anatomySvg');
      if (!svg) return;

      const progressRatio = Math.max(0, Math.min(100, Number(growthProgress) || 0)) / 100;
      const foreskinLerp = (from, to, amount) => from + ((to - from) * amount);
      const foreskinPhase = progressRatio <= 0.5 ? progressRatio * 2 : (progressRatio - 0.5) * 2;
      const foreskinMix = (at0, at50, at100) => progressRatio <= 0.5
        ? foreskinLerp(at0, at50, foreskinPhase)
        : foreskinLerp(at50, at100, foreskinPhase);
      const targetLength = l_e;
      const targetGirth = g_e;
      const currentLength = l_f + ((targetLength - l_f) * progressRatio);
      const currentGirth = g_f + ((targetGirth - g_f) * progressRatio);
      const currentFat = t_fat;
      l_e = currentLength;
      g_e = currentGirth;
      const bpel = currentLength + currentFat;

      const cy = 145;
      const x0 = 65;
      const maxSpan = Math.max(targetLength + t_fat, 190);
      const scale = 500 / maxSpan;
      const targetFatW = Math.max(16, t_fat * scale);
      const fat_w = t_fat > 0 ? targetFatW : 0;
      const visible_x = x0 + fat_w;

      const target_total_len = targetLength * scale;
      const target_dia = (targetGirth / Math.PI) * scale * 1.35;
      const target_h = Math.max(48, Math.min(target_dia, 105));
      const target_glans_h = target_h + 8;
      const target_glans_len = Math.max(42, Math.min(target_total_len * 0.265, target_glans_h * 0.86));
      const target_shaft_len = Math.max(20, target_total_len - target_glans_len);

      const f_total_len = l_f * scale;
      const girthRatio = targetGirth > 0 ? Math.min(1, g_f / targetGirth) : 1;
      const f_h = Math.max(32, target_h * girthRatio);
      const f_glans_h = f_h + 6;
      const f_glans_len = Math.max(32, Math.min(f_total_len * 0.265, f_glans_h * 0.86));
      const f_shaft_len = Math.max(15, f_total_len - f_glans_len);
      const f_shaft_x = visible_x;
      const f_shaft_y = cy - (f_h / 2);
      const f_glans_x = visible_x + f_shaft_len;
      const f_tip_x = visible_x + f_total_len;
      const e_total_len = currentLength * scale;
      const e_h = f_h + ((target_h - f_h) * progressRatio);
      const e_glans_h = f_glans_h + ((target_glans_h - f_glans_h) * progressRatio);
      const e_glans_len = f_glans_len + ((target_glans_len - f_glans_len) * progressRatio);
      const e_shaft_len = f_shaft_len + ((target_shaft_len - f_shaft_len) * progressRatio);
      const shaft_x = visible_x;
      const glans_x = visible_x + e_shaft_len;
      const glans_tip_x = glans_x + e_glans_len;
      const shaft_y = cy - (e_h / 2);
      const foreskinCoverage = foreskinMode === 'uncut' ? (progressRatio >= 0.999 ? 0 : 0.12 + (0.88 * (1 - progressRatio))) : 0;
      const foreskinTipX = Math.min(glans_tip_x, glans_x + (e_glans_len * foreskinCoverage));
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const mutedColor = isLight ? '#475569' : '#94a3b8';
      const rulerLineColor = isLight ? '#d81b60' : '#ff2a85';
      const visibleColor = isLight ? '#0284c7' : '#38bdf8';
      const fatBorderColor = isLight ? '#d97706' : '#ffc600';
      const fatTextColor = isLight ? '#92400e' : '#fef08a';

      svg.innerHTML = `
        <defs>
          <pattern id="gridM" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'}" stroke-width="0.8"/>
          </pattern>

          <!-- 3D Erect Shaft Cylindrical Gradient -->
          <linearGradient id="erectShaft3D" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stop-color="#f5caa8"/>
            <stop offset="16%"  stop-color="#e09e76"/>
            <stop offset="50%"  stop-color="#c1764c"/>
            <stop offset="85%"  stop-color="#964e2c"/>
            <stop offset="100%" stop-color="#6d3219"/>
          </linearGradient>

          <linearGradient id="foreskin3D" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#efbd99"/>
            <stop offset="50%" stop-color="#c98762"/>
            <stop offset="100%" stop-color="#8e4b30"/>
          </linearGradient>
          <!-- Natural Rosy Glans Radial Gradient (DO-PHY-01.jpg) -->
          <radialGradient id="erectGlans3D" cx="38%" cy="30%" r="72%">
            <stop offset="0%"   stop-color="#ffb8cd"/>
            <stop offset="26%"  stop-color="#e97b97"/>
            <stop offset="65%"  stop-color="#be4464"/>
            <stop offset="88%"  stop-color="#8a233c"/>
            <stop offset="100%" stop-color="#561324"/>
          </radialGradient>

          <!-- Glossy Specular Reflection Gradient -->
          <linearGradient id="glossHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stop-color="rgba(255,255,255,0.75)"/>
            <stop offset="50%"  stop-color="rgba(255,255,255,0.2)"/>
            <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
          </linearGradient>

          <!-- Flaccid Overlay Cyan Gradient -->
          <linearGradient id="flaccidGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stop-color="rgba(0, 229, 255, 0.45)"/>
            <stop offset="100%" stop-color="rgba(0, 229, 255, 0.12)"/>
          </linearGradient>

          <!-- Fat Pad Gradient -->
          <linearGradient id="fatGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stop-color="${isLight ? 'rgba(217,119,6,0.32)' : 'rgba(255,198,0,0.35)'}"/>
            <stop offset="100%" stop-color="${isLight ? 'rgba(217,119,6,0.12)' : 'rgba(255,198,0,0.12)'}"/>
          </linearGradient>

          <!-- 3D Soft Drop Shadow Filter -->
          <filter id="shadow3D" x="-10%" y="-10%" width="130%" height="130%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="rgba(0,0,0,0.35)"/>
          </filter>
        </defs>

        <rect width="760" height="300" fill="url(#gridM)" rx="12"/>

        <!-- Grid ruler datum at 0 mm (โคนกระดูกหัวหน่าว) -->
        <line x1="${x0}" y1="36" x2="${x0}" y2="245" stroke="${isLight ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.25)'}" stroke-width="1.6" stroke-dasharray="4 3"/>
        <text x="${x0}" y="278" fill="${mutedColor}" font-size="11.5" font-weight="800" text-anchor="middle" font-family="'Prompt', 'Outfit', sans-serif">โคนกระดูกหัวหน่าว</text>

        <!-- 3D ERECT ANATOMY -->
        <g filter="url(#shadow3D)">
          <!-- 3D Erect Shaft Body (Starts at Pubic Bone x0) -->
          <rect id="svgShaftErect" x="${shaft_x}" y="${shaft_y}" width="${e_shaft_len}" height="${e_h}" rx="12"
                fill="url(#erectShaft3D)" stroke="#74331e" stroke-width="1.4"/>

          <!-- Dorsal Vein Realism Path (เส้นเลือดหลังลำตัว) -->
          <path d="M ${visible_x},${cy - e_h * 0.25} C ${shaft_x + e_shaft_len * 0.4},${cy - e_h * 0.32} ${shaft_x + e_shaft_len * 0.7},${cy - e_h * 0.2} ${glans_x - 4},${cy - e_h * 0.28}"
                fill="none" stroke="rgba(140, 50, 70, 0.45)" stroke-width="2.5" stroke-linecap="round"/>

          ${foreskinMode === 'uncut' && progressRatio >= 0.999 ? `
            <g aria-label="หนังหุ้มปลายร่นแนบปลายลำที่ 100%">
              <defs>
                <linearGradient id="retractedForeskinFadeA37" x1="${glans_x - 38}" y1="0" x2="${glans_x - 20}" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="white" stop-opacity="0"/>
                  <stop offset="100%" stop-color="white" stop-opacity="1"/>
                </linearGradient>
                <mask id="retractedForeskinMaskA37" maskUnits="userSpaceOnUse" x="${glans_x - 38}" y="${shaft_y}" width="38" height="${e_h}">
                  <rect x="${glans_x - 38}" y="${shaft_y}" width="38" height="${e_h}" fill="url(#retractedForeskinFadeA37)"/>
                </mask>
                <clipPath id="retractedForeskinShaftClipA37">
                  <rect x="${shaft_x}" y="${shaft_y}" width="${e_shaft_len}" height="${e_h}" rx="12"/>
                </clipPath>
              </defs>
              <path d="M ${glans_x - 60},${shaft_y}
                       C ${glans_x - 63},${shaft_y + (e_h * 0.09)} ${glans_x - 68},${shaft_y + (e_h * 0.17)} ${glans_x - 69},${shaft_y + (e_h * 0.26)}
                       C ${glans_x - 68},${shaft_y + (e_h * 0.33)} ${glans_x - 73},${shaft_y + (e_h * 0.41)} ${glans_x - 72},${shaft_y + (e_h * 0.50)}
                       C ${glans_x - 73},${shaft_y + (e_h * 0.59)} ${glans_x - 69},${shaft_y + (e_h * 0.67)} ${glans_x - 70},${shaft_y + (e_h * 0.75)}
                       C ${glans_x - 68},${shaft_y + (e_h * 0.84)} ${glans_x - 63},${shaft_y + (e_h * 0.92)} ${glans_x - 60},${shaft_y + e_h}
                       L ${glans_x},${shaft_y + e_h}
                       L ${glans_x},${shaft_y} Z"
                    fill="#b86749" opacity="0.99"
                    clip-path="url(#retractedForeskinShaftClipA37)"/>
              <path d="M ${glans_x - 60},${shaft_y}
                       C ${glans_x - 63},${shaft_y + (e_h * 0.09)} ${glans_x - 68},${shaft_y + (e_h * 0.17)} ${glans_x - 69},${shaft_y + (e_h * 0.26)}
                       C ${glans_x - 68},${shaft_y + (e_h * 0.33)} ${glans_x - 73},${shaft_y + (e_h * 0.41)} ${glans_x - 72},${shaft_y + (e_h * 0.50)}
                       C ${glans_x - 73},${shaft_y + (e_h * 0.59)} ${glans_x - 69},${shaft_y + (e_h * 0.67)} ${glans_x - 70},${shaft_y + (e_h * 0.75)}
                       C ${glans_x - 68},${shaft_y + (e_h * 0.84)} ${glans_x - 63},${shaft_y + (e_h * 0.92)} ${glans_x - 60},${shaft_y + e_h}"
                    fill="none" stroke="rgba(70,29,23,.62)" stroke-width="1.25" stroke-linecap="round"
                    clip-path="url(#retractedForeskinShaftClipA37)"/>
              <path d="M ${glans_x - 53},${shaft_y + 3}
                       C ${glans_x - 56},${shaft_y + (e_h * 0.09)} ${glans_x - 61},${shaft_y + (e_h * 0.17)} ${glans_x - 62},${shaft_y + (e_h * 0.26)}
                       C ${glans_x - 61},${shaft_y + (e_h * 0.33)} ${glans_x - 66},${shaft_y + (e_h * 0.41)} ${glans_x - 65},${shaft_y + (e_h * 0.50)}
                       C ${glans_x - 66},${shaft_y + (e_h * 0.59)} ${glans_x - 62},${shaft_y + (e_h * 0.67)} ${glans_x - 63},${shaft_y + (e_h * 0.75)}
                       C ${glans_x - 61},${shaft_y + (e_h * 0.84)} ${glans_x - 56},${shaft_y + (e_h * 0.92)} ${glans_x - 53},${shaft_y + e_h - 3}"
                    fill="none" stroke="rgba(76,36,30,.42)" stroke-width="1" stroke-linecap="round"
                    clip-path="url(#retractedForeskinShaftClipA37)"/>
              <path d="M ${glans_x - 42},${shaft_y + 18}
                       C ${glans_x - 44},${shaft_y + (e_h * 0.24)} ${glans_x - 48},${shaft_y + (e_h * 0.27)} ${glans_x - 47},${shaft_y + (e_h * 0.33)}
                       C ${glans_x - 46},${shaft_y + (e_h * 0.38)} ${glans_x - 50},${shaft_y + (e_h * 0.42)} ${glans_x - 49},${shaft_y + (e_h * 0.48)}
                       C ${glans_x - 48},${shaft_y + (e_h * 0.53)} ${glans_x - 50},${shaft_y + (e_h * 0.58)} ${glans_x - 49},${shaft_y + (e_h * 0.64)}
                       C ${glans_x - 48},${shaft_y + (e_h * 0.69)} ${glans_x - 45},${shaft_y + (e_h * 0.74)} ${glans_x - 46},${shaft_y + (e_h * 0.79)}
                       C ${glans_x - 47},${shaft_y + (e_h * 0.84)} ${glans_x - 46},${shaft_y + (e_h * 0.87)} ${glans_x - 45},${shaft_y + e_h - 18}"
                    fill="none" stroke="rgba(76,36,30,.32)" stroke-width="0.9" stroke-linecap="round"
                    clip-path="url(#retractedForeskinShaftClipA37)"/>
              <path d="M ${glans_x - 20},${shaft_y + 12}
                       C ${glans_x - 24},${cy - (e_h * 0.22)} ${glans_x - 28},${cy - (e_h * 0.08)} ${glans_x - 26},${cy}
                       C ${glans_x - 29},${cy + (e_h * 0.14)} ${glans_x - 24},${cy + (e_h * 0.27)} ${glans_x - 20},${shaft_y + e_h - 12}"
                    fill="none" stroke="rgba(92,44,34,.40)" stroke-width="1.1" stroke-linecap="round"
                    clip-path="url(#retractedForeskinShaftClipA37)"/>
            </g>
          ` : ''}

          <!-- Compact Smooth Acorn Dome (DO-PHY-01.jpg Natural Glans) -->
          <path id="svgGlansErect" d="M ${glans_x},${cy - (e_glans_h / 2)}
                    C ${glans_x + (e_glans_len * 0.45)},${cy - (e_glans_h / 2) - 0.5} ${glans_tip_x - (e_glans_len * 0.15)},${cy - (e_glans_h * 0.35)} ${glans_tip_x - 1.5},${cy - (e_glans_h * 0.16)}
                    C ${glans_tip_x + 3.5},${cy - (e_glans_h * 0.08)} ${glans_tip_x + 3.5},${cy + (e_glans_h * 0.08)} ${glans_tip_x - 1.5},${cy + (e_glans_h * 0.16)}
                    C ${glans_tip_x - (e_glans_len * 0.15)},${cy + (e_glans_h * 0.35)} ${glans_x + (e_glans_len * 0.45)},${cy + (e_glans_h / 2) + 0.5} ${glans_x},${cy + (e_glans_h / 2)}
                    C ${glans_x - (e_glans_len * 0.18)},${cy + (e_glans_h * 0.38)} ${glans_x - (e_glans_len * 0.18)},${cy - (e_glans_h * 0.38)} ${glans_x},${cy - (e_glans_h / 2)} Z"
                fill="url(#erectGlans3D)" stroke="#922339" stroke-width="1.6"/>

          <!-- Glossy Specular Highlight Reflection on Compact Dome -->
          <ellipse cx="${glans_x + e_glans_len * 0.40}" cy="${cy - e_glans_h * 0.24}" rx="${e_glans_len * 0.26}" ry="${e_glans_h * 0.11}"
                   fill="url(#glossHighlight)" transform="rotate(-6, ${glans_x + e_glans_len * 0.40}, ${cy - e_glans_h * 0.24})"/>

          <!-- Subtle Top Shaft Specular Reflection -->
          <ellipse cx="${visible_x + (glans_x - visible_x) * 0.45}" cy="${shaft_y + e_h * 0.22}" rx="${(glans_x - visible_x) * 0.35}" ry="${e_h * 0.1}"
                   fill="url(#glossHighlight)"/>

          <!-- Corona Ridge Rolled Lip Rim (ขอบสันหยักคอ) -->
          <path d="M ${glans_x + 1},${cy - (e_glans_h / 2) + 3} C ${glans_x - 6},${cy - (e_h * 0.22)} ${glans_x - 6},${cy + (e_h * 0.22)} ${glans_x + 1},${cy + (e_glans_h / 2) - 3}"
                fill="none" stroke="rgba(214, 92, 122, 0.68)" stroke-width="1.1" stroke-linecap="round"/>


        </g>

        ${foreskinMode === 'uncut' && progressRatio < 0.999 ? (() => {
          const unifiedFreeEdgeX = foreskinMix(glans_tip_x - 2, glans_x + (e_glans_len * 0.50), glans_x - 60);
          const unifiedLeftPull = foreskinMix(0, 12, 0);
          const unifiedShaftBlendWidth = foreskinMix(18, 36, 16);
          const unifiedShaftBlendEndX = Math.min(glans_x - unifiedLeftPull, unifiedFreeEdgeX);
          const unifiedShaftBlendStartX = unifiedShaftBlendEndX - unifiedShaftBlendWidth;
          const unifiedSurfaceRightX = Math.max(glans_x, unifiedFreeEdgeX);
          const unifiedFreeEdgeTop = foreskinMix(cy - (e_glans_h * 0.18), cy - (e_glans_h * 0.50), shaft_y);
          const unifiedFreeEdgeBottom = foreskinMix(cy + (e_glans_h * 0.18), cy + (e_glans_h * 0.50), shaft_y + e_h);
          const unifiedFreeEdgeSpan = unifiedFreeEdgeBottom - unifiedFreeEdgeTop;
          const unifiedWrinkleLengthPhase = Math.min(1, progressRatio * 2);
          const unifiedGlansHeightAt50 = f_glans_h + ((target_glans_h - f_glans_h) * 0.50);
          const unifiedWrinkleHalfSpanAt0 = f_glans_h * 0.32;
          const unifiedWrinkleHalfSpanAt50 = unifiedGlansHeightAt50 * 0.50;
          const unifiedWrinkleHalfSpan = progressRatio < 0.5
            ? foreskinLerp(unifiedWrinkleHalfSpanAt0, unifiedWrinkleHalfSpanAt50, unifiedWrinkleLengthPhase)
            : unifiedFreeEdgeSpan / 2;
          const unifiedWrinkleTop = progressRatio < 0.5 ? cy - unifiedWrinkleHalfSpan : unifiedFreeEdgeTop;
          const unifiedWrinkleBottom = progressRatio < 0.5 ? cy + unifiedWrinkleHalfSpan : unifiedFreeEdgeBottom;
          const unifiedWrinkleSpan = unifiedWrinkleBottom - unifiedWrinkleTop;
          const unifiedWrinkleInsetAt0 = Math.min(18, unifiedWrinkleHalfSpanAt0 * 0.40);
          const unifiedWrinkleInsetAt50 = Math.min(18, unifiedWrinkleHalfSpanAt50 * 0.40);
          const unifiedWrinkleVisibleHalfAt0 = unifiedWrinkleHalfSpanAt0 - unifiedWrinkleInsetAt0;
          const unifiedWrinkleVisibleHalfAt50 = unifiedWrinkleHalfSpanAt50 - unifiedWrinkleInsetAt50;
          const unifiedWrinkleVisibleHalf = progressRatio < 0.5
            ? foreskinLerp(unifiedWrinkleVisibleHalfAt0, unifiedWrinkleVisibleHalfAt50, unifiedWrinkleLengthPhase)
            : unifiedWrinkleHalfSpan - Math.min(18, unifiedWrinkleSpan * 0.20);
          const unifiedSurfaceCurve = foreskinMix(0, 5, 0);
          const unifiedSurfaceCounterCurve = foreskinMix(0, 2, 0);
          const unifiedEdgeOffset = (at0, at50, at100) => foreskinMix(at0, at50, at100);
          const unifiedMovingWrinkleX = unifiedFreeEdgeX + foreskinMix(-7, -14, 7);
          const unifiedSecondWrinkleRawX = foreskinMix(unifiedFreeEdgeX - 11, unifiedFreeEdgeX - 28, glans_x - 20);
          const unifiedWrinkleLaneMinX = Math.min(glans_x - 4, unifiedFreeEdgeX);
          const unifiedWrinkleLaneMaxX = Math.max(glans_x - 4, unifiedFreeEdgeX);
          const unifiedWrinkleLaneInset = Math.min(4, (unifiedWrinkleLaneMaxX - unifiedWrinkleLaneMinX) * 0.25);
          const unifiedSecondWrinkleX = Math.max(
            unifiedWrinkleLaneMinX + unifiedWrinkleLaneInset,
            Math.min(unifiedWrinkleLaneMaxX - unifiedWrinkleLaneInset, unifiedSecondWrinkleRawX)
          );
          const unifiedWrinkleInset = unifiedWrinkleHalfSpan - unifiedWrinkleVisibleHalf;
          const unifiedMovingWrinkleInset = unifiedWrinkleInset + foreskinMix(4, 0, 0);
          const unifiedWrinkleOpacity = foreskinMix(0.18, 0.28, 0.34);
          const unifiedCoveredOutlineOpacity = foreskinMix(1, 0, 0);
          return `
          <g aria-label="ผืนหนังหุ้มปลายแบบต่อเนื่อง">
            <defs>
              <clipPath id="unifiedForeskinAnatomyClip">
                <rect x="${shaft_x}" y="${shaft_y}" width="${e_shaft_len}" height="${e_h}" rx="12"/>
                <path id="unifiedForeskinGlansShape" d="M ${glans_x},${cy - (e_glans_h / 2)}
                         C ${glans_x + (e_glans_len * 0.45)},${cy - (e_glans_h / 2) - 0.5} ${glans_tip_x - (e_glans_len * 0.15)},${cy - (e_glans_h * 0.35)} ${glans_tip_x - 1.5},${cy - (e_glans_h * 0.16)}
                         C ${glans_tip_x + 3.5},${cy - (e_glans_h * 0.08)} ${glans_tip_x + 3.5},${cy + (e_glans_h * 0.08)} ${glans_tip_x - 1.5},${cy + (e_glans_h * 0.16)}
                         C ${glans_tip_x - (e_glans_len * 0.15)},${cy + (e_glans_h * 0.35)} ${glans_x + (e_glans_len * 0.45)},${cy + (e_glans_h / 2) + 0.5} ${glans_x},${cy + (e_glans_h / 2)}
                         C ${glans_x - (e_glans_len * 0.18)},${cy + (e_glans_h * 0.38)} ${glans_x - (e_glans_len * 0.18)},${cy - (e_glans_h * 0.38)} ${glans_x},${cy - (e_glans_h / 2)} Z"/>
              </clipPath>
              <linearGradient id="unifiedForeskinShaftFade"
                              x1="${unifiedShaftBlendStartX}" y1="0"
                              x2="${unifiedShaftBlendEndX}" y2="0"
                              gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="black"/>
                <stop offset="100%" stop-color="white"/>
              </linearGradient>
              <mask id="unifiedForeskinShaftBlend" maskUnits="userSpaceOnUse"
                    x="${shaft_x}" y="${shaft_y - 10}"
                    width="${glans_tip_x - shaft_x + 10}" height="${e_h + 20}">
                <rect x="${shaft_x}" y="${shaft_y - 10}"
                      width="${glans_tip_x - shaft_x + 10}" height="${e_h + 20}"
                      fill="url(#unifiedForeskinShaftFade)"/>
                <use href="#unifiedForeskinGlansShape" fill="white"/>
              </mask>
            </defs>
            <path d="M ${unifiedShaftBlendStartX},${shaft_y - 8}
                     L ${unifiedSurfaceRightX},${shaft_y - 8}
                     L ${unifiedSurfaceRightX},${unifiedFreeEdgeTop}
                     C ${unifiedSurfaceRightX + unifiedEdgeOffset(-1, -2, -3)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.09)} ${unifiedSurfaceRightX + unifiedEdgeOffset(1, 2, -8)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.17)} ${unifiedSurfaceRightX + unifiedEdgeOffset(0, -1, -9)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.26)}
                     C ${unifiedSurfaceRightX + unifiedEdgeOffset(1, 1, -8)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.33)} ${unifiedSurfaceRightX + unifiedEdgeOffset(-1, -3, -13)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.41)} ${unifiedSurfaceRightX + unifiedEdgeOffset(0, 0, -12)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.50)}
                     C ${unifiedSurfaceRightX + unifiedEdgeOffset(-1, -3, -13)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.59)} ${unifiedSurfaceRightX + unifiedEdgeOffset(1, 1, -9)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.67)} ${unifiedSurfaceRightX + unifiedEdgeOffset(0, -1, -10)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.75)}
                     C ${unifiedSurfaceRightX + unifiedEdgeOffset(1, 2, -8)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.84)} ${unifiedSurfaceRightX + unifiedEdgeOffset(-1, -2, -3)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.92)} ${unifiedSurfaceRightX},${unifiedFreeEdgeBottom}
                     L ${unifiedSurfaceRightX},${shaft_y + e_h + 8}
                     L ${unifiedShaftBlendStartX},${shaft_y + e_h + 8}
                     C ${unifiedShaftBlendStartX - foreskinMix(0, 4, 0)},${shaft_y + (e_h * 0.76)} ${unifiedShaftBlendStartX - foreskinMix(0, 4, 0)},${shaft_y + (e_h * 0.24)} ${unifiedShaftBlendStartX},${shaft_y - 8} Z"
                  fill="#b86749" stroke="none" opacity="0.99"
                  clip-path="url(#unifiedForeskinAnatomyClip)"
                  mask="url(#unifiedForeskinShaftBlend)"/>
            <path d="M ${glans_x},${cy - (e_glans_h / 2)}
                     C ${glans_x + (e_glans_len * 0.45)},${cy - (e_glans_h / 2) - 0.5} ${glans_tip_x - (e_glans_len * 0.15)},${cy - (e_glans_h * 0.35)} ${glans_tip_x - 1.5},${cy - (e_glans_h * 0.16)}
                     C ${glans_tip_x + 3.5},${cy - (e_glans_h * 0.08)} ${glans_tip_x + 3.5},${cy + (e_glans_h * 0.08)} ${glans_tip_x - 1.5},${cy + (e_glans_h * 0.16)}
                     C ${glans_tip_x - (e_glans_len * 0.15)},${cy + (e_glans_h * 0.35)} ${glans_x + (e_glans_len * 0.45)},${cy + (e_glans_h / 2) + 0.5} ${glans_x},${cy + (e_glans_h / 2)}
                     C ${glans_x - (e_glans_len * 0.18)},${cy + (e_glans_h * 0.38)} ${glans_x - (e_glans_len * 0.18)},${cy - (e_glans_h * 0.38)} ${glans_x},${cy - (e_glans_h / 2)} Z"
                  fill="none" stroke="#7b402d" stroke-width="2.2" stroke-linejoin="round"
                  opacity="${unifiedCoveredOutlineOpacity}" pointer-events="none"/>
            <path d="M ${glans_x},${cy + (e_glans_h / 2)}
                     C ${glans_x - (e_glans_len * 0.18)},${cy + (e_glans_h * 0.38)} ${glans_x - (e_glans_len * 0.18)},${cy - (e_glans_h * 0.38)} ${glans_x},${cy - (e_glans_h / 2)}"
                  fill="none" stroke="#b86749" stroke-width="3.4" stroke-linecap="round"
                  opacity="${unifiedCoveredOutlineOpacity}" pointer-events="none"/>
            <path d="M ${unifiedFreeEdgeX},${unifiedFreeEdgeTop}
                     C ${unifiedFreeEdgeX + unifiedEdgeOffset(-1, -2, -3)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.09)} ${unifiedFreeEdgeX + unifiedEdgeOffset(1, 2, -8)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.17)} ${unifiedFreeEdgeX + unifiedEdgeOffset(0, -1, -9)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.26)}
                     C ${unifiedFreeEdgeX + unifiedEdgeOffset(1, 1, -8)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.33)} ${unifiedFreeEdgeX + unifiedEdgeOffset(-1, -3, -13)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.41)} ${unifiedFreeEdgeX + unifiedEdgeOffset(0, 0, -12)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.50)}
                     C ${unifiedFreeEdgeX + unifiedEdgeOffset(-1, -3, -13)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.59)} ${unifiedFreeEdgeX + unifiedEdgeOffset(1, 1, -9)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.67)} ${unifiedFreeEdgeX + unifiedEdgeOffset(0, -1, -10)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.75)}
                     C ${unifiedFreeEdgeX + unifiedEdgeOffset(1, 2, -8)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.84)} ${unifiedFreeEdgeX + unifiedEdgeOffset(-1, -2, -3)},${unifiedFreeEdgeTop + (unifiedFreeEdgeSpan * 0.92)} ${unifiedFreeEdgeX},${unifiedFreeEdgeBottom}"
                  fill="none" stroke="rgba(70,29,23,.62)" stroke-width="1.15" stroke-linecap="round"
                   clip-path="url(#unifiedForeskinAnatomyClip)"/>
            <path d="M ${glans_x - 4},${cy - (e_glans_h / 2) + 8}
                     C ${glans_x - 11},${cy - (e_h * 0.22)} ${glans_x - 11},${cy + (e_h * 0.22)} ${glans_x - 4},${cy + (e_glans_h / 2) - 8}"
                  fill="none" stroke="rgba(92,44,34,.48)" stroke-width="1.05"
                  stroke-linecap="round" clip-path="url(#unifiedForeskinAnatomyClip)"/>
            <path d="M ${unifiedMovingWrinkleX},${unifiedWrinkleTop + unifiedMovingWrinkleInset}
                     C ${unifiedMovingWrinkleX + unifiedEdgeOffset(-2, -2, -3)},${unifiedWrinkleTop + (unifiedWrinkleSpan * 0.20)} ${unifiedMovingWrinkleX + unifiedEdgeOffset(2, -3, -5)},${unifiedWrinkleTop + (unifiedWrinkleSpan * 0.34)} ${unifiedMovingWrinkleX + unifiedEdgeOffset(-1, -1, -4)},${cy}
                     C ${unifiedMovingWrinkleX + unifiedEdgeOffset(-2, -3, -5)},${unifiedWrinkleTop + (unifiedWrinkleSpan * 0.66)} ${unifiedMovingWrinkleX + unifiedEdgeOffset(2, 1, -2)},${unifiedWrinkleTop + (unifiedWrinkleSpan * 0.80)} ${unifiedMovingWrinkleX},${unifiedWrinkleBottom - unifiedMovingWrinkleInset}
                     M ${unifiedSecondWrinkleX},${unifiedWrinkleTop + unifiedWrinkleInset}
                     C ${unifiedSecondWrinkleX - unifiedEdgeOffset(3, 3, 5)},${cy - (unifiedWrinkleSpan * 0.22)} ${unifiedSecondWrinkleX - unifiedEdgeOffset(4, 4, 6)},${cy - (unifiedWrinkleSpan * 0.08)} ${unifiedSecondWrinkleX - unifiedEdgeOffset(2, 2, 4)},${cy}
                     C ${unifiedSecondWrinkleX - unifiedEdgeOffset(4, 4, 6)},${cy + (unifiedWrinkleSpan * 0.14)} ${unifiedSecondWrinkleX + unifiedEdgeOffset(1, 1, -2)},${cy + (unifiedWrinkleSpan * 0.27)} ${unifiedSecondWrinkleX},${unifiedWrinkleBottom - unifiedWrinkleInset}"
                  fill="none" stroke="rgba(76,36,30,${unifiedWrinkleOpacity})" stroke-width="1" stroke-linecap="round"/>
          </g>`;
        })() : ''}

        <!-- Pubic Fat Pad Layer -->
        ${t_fat > 0 ? `
          <text x="${x0 + (fat_w / 2)}" y="${cy - (e_h / 2) - 18}" fill="${fatTextColor}" font-size="11.5" font-weight="800" text-anchor="middle" font-family="'Prompt', 'Outfit', sans-serif">ชั้นไขมัน T_fat: ${formatMm(currentFat)}</text>
          <rect x="${x0}" y="${cy - (e_h / 2) - 10}" width="${fat_w}" height="${e_h + 20}" rx="8"
                fill="url(#fatGrad)" stroke="${fatBorderColor}" stroke-width="1.5" stroke-dasharray="4 3"/>
          <line x1="${visible_x}" y1="${cy - (e_h / 2) - 14}" x2="${visible_x}" y2="${cy + (e_h / 2) + 14}" stroke="${fatBorderColor}" stroke-width="1.5" stroke-dasharray="3 3"/>
        ` : ''}

        <!-- BPEL RULER LINE (Top - From Pubic Bone x0 to Glans Tip) -->
        <line x1="${x0}" y1="46" x2="${glans_tip_x}" y2="46" stroke="${rulerLineColor}" stroke-width="2.5"/>
        <line x1="${x0}" y1="38" x2="${x0}" y2="54" stroke="${rulerLineColor}" stroke-width="2.5"/>
        <line x1="${glans_tip_x}" y1="38" x2="${glans_tip_x}" y2="54" stroke="${rulerLineColor}" stroke-width="2.5"/>
        <text x="${(x0 + glans_tip_x) / 2}" y="34" fill="${rulerLineColor}" font-size="13.5" font-weight="900" text-anchor="middle" font-family="'Prompt', 'Outfit', sans-serif" letter-spacing="0.3px">ยาวกดถึงกระดูก (BPEL): ${formatMm(bpel)}</text>

        <!-- VISIBLE ERECT RULER LINE (Bottom - From Fat Boundary to Glans Tip) -->
        <line x1="${visible_x}" y1="244" x2="${glans_tip_x}" y2="244" stroke="${visibleColor}" stroke-width="2" stroke-dasharray="4 2"/>
        <line x1="${visible_x}" y1="237" x2="${visible_x}" y2="251" stroke="${visibleColor}" stroke-width="2"/>
        <line x1="${glans_tip_x}" y1="237" x2="${glans_tip_x}" y2="251" stroke="${visibleColor}" stroke-width="2"/>
        <text x="${(visible_x + glans_tip_x) / 2}" y="266" fill="${visibleColor}" font-size="12.5" font-weight="800" text-anchor="middle" font-family="'Prompt', 'Outfit', sans-serif">ยาวมองเห็นพ้นไขมัน (NBPEL): ${formatMm(l_e)}</text>

      `;
    }

    let _passportReturnFocus = null;
    let _medicalReturnFocus = null;

    function restoreModalFocus(target) {
      if (target instanceof HTMLElement && document.contains(target)) target.focus();
    }

    function openPassportModal() {
      const validation = validateMeasurementsForAction();
      if (!validation.valid || !calculate(true, false)) return false;
      // inject URL config ลง watermark อัตโนมัติ
      const urlEl = document.getElementById('passportSiteUrl');
      if (urlEl) urlEl.textContent = SITE_URL;
      _passportReturnFocus = document.activeElement;
      document.getElementById('passportModalOverlay').style.display = 'flex';
      requestAnimationFrame(() => document.getElementById('passportCloseButton')?.focus());
      schedulePassportSharePreparation();
      return true;
    }
    function closePassportModal() {
      document.getElementById('passportModalOverlay').style.display = 'none';
      restoreModalFocus(_passportReturnFocus);
      _passportReturnFocus = null;
    }

    // Name Edit Toggle — double-click to edit, blur/Enter to save
    function startEditName() {
      const display = document.getElementById('passNameDisplay');
      const input = document.getElementById('passName');
      input.value = display.textContent.trim();
      display.style.display = 'none';
      input.style.display = '';
      input.focus();
      input.select();
    }

    function finishEditName() {
      const display = document.getElementById('passNameDisplay');
      const input = document.getElementById('passName');
      const val = input.value.trim() || 'ชื่อผู้ถือการ์ด';
      display.textContent = val;
      input.style.display = 'none';
      display.style.display = '';
    }

    function setMedicalDetailsExpanded(expanded) {
      const toggle = document.getElementById('medicalDetailsToggle');
      const label = document.getElementById('medicalDetailsToggleText');
      const panel = document.getElementById('medicalDetailsPanel');
      if (!toggle || !label || !panel) return;
      toggle.setAttribute('aria-expanded', String(expanded));
      panel.hidden = !expanded;
      label.textContent = expanded ? 'ซ่อนรายละเอียดและกลับไปดูสรุป' : 'ดูรายละเอียดและตารางทั้งหมด 3 หมวด';
    }

    function toggleMedicalDetails() {
      const toggle = document.getElementById('medicalDetailsToggle');
      setMedicalDetailsExpanded(toggle?.getAttribute('aria-expanded') !== 'true');
    }

    function openMedicalModal() {
      const validation = validateMeasurementsForAction();
      if (!validation.valid || !calculate(true, false)) return false;
      setMedicalDetailsExpanded(false);
      _medicalReturnFocus = document.activeElement;
      document.getElementById('medicalModalOverlay').style.display = 'flex';
      requestAnimationFrame(() => document.getElementById('medicalCloseButton')?.focus());
      return true;
    }
    function closeMedicalModal() {
      document.getElementById('medicalModalOverlay').style.display = 'none';
      restoreModalFocus(_medicalReturnFocus);
      _medicalReturnFocus = null;
    }

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const saveOverlay = document.getElementById('passportSaveOverlay');
      if (saveOverlay?.classList.contains('open')) {
        closePassportSavePreview();
        return;
      }
      const medicalModal = document.getElementById('medicalModalOverlay');
      const passportModal = document.getElementById('passportModalOverlay');
      if (medicalModal?.style.display === 'flex') {
        closeMedicalModal();
      } else if (passportModal?.style.display === 'flex') {
        closePassportModal();
      }
    });

    let _userPhotoUploaded = false; // flag: มีรูปจริงแล้วหรือยัง
    const _passportPhotoCrop = {
      naturalWidth: 0, naturalHeight: 0, zoom: 1, panX: 0, panY: 0,
      editing: false, dragging: false, moved: false, suppressClick: false,
      startClientX: 0, startClientY: 0, startPanX: 0, startPanY: 0
    };

    function clampPassportCrop(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function getPassportCropGeometry() {
      const hero = document.getElementById('passportPhotoHero');
      if (!hero || !_passportPhotoCrop.naturalWidth || !_passportPhotoCrop.naturalHeight) return null;
      const frameWidth = hero.clientWidth;
      const frameHeight = hero.clientHeight;
      const coverScale = Math.max(frameWidth / _passportPhotoCrop.naturalWidth, frameHeight / _passportPhotoCrop.naturalHeight);
      const scale = coverScale * _passportPhotoCrop.zoom;
      const imageWidth = _passportPhotoCrop.naturalWidth * scale;
      const imageHeight = _passportPhotoCrop.naturalHeight * scale;
      return {
        imageWidth: imageWidth, imageHeight: imageHeight,
        maxX: Math.max(0, (imageWidth - frameWidth) / 2),
        maxY: Math.max(0, (imageHeight - frameHeight) / 2)
      };
    }

    function applyPassportPhotoCrop() {
      const img = document.getElementById('passportImgView');
      const geometry = getPassportCropGeometry();
      if (!img || !geometry) return;
      const offsetX = _passportPhotoCrop.panX * geometry.maxX;
      const offsetY = _passportPhotoCrop.panY * geometry.maxY;
      img.style.position = 'absolute';
      img.style.left = '50%';
      img.style.top = '50%';
      img.style.width = geometry.imageWidth + 'px';
      img.style.height = geometry.imageHeight + 'px';
      img.style.maxWidth = 'none';
      img.style.objectFit = 'fill';
      img.style.transform = 'translate(-50%, -50%) translate(' + offsetX + 'px, ' + offsetY + 'px)';
    }

    function setPassportPhotoEditor(open) {
      const hero = document.getElementById('passportPhotoHero');
      const editor = document.getElementById('passportPhotoEditor');
      _passportPhotoCrop.editing = Boolean(open && _userPhotoUploaded);
      if (hero) hero.classList.toggle('is-editing', _passportPhotoCrop.editing);
      if (editor) editor.hidden = !_passportPhotoCrop.editing;
    }

    function updatePassportPhotoOverlay() {
      const icon = document.getElementById('passportPhotoOverlayIcon');
      const label = document.getElementById('passportPhotoOverlayText');
      if (icon) icon.textContent = _userPhotoUploaded ? '✥' : '📷';
      if (label) label.textContent = _userPhotoUploaded ? 'คลิกเพื่อจัดภาพ' : 'อัปโหลดรูปภาพ';
    }

    function handlePassportPhotoFrameClick() {
      if (_passportPhotoCrop.suppressClick) {
        _passportPhotoCrop.suppressClick = false;
        return;
      }
      if (!_userPhotoUploaded) document.getElementById('passportFileUploader').click();
      else if (!_passportPhotoCrop.editing) setPassportPhotoEditor(true);
    }

    function handlePassportPhotoFrameKeydown(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      handlePassportPhotoFrameClick();
    }

    function startPassportPhotoDrag(event) {
      if (!_userPhotoUploaded) return;
      if (!_passportPhotoCrop.editing) setPassportPhotoEditor(true);
      if (!getPassportCropGeometry()) return;
      _passportPhotoCrop.dragging = true;
      _passportPhotoCrop.moved = false;
      _passportPhotoCrop.startClientX = event.clientX;
      _passportPhotoCrop.startClientY = event.clientY;
      _passportPhotoCrop.startPanX = _passportPhotoCrop.panX;
      _passportPhotoCrop.startPanY = _passportPhotoCrop.panY;
      event.currentTarget.classList.add('is-dragging');
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    function movePassportPhotoDrag(event) {
      if (!_passportPhotoCrop.dragging) return;
      const geometry = getPassportCropGeometry();
      if (!geometry) return;
      const deltaX = event.clientX - _passportPhotoCrop.startClientX;
      const deltaY = event.clientY - _passportPhotoCrop.startClientY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 3) _passportPhotoCrop.moved = true;
      const startOffsetX = _passportPhotoCrop.startPanX * geometry.maxX;
      const startOffsetY = _passportPhotoCrop.startPanY * geometry.maxY;
      _passportPhotoCrop.panX = geometry.maxX ? clampPassportCrop((startOffsetX + deltaX) / geometry.maxX, -1, 1) : 0;
      _passportPhotoCrop.panY = geometry.maxY ? clampPassportCrop((startOffsetY + deltaY) / geometry.maxY, -1, 1) : 0;
      applyPassportPhotoCrop();
      event.preventDefault();
    }

    function endPassportPhotoDrag(event) {
      if (!_passportPhotoCrop.dragging) return;
      _passportPhotoCrop.dragging = false;
      _passportPhotoCrop.suppressClick = _passportPhotoCrop.moved;
      event.currentTarget.classList.remove('is-dragging');
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      schedulePassportSharePreparation();
    }

    function setPassportPhotoZoom(value) {
      _passportPhotoCrop.zoom = clampPassportCrop(Number(value) || 1, 1, 3);
      const output = document.getElementById('passportPhotoZoomValue');
      if (output) output.textContent = Math.round(_passportPhotoCrop.zoom * 100) + '%';
      applyPassportPhotoCrop();
      schedulePassportSharePreparation();
    }

    function resetPassportPhotoCrop() {
      _passportPhotoCrop.zoom = 1;
      _passportPhotoCrop.panX = 0;
      _passportPhotoCrop.panY = 0;
      const slider = document.getElementById('passportPhotoZoom');
      if (slider) slider.value = '1';
      setPassportPhotoZoom(1);
    }

    function finishPassportPhotoCrop() {
      setPassportPhotoEditor(false);
      schedulePassportSharePreparation();
    }

    function chooseNewPassportPhoto() {
      document.getElementById('passportFileUploader').click();
    }

    function loadPassportPhoto(input) {
      if (!input.files || !input.files[0]) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        const modalImg = document.getElementById('passportImgView');
        const exportImg = document.getElementById('exportImgView');
        const photoSource = e.target.result;
        modalImg.onload = function () {
          _passportPhotoCrop.naturalWidth = modalImg.naturalWidth;
          _passportPhotoCrop.naturalHeight = modalImg.naturalHeight;
          _userPhotoUploaded = true;
          resetPassportPhotoCrop();
          setPassportPhotoEditor(true);
          updatePassportPhotoOverlay();
          modalImg.onload = null;
          showToast('📸 ลากรูปเพื่อจัดตำแหน่ง แล้วปรับซูมได้');
          schedulePassportSharePreparation();
          if (typeof sendAnonymousAnalytics === 'function') sendAnonymousAnalytics(true, 300);
        };
        modalImg.src = photoSource;
        exportImg.src = photoSource;
      };
      reader.readAsDataURL(input.files[0]);
      input.value = '';
    }

    window.addEventListener('resize', function () {
      if (_userPhotoUploaded) {
        applyPassportPhotoCrop();
        schedulePassportSharePreparation();
      }
    });

    // ใช้ canonical production domain บน Passport Preview และ Passport PNG เสมอ
    const SITE_URL = 'www.mysex.dev';
    let _preparedPassportShareFile = null;
    let _preparedPassportShareDataUrl = '';
    let _passportSharePrepareTimer = null;
    let _passportSharePrepareVersion = 0;
    // ===================================================

    async function exportPassportCard() {
      const validation = validateMeasurementsForAction({ onInvalid: closePassportModal });
      if (!validation.valid || !calculate(true, false)) return false;

      if (canUseImmediateMobileShare() && _preparedPassportShareFile) {
        try {
          const sharePromise = navigator.share({
            files: [_preparedPassportShareFile],
            title: 'MySex Spec Passport'
          });
          sharePromise.catch(error => {
            if (error?.name !== 'AbortError') {
              openPassportSavePreview(_preparedPassportShareFile, _preparedPassportShareDataUrl);
            }
          });
          return true;
        } catch (_) {
          openPassportSavePreview(_preparedPassportShareFile, _preparedPassportShareDataUrl);
          return true;
        }
      }

      showToast('⏳ กำลังสร้างการ์ด...');
      const canvas = await renderPassportCardCanvas();
      if (!canvas) {
        showToast('❌ ส่งออกไม่สำเร็จ ลองใหม่');
        return false;
      }
      _downloadCanvas(canvas);
      return true;
    }

    async function renderPassportCardCanvas() {
      const card = document.getElementById('passportExportCard');
      if (!card) return null;

      // sync URL
      const urlEl = document.getElementById('exportSiteUrl');
      if (urlEl) urlEl.textContent = SITE_URL;

      // sync รูปจาก modal → export card (pre-crop เพราะ html2canvas ไม่รองรับ object-fit:cover)
      const modalImg = document.getElementById('passportImgView');
      const exportImg = document.getElementById('exportImgView');
      if (_userPhotoUploaded && modalImg && exportImg) {
        const croppedUrl = await _preCropImage(modalImg.src, 400, 420, _passportPhotoCrop);
        exportImg.src = croppedUrl;
        exportImg.style.objectFit = 'fill'; // รูป crop แล้ว แค่ fill เต็ม container
        await new Promise((resolve) => {
          if (exportImg.complete && exportImg.naturalHeight > 0) resolve();
          else { exportImg.onload = resolve; exportImg.onerror = resolve; setTimeout(resolve, 3000); }
        });
      }

      // ขยับ card มาหน้าจอชั่วคราว — ไม่เปลี่ยน position type เพื่อไม่ให้ layout เปลี่ยน
      card.style.left = '0px';
      card.style.top = '0px';
      card.style.width = '400px';   // บังคับ width ไม่ให้ยืด
      card.style.zIndex = '-1';
      card.style.pointerEvents = 'none';

      // delay ให้ browser paint ก่อน capture
      await new Promise(r => setTimeout(r, 150));

      const isLight = document.documentElement.getAttribute('data-theme') === 'light';

      try {
        return await html2canvas(card, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: isLight ? '#ffffff' : '#0a0518',
          logging: false
        });

      } catch (err) {
        console.error('Export error:', err);
        return null;
      } finally {
        _hideExportCard(card);
      }
    }

    function canUseImmediateMobileShare() {
      return isMobileSaveEnvironment() && window.isSecureContext && Boolean(navigator.share && navigator.canShare && window.File);
    }

    function setPassportSharePreparing(preparing) {
      if (!canUseImmediateMobileShare()) return;
      const button = document.getElementById('passportExportButton');
      const label = document.getElementById('passportExportButtonText');
      if (button) button.disabled = preparing;
      if (label) label.textContent = preparing ? '⏳ กำลังเตรียมรูป...' : '✓ พร้อมแชร์ / บันทึก';
    }

    function schedulePassportSharePreparation() {
      _preparedPassportShareFile = null;
      _preparedPassportShareDataUrl = '';
      const version = ++_passportSharePrepareVersion;
      if (_passportSharePrepareTimer) clearTimeout(_passportSharePrepareTimer);
      if (!canUseImmediateMobileShare()) return;
      setPassportSharePreparing(true);
      _passportSharePrepareTimer = setTimeout(async () => {
        const canvas = await renderPassportCardCanvas();
        if (!canvas || version !== _passportSharePrepareVersion) return;
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const blob = dataUrlToBlob(dataUrl);
          const file = new File([blob], 'spec_passport.png', { type: 'image/png' });
          if (!navigator.canShare({ files: [file] })) throw new Error('File sharing unavailable');
          _preparedPassportShareDataUrl = dataUrl;
          _preparedPassportShareFile = file;
        } catch (_) {
          _preparedPassportShareDataUrl = '';
          _preparedPassportShareFile = null;
        } finally {
          if (version === _passportSharePrepareVersion) setPassportSharePreparing(false);
        }
      }, 300);
    }

    function dataUrlToBlob(dataUrl) {
      const parts = dataUrl.split(',');
      const mimeMatch = parts[0].match(/data:([^;]+)/);
      const binary = atob(parts[1]);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return new Blob([bytes], { type: mimeMatch?.[1] || 'image/png' });
    }

    // Pre-crop รูปด้วย canvas → จำลอง object-fit:cover แบบ manual
    // html2canvas ไม่รองรับ object-fit:cover จึงต้อง crop เองก่อน
    function _preCropImage(imgSrc, targetW, targetH, cropState) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = function () {
          const c = document.createElement('canvas');
          c.width = targetW * 2;
          c.height = targetH * 2;
          const ctx = c.getContext('2d');
          const zoom = cropState && cropState.zoom ? cropState.zoom : 1;
          const panX = cropState && Number.isFinite(cropState.panX) ? cropState.panX : 0;
          const panY = cropState && Number.isFinite(cropState.panY) ? cropState.panY : 0;
          const coverScale = Math.max(c.width / img.width, c.height / img.height);
          const scale = coverScale * zoom;
          const drawWidth = img.width * scale;
          const drawHeight = img.height * scale;
          const maxX = Math.max(0, (drawWidth - c.width) / 2);
          const maxY = Math.max(0, (drawHeight - c.height) / 2);
          const offsetX = ((c.width - drawWidth) / 2) + (panX * maxX);
          const offsetY = ((c.height - drawHeight) / 2) + (panY * maxY);
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          resolve(c.toDataURL('image/jpeg', 0.92));
        };
        img.onerror = () => resolve(imgSrc);
        img.src = imgSrc;
      });
    }

    function _hideExportCard(card) {
      card.style.left = '-9999px';
      card.style.top = '0px';
      card.style.width = '400px';
      card.style.zIndex = '';
      card.style.pointerEvents = '';
    }

    let _preparedPassportFile = null;
    let _passportSaveObjectUrl = '';
    let _passportSaveReturnFocus = null;
    let _preparedShareTitle = 'MySex Spec Passport';

    function openPassportSavePreview(blob, dataUrl, options = {}) {
      const overlay = document.getElementById('passportSaveOverlay');
      const image = document.getElementById('passportSaveImage');
      const shareButton = document.getElementById('passportNativeShareButton');
      const hint = document.getElementById('passportSaveHint');
      const fileName = options.fileName || 'spec_passport.png';
      const shareTitle = options.shareTitle || 'MySex Spec Passport';
      const previewTitle = options.previewTitle || 'บันทึก Spec Passport';
      const titleElement = document.getElementById('passportSaveTitle');
      if (titleElement) titleElement.textContent = previewTitle;
      _preparedShareTitle = shareTitle;
      if (!overlay || !image) return;

      if (_passportSaveObjectUrl) {
        URL.revokeObjectURL(_passportSaveObjectUrl);
        _passportSaveObjectUrl = '';
      }

      _preparedPassportFile = null;
      if (blob) {
        _passportSaveObjectUrl = URL.createObjectURL(blob);
        image.src = _passportSaveObjectUrl;
        try {
          _preparedPassportFile = new File([blob], fileName, { type: 'image/png' });
        } catch (_) {
          _preparedPassportFile = null;
        }
      } else {
        image.src = dataUrl;
      }

      let canNativeShare = false;
      if (window.isSecureContext && _preparedPassportFile && navigator.share && navigator.canShare) {
        try {
          canNativeShare = navigator.canShare({ files: [_preparedPassportFile] });
        } catch (_) {
          canNativeShare = false;
        }
      }

      if (shareButton) shareButton.classList.toggle('available', canNativeShare);
      if (hint) {
        hint.textContent = canNativeShare
          ? 'กดปุ่มด้านล่างเพื่อเปิดเมนูแชร์ หรือกดค้างที่รูปเพื่อบันทึก'
          : 'กดค้างที่รูป แล้วเลือก “บันทึกรูปภาพ” หรือ “เพิ่มไปยังรูปภาพ”';
      }

      _passportSaveReturnFocus = document.activeElement;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => document.getElementById('passportSaveCloseButton')?.focus());
      showToast('📲 สร้างรูปแล้ว — กดค้างที่รูปเพื่อบันทึก');
    }

    function closePassportSavePreview() {
      const overlay = document.getElementById('passportSaveOverlay');
      if (overlay) overlay.classList.remove('open');
      document.body.style.overflow = '';
      restoreModalFocus(_passportSaveReturnFocus);
      _passportSaveReturnFocus = null;
    }

    async function sharePreparedPassport() {
      if (!_preparedPassportFile || !navigator.share) return;
      try {
        await navigator.share({
          files: [_preparedPassportFile],
          title: _preparedShareTitle
        });
      } catch (error) {
        if (error && error.name !== 'AbortError') {
          showToast('กดค้างที่รูปเพื่อบันทึกแทนได้');
        }
      }
    }

    function isMobileSaveEnvironment() {
      const userAgent = navigator.userAgent || '';
      const isMobileUserAgent = /iPhone|iPad|iPod|Android/i.test(userAgent);
      const isTouchIPad = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
      return isMobileUserAgent || isTouchIPad;
    }

    function updateExportActionLabels() {
      const isMobile = isMobileSaveEnvironment();
      const passportLabel = document.getElementById('passportExportButtonText');
      const medicalButton = document.getElementById('medicalExportButton');
      if (passportLabel) passportLabel.textContent = isMobile ? '📲 แชร์ / บันทึก' : '💾 ดาวน์โหลด PNG';
      if (medicalButton) medicalButton.textContent = isMobile ? '📲 แชร์ / บันทึก Deep Analysis' : '💾 ดาวน์โหลด Deep Analysis (PNG)';
    }

    async function tryNativeShareBlob(blob, options = {}) {
      if (!window.isSecureContext || !blob || !navigator.share || !navigator.canShare) return false;
      const fileName = options.fileName || 'spec_passport.png';
      const shareTitle = options.shareTitle || 'MySex Spec Passport';
      let file;
      try {
        file = new File([blob], fileName, { type: 'image/png' });
        if (!navigator.canShare({ files: [file] })) return false;
      } catch (_) {
        return false;
      }

      try {
        await navigator.share({ files: [file], title: shareTitle });
        return true;
      } catch (error) {
        return error?.name === 'AbortError';
      }
    }

    function _downloadCanvas(canvas, options = {}) {
      const fileName = options.fileName || 'spec_passport.png';
      const shareTitle = options.shareTitle || 'MySex Spec Passport';
      const previewTitle = options.previewTitle || 'บันทึก Spec Passport';
      const isMobile = isMobileSaveEnvironment();
      if (!isMobile) {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('✅ บันทึกการ์ดเรียบร้อย!');
        return;
      }

      const fallbackDataUrl = canvas.toDataURL('image/png');
      if (typeof canvas.toBlob !== 'function') {
        openPassportSavePreview(null, fallbackDataUrl, { fileName, shareTitle, previewTitle });
        return;
      }

      canvas.toBlob(async function (blob) {
        if (await tryNativeShareBlob(blob, { fileName, shareTitle })) return;
        openPassportSavePreview(blob, fallbackDataUrl, { fileName, shareTitle, previewTitle });
      }, 'image/png');
    }

    function downloadPassportCard() { exportPassportCard(); }

    function downloadMedicalReport() {
      const validation = validateMeasurementsForAction({ onInvalid: closeMedicalModal });
      if (!validation.valid || !calculate(true, false)) return false;
      const report = latestMetricsSnapshot;
      if (!report) return false;
      const { l_flaccid, g_flaccid, l_erect, g_erect, t_fat } = report.measurements;
      const canvas = document.createElement('canvas');
      canvas.width = 600; canvas.height = 440;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 600, 440);
      ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 4; ctx.strokeRect(10, 10, 580, 420);

      ctx.fillStyle = '#0369a1'; ctx.font = 'bold 20px Prompt, sans-serif';
      ctx.fillText('🔬 MALE ANATOMICAL DEEP ANALYSIS', 30, 45);

      ctx.fillStyle = '#64748b'; ctx.font = '14px Prompt, sans-serif';
      let now = new Date();
      ctx.fillText(`วันที่คำนวณ: ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`, 30, 75);

      ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(30, 90); ctx.lineTo(570, 90); ctx.stroke();

      ctx.fillStyle = '#0f172a'; ctx.font = '15px Prompt, sans-serif';
      ctx.fillText(`🔹 สรีระอ่อนตัว (Flaccid): ${formatMetricNumber(l_flaccid)} × ${formatMm(g_flaccid)}`, 30, 125);
      ctx.fillText(`🔹 สรีระแข็งตัว (Erect): ${formatMetricNumber(l_erect)} × ${formatMm(g_erect)}`, 30, 155);
      ctx.fillText(`🔹 ความยาวชิดกระดูก (BPEL): ${formatMetricNumber(l_erect)} + ${formatMetricNumber(t_fat)} = ${formatMm(report.bpelMm)}`, 30, 185);
      ctx.fillText(`🔹 ดัชนีควยเลือด (BFPI): ${report.bfpi.toFixed(2)}`, 30, 215);
      ctx.fillText(`🔹 ปริมาตรเพิ่มโดยประมาณ (ΔV): ${report.bloodVolumeCc >= 0 ? '+' : ''}${report.bloodVolumeCc.toFixed(1)} cc · แบบจำลองทรงกระบอก`, 30, 245);
      ctx.fillText(`🔹 ไซส์ถุงยางโดยประมาณ: ${formatMm(report.bestSize)}${report.condomIsLargestAvailable ? ' · ไซส์ใหญ่สุดที่มี' : report.condomInRange ? ' · ใกล้เคียง' : ' · นอกช่วง 47–72 มม. ตรวจผู้ผลิต'}`, 30, 275);
      ctx.fillText(`🔹 สถิติความยาวเปรียบเทียบ: Top ${(100 - report.lengthPercentile).toFixed(2)}%`, 30, 305);
      ctx.fillText(`🔹 สถิติรอบวงเปรียบเทียบ: Top ${(100 - report.girthPercentile).toFixed(2)}%`, 30, 335);

      ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(30, 370); ctx.lineTo(570, 370); ctx.stroke();
      ctx.fillStyle = '#0369a1'; ctx.font = 'bold 12px Prompt, sans-serif';
      ctx.fillText('PERSONAL SPEC ANALYSIS • MYSEX', 30, 410);

      _downloadCanvas(canvas, {
        fileName: 'MySex_Deep_Analysis.png',
        shareTitle: 'MySex Deep Analysis',
        previewTitle: 'บันทึก Deep Analysis'
      });
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }
